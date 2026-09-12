import { test } from '@japa/runner'
import { RedisContainer } from '@testcontainers/redis'
import type { StartedRedisContainer } from '@testcontainers/redis'
import { LogLevel } from '@cepseudo/shared'
import { DigitalTwinEngine } from '../src/digital_twin_engine.js'
import { TestCollector } from './fixtures/mock_components.js'
import { MockDatabaseAdapter } from './fixtures/mock_database.js'
import { MockStorageService } from './fixtures/mock_storage.js'
import { freePort } from './fixtures/free_port.js'

test.group('Engine health when Redis disappears', () => {
    test('readiness turns 503 within the check timeout and shutdown still completes in bounded time', async ({ assert }) => {
        const redis: StartedRedisContainer = await new RedisContainer('redis:7-alpine').start()
        const port = await freePort()
        const engine = new DigitalTwinEngine({
            storage: new MockStorageService(),
            database: new MockDatabaseAdapter(),
            redis: { host: redis.getHost(), port: redis.getMappedPort(6379) },
            server: { port },
            logging: { level: LogLevel.SILENT },
            health: { checkTimeoutMs: 1500 },
        })
        engine.register(new TestCollector('needs-redis'))
        engine.setShutdownTimeout(9000)

        let stopped = false
        try {
            await engine.start()
            const ready = await fetch(`http://127.0.0.1:${port}/api/health/ready`)
            assert.equal(ready.status, 200)

            await redis.stop()

            const started = Date.now()
            const notReady = await fetch(`http://127.0.0.1:${port}/api/health/ready`)
            const body = (await notReady.json()) as { status: string; checks: Record<string, { status: string }> }
            assert.isBelow(Date.now() - started, 5000, 'health endpoint must not hang')
            assert.equal(notReady.status, 503)
            assert.equal(body.status, 'unhealthy')
            assert.equal(body.checks['redis'].status, 'down')

            const stopStarted = Date.now()
            await engine.stop()
            stopped = true
            assert.isBelow(Date.now() - stopStarted, 20000, 'shutdown must stay bounded without Redis')
        } finally {
            if (!stopped) await engine.stop().catch(() => {})
        }
    }).timeout(60_000)
})
