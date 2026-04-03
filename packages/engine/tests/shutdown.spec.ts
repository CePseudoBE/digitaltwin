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
    test('stop() is idempotent — second call returns immediately', async ({ assert }) => {
        const engine = createEngine()

        await engine.stop()

        const start = Date.now()
        await engine.stop()
        assert.isBelow(Date.now() - start, 50)
    })
})

test.group('setupGracefulShutdown', () => {
    // engine.stop is stubbed in signal tests to isolate the onShutdown behavior
    // from the engine's own async teardown sequence and its process.exit(0) call.

    test('onShutdown callback runs when a signal is received', async ({ assert }) => {
        const engine = createEngine()
        engine.stop = async () => {}

        const originalExit = process.exit
        process.exit = (() => {}) as any

        try {
            let shutdownRan = false
            const shutdownDone = new Promise<void>(resolve => {
                setupGracefulShutdown(engine, {
                    signals: ['SIGUSR2'],
                    logger: () => {},
                    onShutdown: async () => {
                        shutdownRan = true
                        resolve()
                    }
                })
            })

            process.emit('SIGUSR2' as any)
            await shutdownDone

            assert.isTrue(shutdownRan)

            // Wait for the rest of the shutdown sequence (engine.stop → process.exit)
            // to complete while process.exit is still mocked, avoiding a race condition.
            await new Promise(resolve => setTimeout(resolve, 50))
        } finally {
            process.exit = originalExit
        }
    })

    test('after cleanup(), signals no longer trigger shutdown', async ({ assert }) => {
        const engine = createEngine()
        engine.stop = async () => {}

        const originalExit = process.exit
        process.exit = (() => {}) as any

        try {
            let shutdownRan = false
            const cleanup = setupGracefulShutdown(engine, {
                signals: ['SIGUSR2'],
                logger: () => {},
                onShutdown: async () => { shutdownRan = true }
            })

            cleanup()

            process.emit('SIGUSR2' as any)
            await new Promise(resolve => setTimeout(resolve, 100))

            assert.isFalse(shutdownRan)
        } finally {
            process.exit = originalExit
        }
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
