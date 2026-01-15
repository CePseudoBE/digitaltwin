import { test } from '@japa/runner'
import { setupGracefulShutdown } from '../../src/utils/graceful_shutdown.js'
import { DigitalTwinEngine } from '../../src/engine/digital_twin_engine.js'
import { MockDatabaseAdapter } from '../mocks/mock_database_adapter.js'
import { MockStorageService } from '../mocks/mock_storage_service.js'

test.group('setupGracefulShutdown', () => {
    test('registers signal handlers for default signals', ({ assert }) => {
        const db = new MockDatabaseAdapter()
        const storage = new MockStorageService()
        const engine = new DigitalTwinEngine({ database: db, storage })

        const originalListenerCounts = {
            SIGTERM: process.listenerCount('SIGTERM'),
            SIGINT: process.listenerCount('SIGINT')
        }

        const cleanup = setupGracefulShutdown(engine)

        // Verify handlers were added
        assert.equal(process.listenerCount('SIGTERM'), originalListenerCounts.SIGTERM + 1)
        assert.equal(process.listenerCount('SIGINT'), originalListenerCounts.SIGINT + 1)

        // Cleanup
        cleanup()

        // Verify handlers were removed
        assert.equal(process.listenerCount('SIGTERM'), originalListenerCounts.SIGTERM)
        assert.equal(process.listenerCount('SIGINT'), originalListenerCounts.SIGINT)
    })

    test('registers handlers for custom signals', ({ assert }) => {
        const db = new MockDatabaseAdapter()
        const storage = new MockStorageService()
        const engine = new DigitalTwinEngine({ database: db, storage })

        const originalCount = process.listenerCount('SIGUSR1')

        const cleanup = setupGracefulShutdown(engine, {
            signals: ['SIGUSR1']
        })

        assert.equal(process.listenerCount('SIGUSR1'), originalCount + 1)

        cleanup()

        assert.equal(process.listenerCount('SIGUSR1'), originalCount)
    })

    test('cleanup function removes all handlers', ({ assert }) => {
        const db = new MockDatabaseAdapter()
        const storage = new MockStorageService()
        const engine = new DigitalTwinEngine({ database: db, storage })

        const signals: NodeJS.Signals[] = ['SIGTERM', 'SIGINT']
        const originalCounts = signals.map(s => process.listenerCount(s))

        const cleanup = setupGracefulShutdown(engine, { signals })

        // All signals should have +1 listener
        signals.forEach((signal, i) => {
            assert.equal(process.listenerCount(signal), originalCounts[i] + 1)
        })

        cleanup()

        // All signals should be back to original
        signals.forEach((signal, i) => {
            assert.equal(process.listenerCount(signal), originalCounts[i])
        })
    })

    test('cleanup can be called multiple times safely', ({ assert }) => {
        const db = new MockDatabaseAdapter()
        const storage = new MockStorageService()
        const engine = new DigitalTwinEngine({ database: db, storage })

        const originalCount = process.listenerCount('SIGTERM')

        const cleanup = setupGracefulShutdown(engine)

        cleanup()
        cleanup() // Should not throw
        cleanup()

        assert.equal(process.listenerCount('SIGTERM'), originalCount)
    })

    test('uses custom logger when provided', ({ assert }) => {
        const db = new MockDatabaseAdapter()
        const storage = new MockStorageService()
        const engine = new DigitalTwinEngine({ database: db, storage })

        const logs: string[] = []
        const customLogger = (msg: string) => logs.push(msg)

        const cleanup = setupGracefulShutdown(engine, {
            logger: customLogger
        })

        // Logger is called during shutdown, not during setup
        // So we just verify it was accepted without error
        assert.isFunction(cleanup)

        cleanup()
    })

    test('accepts timeout option', ({ assert }) => {
        const db = new MockDatabaseAdapter()
        const storage = new MockStorageService()
        const engine = new DigitalTwinEngine({ database: db, storage })

        // Should not throw with custom timeout
        const cleanup = setupGracefulShutdown(engine, {
            timeout: 60000
        })

        assert.isFunction(cleanup)

        cleanup()
    })

    test('accepts onShutdown callback option', ({ assert }) => {
        const db = new MockDatabaseAdapter()
        const storage = new MockStorageService()
        const engine = new DigitalTwinEngine({ database: db, storage })

        let callbackProvided = false

        const cleanup = setupGracefulShutdown(engine, {
            onShutdown: async () => {
                callbackProvided = true
            }
        })

        // Callback is called during shutdown, not during setup
        assert.isFunction(cleanup)

        cleanup()
    })
})
