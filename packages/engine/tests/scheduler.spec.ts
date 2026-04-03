import { test } from '@japa/runner'
import { Redis } from 'ioredis'
import { RedisContainer } from '@testcontainers/redis'
import { scheduleComponents } from '../src/scheduler.js'
import { QueueManager } from '../src/queue_manager.js'
import { MockDatabaseAdapter } from './fixtures/mock_database.js'
import { MockStorageService } from './fixtures/mock_storage.js'
import { TestCollector, TestHarvester } from './fixtures/mock_components.js'

function waitForWorkerEvent(worker: { on: (event: string, cb: (...args: any[]) => void) => void }, event: string, timeoutMs = 10000): Promise<void> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`Timed out waiting for worker '${event}' event`)), timeoutMs)
        worker.on(event, () => { clearTimeout(timer); resolve() })
    })
}

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

    test('collector job is processed and data is persisted in the database', async ({ assert }) => {
        const collector = new TestCollector('c1')
        collector.setDependencies(db, storage)

        const workers = await scheduleComponents([collector], queueManager, true)
        const collectorWorker = workers[0]

        await queueManager.collectorQueue.add('c1', { type: 'collector', triggeredBy: 'schedule' })
        await waitForWorkerEvent(collectorWorker, 'completed')

        const saved = await db.getLatestByName('c1')
        assert.isNotNull(saved)
        assert.equal(saved!.name, 'c1')

        for (const w of workers) await w.close()
    })

    test('event-triggered harvester produces output when source collector completes', async ({ assert }) => {
        const collector = new TestCollector('source')
        const harvester = new TestHarvester('processed', [], 'source', 'on-source')
        collector.setDependencies(db, storage)
        harvester.setDependencies(db, storage)

        const workers = await scheduleComponents([collector, harvester], queueManager, true)
        const harvesterWorker = workers[1]

        // Collect source data — also emits collector:completed which triggers the harvester
        await collector.run()

        await waitForWorkerEvent(harvesterWorker, 'completed')

        const processed = await db.getLatestByName('processed')
        assert.isNotNull(processed)
        assert.equal(processed!.name, 'processed')

        for (const w of workers) await w.close()
    })
})
