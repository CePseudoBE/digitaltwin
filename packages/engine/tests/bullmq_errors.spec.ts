import { test } from '@japa/runner'
import { RedisContainer } from '@testcontainers/redis'
import type { StartedRedisContainer } from '@testcontainers/redis'
import { Logger } from '@cepseudo/shared'
import { QueueManager } from '../src/queue_manager.js'
import { scheduleComponents } from '../src/scheduler.js'
import { TestCollector } from './fixtures/mock_components.js'
import { MockDatabaseAdapter } from './fixtures/mock_database.js'
import { MockStorageService } from './fixtures/mock_storage.js'

const REDIS_ERROR = new Error('Connection is closed.')

test.group('BullMQ error events', group => {
    let redis: StartedRedisContainer
    let queueManager: QueueManager
    let warnings: string[]

    group.setup(async () => {
        redis = await new RedisContainer('redis:7-alpine').start()
        return async () => {
            await redis.stop()
        }
    })

    group.each.setup(() => {
        const originalWarn = Logger.prototype.warn
        warnings = []
        Logger.prototype.warn = (message: string) => {
            warnings.push(message)
        }
        queueManager = new QueueManager({ redis: { host: redis.getHost(), port: redis.getPort() } })
        return async () => {
            Logger.prototype.warn = originalWarn
            await queueManager.close()
        }
    })

    test('queue errors go through the logger', async ({ assert }) => {
        const queues = [queueManager.collectorQueue, queueManager.harvesterQueue, queueManager.priorityQueue, queueManager.uploadQueue]
        await Promise.all(queues.map(queue => queue.waitUntilReady()))

        for (const queue of queues) queue.emit('error', REDIS_ERROR)

        assert.deepEqual(warnings, queues.map(queue => `Queue ${queue.name} error: Connection is closed.`))
    })

    test('scheduled worker errors go through the logger', async ({ assert }) => {
        const storage = new MockStorageService()
        const collector = new TestCollector('c1')
        collector.setDependencies(new MockDatabaseAdapter({ storage }), storage)
        const workers = await scheduleComponents([collector], queueManager, true)
        try {
            await Promise.all(workers.map(worker => worker.waitUntilReady()))

            for (const worker of workers) worker.emit('error', REDIS_ERROR)

            assert.deepEqual(warnings, workers.map(worker => `Worker ${worker.name} error: Connection is closed.`))
        } finally {
            await Promise.all(workers.map(worker => worker.close()))
        }
    })
})
