import { test } from '@japa/runner'
import { Redis } from 'ioredis'
import { RedisContainer } from '@testcontainers/redis'
import { scheduleComponents } from '../src/scheduler.js'
import { QueueManager } from '../src/queue_manager.js'
import { MockDatabaseAdapter } from './fixtures/mock_database.js'
import { MockStorageService } from './fixtures/mock_storage.js'
import { TestCollector, TestHarvester } from './fixtures/mock_components.js'
import { engineEventBus } from '@cepseudo/shared'

test.group('Scheduler (Redis integration)', (group) => {
    let redisContainer: any
    let redis: Redis
    let queueManager: QueueManager
    let db: MockDatabaseAdapter
    let storage: MockStorageService

    group.each.setup(async () => {
        redisContainer = await new RedisContainer('redis:7-alpine').start()
        redis = new Redis({
            host: redisContainer.getHost(),
            port: redisContainer.getPort(),
            maxRetriesPerRequest: null,
        })
        queueManager = new QueueManager({ redis })
        storage = new MockStorageService()
        db = new MockDatabaseAdapter({ storage })
    })

    group.each.teardown(async () => {
        await queueManager.close()
        await redis.quit()
        await redisContainer.stop()
    })

    test('creates workers for scheduled collectors and harvesters', async ({ assert }) => {
        const collector = new TestCollector('c1')
        const harvester = new TestHarvester('h1')
        collector.setDependencies(db, storage)
        harvester.setDependencies(db, storage)

        const workers = await scheduleComponents([collector, harvester], queueManager, true)

        assert.isAbove(workers.length, 0)
        assert.isTrue(workers.every(w => typeof w.close === 'function'))

        for (const w of workers) await w.close()
    })

    test('event-triggered harvester fires on collector completion', async ({ assert }) => {
        const collector = new TestCollector('source')
        const harvester = new TestHarvester('triggered', [], 'source', 'on-source')
        collector.setDependencies(db, storage)
        harvester.setDependencies(db, storage)

        let triggered = false
        const origRun = harvester.run.bind(harvester)
        harvester.run = async () => { triggered = true; await origRun(); return true }

        const workers = await scheduleComponents([collector, harvester], queueManager, true)

        engineEventBus.emit('component:event', {
            type: 'collector:completed',
            componentName: 'source',
            timestamp: new Date(),
            data: { success: true },
        })

        // Wait for event processing
        await new Promise(res => setTimeout(res, 200))
        assert.isTrue(triggered)

        for (const w of workers) await w.close()
    })
})
