import { test } from '@japa/runner'
import { inspect } from 'node:util'
import { RedisContainer } from '@testcontainers/redis'
import type { StartedRedisContainer } from '@testcontainers/redis'
import { LogLevel } from '@cepseudo/shared'
import { DigitalTwinEngine } from '../src/digital_twin_engine.js'
import { TestCollector } from './fixtures/mock_components.js'
import { MockDatabaseAdapter } from './fixtures/mock_database.js'
import { MockStorageService } from './fixtures/mock_storage.js'

// BullMQ prints connection errors with console.error when nothing listens to them
async function countReconnectErrors(port: number, windowMs: number): Promise<number> {
    const original = console.error
    let count = 0
    console.error = (error: unknown) => {
        if (inspect(error).includes(`:${port}`)) count++
    }
    try {
        await new Promise(resolve => setTimeout(resolve, windowMs))
    } finally {
        console.error = original
    }
    return count
}

test.group('Engine health when Redis disappears', () => {
    test('readiness turns 503 within the check timeout and shutdown still completes in bounded time', async ({ assert }) => {
        const redis: StartedRedisContainer = await new RedisContainer('redis:7-alpine').start()
        const redisPort = redis.getMappedPort(6379)
        const engine = new DigitalTwinEngine({
            storage: new MockStorageService(),
            database: new MockDatabaseAdapter(),
            redis: { host: redis.getHost(), port: redisPort },
            server: { port: 0 },
            logging: { level: LogLevel.SILENT },
            health: { checkTimeoutMs: 1500 },
        })
        engine.register(new TestCollector('needs-redis'))
        engine.setShutdownTimeout(9000)

        let stopped = false
        try {
            await engine.start()
            const port = engine.getPort()
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

            // ioredis retries at most every 2 s, so a leaked connection shows up inside this window
            assert.equal(await countReconnectErrors(redisPort, 2500), 0, 'no connection may keep reconnecting after stop()')
        } finally {
            if (!stopped) await engine.stop().catch(() => {})
        }
    }).timeout(60_000)
})
