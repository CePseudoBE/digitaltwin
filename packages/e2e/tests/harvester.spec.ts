import { test } from '@japa/runner'
import { setupInfrastructure, type E2EInfrastructure } from './helpers/setup.js'
import { WeatherCollector, WeatherAverageHarvester } from './helpers/test_components.js'

test.group('Harvester E2E', (group) => {
    let infra: E2EInfrastructure
    let collector: WeatherCollector
    let harvester: WeatherAverageHarvester

    group.setup(async () => {
        infra = await setupInfrastructure()

        collector = new WeatherCollector()
        collector.setDependencies(infra.db, infra.storage)

        harvester = new WeatherAverageHarvester()
        harvester.setDependencies(infra.db, infra.storage)

        // Create tables
        await infra.db.createTable(collector.getConfiguration().name)
        await infra.db.createTable(harvester.getConfiguration().name)
    })

    group.teardown(async () => {
        await infra.cleanup()
    })

    test('run() returns false when no source data exists', async ({ assert }) => {
        const result = await harvester.run()
        assert.isFalse(result)
    })

    test('run() processes source data from collector', async ({ assert }) => {
        // Populate source data
        await collector.run()
        await collector.run()
        await collector.run()

        // Harvester should process the source data
        const result = await harvester.run()
        assert.isTrue(result)

        // Verify harvested data exists
        const response = await harvester.retrieve()
        assert.equal(response.status, 200)

        const parsed = JSON.parse(response.content.toString())
        assert.properties(parsed, ['averageTemperature', 'sampleCount'])
        assert.equal(parsed.averageTemperature, 22.5)
        assert.isAbove(parsed.sampleCount, 0)
    })

    test('source_range limits the records harvested', async ({ assert }) => {
        // Run collector several more times
        for (let i = 0; i < 3; i++) {
            await collector.run()
        }

        // Run harvester again - it should process the next batch
        const result = await harvester.run()
        assert.isTrue(result)

        const latest = await infra.db.getLatestByName(harvester.getConfiguration().name)
        assert.isDefined(latest)
        const data = JSON.parse((await latest!.data()).toString())
        assert.isAtMost(data.sampleCount, 5) // source_range is 5
    })
})
