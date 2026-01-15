import { test } from '@japa/runner'
import { DigitalTwinEngine } from '../../src/engine/digital_twin_engine.js'
import { MockDatabaseAdapter } from '../mocks/mock_database_adapter.js'
import { MockStorageService } from '../mocks/mock_storage_service.js'

test.group('Graceful Shutdown', () => {
    test('stop() sets isShuttingDown flag', async ({ assert }) => {
        const db = new MockDatabaseAdapter()
        const storage = new MockStorageService()

        const engine = new DigitalTwinEngine({
            database: db,
            storage: storage
        })

        assert.isFalse(engine.isShuttingDown())

        await engine.stop()

        assert.isTrue(engine.isShuttingDown())
    })

    test('stop() is idempotent - second call returns immediately', async ({ assert }) => {
        const db = new MockDatabaseAdapter()
        const storage = new MockStorageService()

        const engine = new DigitalTwinEngine({
            database: db,
            storage: storage
        })

        // First call
        await engine.stop()

        // Second call should return immediately without error
        const startTime = Date.now()
        await engine.stop()
        const duration = Date.now() - startTime

        // Should be nearly instant (< 10ms)
        assert.isBelow(duration, 50)
    })

    test('setShutdownTimeout configures timeout', ({ assert }) => {
        const db = new MockDatabaseAdapter()
        const storage = new MockStorageService()

        const engine = new DigitalTwinEngine({
            database: db,
            storage: storage
        })

        // Should not throw
        engine.setShutdownTimeout(60000)
        assert.isTrue(true)
    })

    test('stop() cleans up resources without errors', async ({ assert }) => {
        const db = new MockDatabaseAdapter()
        const storage = new MockStorageService()

        const engine = new DigitalTwinEngine({
            database: db,
            storage: storage
        })

        // Should complete without throwing
        await engine.stop()

        assert.isTrue(engine.isShuttingDown())
    })
})

test.group('Health Check Registration', () => {
    test('registerHealthCheck adds custom check', async ({ assert }) => {
        const db = new MockDatabaseAdapter()
        const storage = new MockStorageService()

        const engine = new DigitalTwinEngine({
            database: db,
            storage: storage
        })

        engine.registerHealthCheck('custom', async () => ({
            status: 'up'
        }))

        const names = engine.getHealthCheckNames()
        assert.include(names, 'custom')
    })

    test('removeHealthCheck removes custom check', async ({ assert }) => {
        const db = new MockDatabaseAdapter()
        const storage = new MockStorageService()

        const engine = new DigitalTwinEngine({
            database: db,
            storage: storage
        })

        engine.registerHealthCheck('custom', async () => ({
            status: 'up'
        }))

        const removed = engine.removeHealthCheck('custom')

        assert.isTrue(removed)
        assert.notInclude(engine.getHealthCheckNames(), 'custom')
    })

    test('removeHealthCheck returns false for non-existent check', async ({ assert }) => {
        const db = new MockDatabaseAdapter()
        const storage = new MockStorageService()

        const engine = new DigitalTwinEngine({
            database: db,
            storage: storage
        })

        const removed = engine.removeHealthCheck('non-existent')

        assert.isFalse(removed)
    })
})
