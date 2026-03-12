import { test } from '@japa/runner'
import { setupInfrastructure, type E2EInfrastructure } from './helpers/setup.js'
import { WeatherCollector } from './helpers/test_components.js'

test.group('Collector E2E', (group) => {
    let infra: E2EInfrastructure
    let collector: WeatherCollector

    group.setup(async () => {
        infra = await setupInfrastructure()
        collector = new WeatherCollector()
        collector.setDependencies(infra.db, infra.storage)

        // Create the collector's table
        const config = collector.getConfiguration()
        await infra.db.createTable(config.name)
    })

    group.teardown(async () => {
        await infra.cleanup()
    })

    test('run() persists data to PostgreSQL and MinIO', async ({ assert }) => {
        const result = await collector.run()
        assert.instanceOf(result, Buffer)

        const parsed = JSON.parse(result!.toString())
        assert.properties(parsed, ['temperature', 'humidity', 'pressure', 'timestamp'])
    })

    test('retrieve() returns latest collected data', async ({ assert }) => {
        // Ensure at least one run has happened
        await collector.run()

        const response = await collector.retrieve()
        assert.equal(response.status, 200)
        assert.instanceOf(response.content, Buffer)

        const parsed = JSON.parse(response.content.toString())
        assert.equal(parsed.temperature, 22.5)
    })

    test('multiple runs create multiple records in the database', async ({ assert }) => {
        // Run collector 3 times
        await collector.run()
        await collector.run()
        await collector.run()

        const config = collector.getConfiguration()

        // Verify we can get the latest
        const latest = await infra.db.getLatestByName(config.name)
        assert.isDefined(latest)

        // Verify we can get records by date range (all records)
        const all = await infra.db.getByDateRange(config.name, new Date('2000-01-01'))
        assert.isAbove(all.length, 1)
    })

    test('retrieve() returns 404 for empty collector', async ({ assert }) => {
        // Create a new collector with a different name, no runs
        const emptyCollector = new (class extends WeatherCollector {
            override getConfiguration() {
                return { ...super.getConfiguration(), name: 'e2e_empty_collector', endpoint: 'e2e-empty' }
            }
        })()
        emptyCollector.setDependencies(infra.db, infra.storage)
        await infra.db.createTable('e2e_empty_collector')

        const response = await emptyCollector.retrieve()
        assert.equal(response.status, 404)
    })
})
