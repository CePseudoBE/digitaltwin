import { test } from '@japa/runner'
import { Queue } from 'bullmq'
import { RedisContainer } from '@testcontainers/redis'
import type { StartedRedisContainer } from '@testcontainers/redis'
import { LogLevel } from '@cepseudo/shared'
import { DigitalTwinEngine } from '../src/digital_twin_engine.js'
import { TestCollector, TestAssetsManager, TestCustomTableManager } from './fixtures/mock_components.js'
import { MockDatabaseAdapter } from './fixtures/mock_database.js'
import { MockStorageService } from './fixtures/mock_storage.js'

/** Records which tables the engine asked for, whichever adapter method it used. */
class RecordingDatabase extends MockDatabaseAdapter {
    readonly requested: string[] = []

    override async createTable(name: string): Promise<void> {
        this.requested.push(name)
        await super.createTable(name)
    }

    override async createTableWithColumns(name: string, columns: Record<string, string>): Promise<void> {
        this.requested.push(name)
        await super.createTableWithColumns(name, columns)
    }
}

test.group('Engine.start() with components added after construction', group => {
    let redis: StartedRedisContainer
    let connection: { host: string; port: number }

    group.setup(async () => {
        redis = await new RedisContainer('redis:7-alpine').start()
        connection = { host: redis.getHost(), port: redis.getMappedPort(6379) }
    })

    group.teardown(async () => {
        await redis.stop()
    })

    test('initialises and schedules a collector, an assets manager and a custom table registered late', async ({ assert }) => {
        const database = new RecordingDatabase()
        const engine = new DigitalTwinEngine({
            storage: new MockStorageService(),
            database,
            redis: connection,
            server: { port: 0 },
            logging: { level: LogLevel.SILENT },
        })

        engine.register(new TestCollector('late-collector'))
        engine.register(new TestAssetsManager('late-assets'))
        engine.register(new TestCustomTableManager('late-table'))

        try {
            await engine.start()

            // Tables created for every late component, so dependencies were injected
            assert.includeMembers(database.requested, ['late-collector', 'late-assets', 'late-table'])

            // A queue manager exists (it registers the Redis health check)
            assert.include(engine.getHealthCheckNames(), 'redis')

            // The collector's cron job is registered on the collectors queue
            const queue = new Queue('dt-collectors', { connection })
            try {
                const schedulers = await queue.getJobSchedulers()
                assert.isTrue(schedulers.some(s => s.key === 'late-collector' || s.name === 'late-collector'), JSON.stringify(schedulers))
            } finally {
                await queue.close()
            }
        } finally {
            await engine.stop()
        }
    })

    test('start() twice throws instead of registering everything a second time', async ({ assert }) => {
        const engine = new DigitalTwinEngine({
            storage: new MockStorageService(),
            database: new MockDatabaseAdapter(),
            server: { port: 0 },
            logging: { level: LogLevel.SILENT },
        })

        try {
            await engine.start()
            await assert.rejects(() => engine.start(), /called twice/)
        } finally {
            await engine.stop()
        }
    })
})
