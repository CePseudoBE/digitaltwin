import { test } from '@japa/runner'
import { DigitalTwinEngine } from '../src/digital_twin_engine.js'
import { setupGracefulShutdown } from '../src/graceful_shutdown.js'
import { MockDatabaseAdapter } from './fixtures/mock_database.js'
import { MockStorageService } from './fixtures/mock_storage.js'

function createEngine() {
    return new DigitalTwinEngine({
        database: new MockDatabaseAdapter(),
        storage: new MockStorageService()
    })
}

test.group('Engine shutdown', () => {
    test('stop() sets isShuttingDown flag', async ({ assert }) => {
        const engine = createEngine()

        assert.isFalse(engine.isShuttingDown())
        await engine.stop()
        assert.isTrue(engine.isShuttingDown())
    })

    test('stop() is idempotent — second call returns immediately', async ({ assert }) => {
        const engine = createEngine()

        await engine.stop()

        const start = Date.now()
        await engine.stop()
        assert.isBelow(Date.now() - start, 50)
    })
})

test.group('setupGracefulShutdown', () => {
    test('registers and removes signal handlers', ({ assert }) => {
        const engine = createEngine()
        const before = {
            SIGTERM: process.listenerCount('SIGTERM'),
            SIGINT: process.listenerCount('SIGINT')
        }

        const cleanup = setupGracefulShutdown(engine)

        assert.equal(process.listenerCount('SIGTERM'), before.SIGTERM + 1)
        assert.equal(process.listenerCount('SIGINT'), before.SIGINT + 1)

        cleanup()

        assert.equal(process.listenerCount('SIGTERM'), before.SIGTERM)
        assert.equal(process.listenerCount('SIGINT'), before.SIGINT)
    })

    test('supports custom signal list', ({ assert }) => {
        const engine = createEngine()
        const before = process.listenerCount('SIGUSR1')

        const cleanup = setupGracefulShutdown(engine, { signals: ['SIGUSR1'] })
        assert.equal(process.listenerCount('SIGUSR1'), before + 1)

        cleanup()
        assert.equal(process.listenerCount('SIGUSR1'), before)
    })

    test('cleanup can be called multiple times safely', ({ assert }) => {
        const engine = createEngine()
        const before = process.listenerCount('SIGTERM')

        const cleanup = setupGracefulShutdown(engine)
        cleanup()
        cleanup()
        cleanup()

        assert.equal(process.listenerCount('SIGTERM'), before)
    })

    test('invokes engine.stop() when signal handler fires', async ({ assert }) => {
        const engine = createEngine()
        let stopCalled = false

        // Override stop to track call without actually exiting
        const originalStop = engine.stop.bind(engine)
        engine.stop = async () => {
            stopCalled = true
            // Don't call originalStop to avoid process.exit
        }

        // Override process.exit to prevent test from exiting
        const originalExit = process.exit
        process.exit = (() => {}) as any

        const cleanup = setupGracefulShutdown(engine, {
            signals: ['SIGUSR2'],
            logger: () => {} // suppress logs
        })

        // Simulate the signal
        process.emit('SIGUSR2' as any)

        // Give async handler time to run
        await new Promise(resolve => setTimeout(resolve, 50))

        assert.isTrue(stopCalled)

        cleanup()
        process.exit = originalExit
    })
})

test.group('Engine health check registration', () => {
    test('registerHealthCheck adds and removeHealthCheck removes', ({ assert }) => {
        const engine = createEngine()

        engine.registerHealthCheck('custom', async () => ({ status: 'up' }))
        assert.include(engine.getHealthCheckNames(), 'custom')

        const removed = engine.removeHealthCheck('custom')
        assert.isTrue(removed)
        assert.notInclude(engine.getHealthCheckNames(), 'custom')
    })

    test('removeHealthCheck returns false for unknown check', ({ assert }) => {
        const engine = createEngine()
        assert.isFalse(engine.removeHealthCheck('non-existent'))
    })
})
