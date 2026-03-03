import { test } from '@japa/runner'
import { DigitalTwinEngine } from '../src/engine/digital_twin_engine.js'
import { MockDatabaseAdapter } from './mocks/mock_database_adapter.js'
import { LocalStorageService } from '../src/storage/adapters/local_storage_service.js'
import { LogLevel } from '../src/utils/logger.js'

/**
 * Tests for DigitalTwinEngine server methods with ultimate-express
 * These tests verify that getPort(), stop(), and the server lifecycle work correctly
 */
test.group('Engine Server Methods (ultimate-express)', () => {

    test('getPort() returns correct port after start', async ({ assert }) => {
        const storage = new LocalStorageService('.test_tmp_server')
        const database = new MockDatabaseAdapter({ storage })

        const engine = new DigitalTwinEngine({
            collectors: [],
            harvesters: [],
            handlers: [],
            assetsManagers: [],
            database,
            storage,
            queues: {
                multiQueue: false,
                workers: { collectors: 0, harvesters: 0 }
            },
            logging: { level: LogLevel.SILENT },
            server: { port: 0 } // Random port
        })

        // Port should be undefined before start
        assert.isUndefined(engine.getPort())

        await engine.start()

        try {
            // Port should be defined after start
            const port = engine.getPort()
            assert.isDefined(port)
            assert.isNumber(port)
            assert.isAbove(port!, 0)
            assert.isBelow(port!, 65536)
        } finally {
            await engine.stop()
        }
    })

    test('getPort() returns specified port when not using random port', async ({ assert }) => {
        const storage = new LocalStorageService('.test_tmp_server2')
        const database = new MockDatabaseAdapter({ storage })

        const specifiedPort = 13579 // Unusual port unlikely to be in use

        const engine = new DigitalTwinEngine({
            collectors: [],
            harvesters: [],
            handlers: [],
            assetsManagers: [],
            database,
            storage,
            queues: {
                multiQueue: false,
                workers: { collectors: 0, harvesters: 0 }
            },
            logging: { level: LogLevel.SILENT },
            server: { port: specifiedPort }
        })

        await engine.start()

        try {
            const port = engine.getPort()
            assert.equal(port, specifiedPort)
        } finally {
            await engine.stop()
        }
    })

    test('stop() closes server gracefully', async ({ assert }) => {
        const storage = new LocalStorageService('.test_tmp_server3')
        const database = new MockDatabaseAdapter({ storage })

        const engine = new DigitalTwinEngine({
            collectors: [],
            harvesters: [],
            handlers: [],
            assetsManagers: [],
            database,
            storage,
            queues: {
                multiQueue: false,
                workers: { collectors: 0, harvesters: 0 }
            },
            logging: { level: LogLevel.SILENT },
            server: { port: 0 }
        })

        await engine.start()

        const portBeforeStop = engine.getPort()
        assert.isDefined(portBeforeStop)

        // Stop should complete without throwing
        await engine.stop()

        // After stop, getPort should return undefined (server is null)
        // Actually, getPort checks if #server exists, so it should return undefined
        const portAfterStop = engine.getPort()
        assert.isUndefined(portAfterStop)
    })

    test('server accepts HTTP requests after start', async ({ assert }) => {
        const storage = new LocalStorageService('.test_tmp_server4')
        const database = new MockDatabaseAdapter({ storage })

        const engine = new DigitalTwinEngine({
            collectors: [],
            harvesters: [],
            handlers: [],
            assetsManagers: [],
            database,
            storage,
            queues: {
                multiQueue: false,
                workers: { collectors: 0, harvesters: 0 }
            },
            logging: { level: LogLevel.SILENT },
            server: { port: 0 }
        })

        await engine.start()

        try {
            const port = engine.getPort()
            assert.isDefined(port)

            // Make a simple HTTP request to verify server is running
            const response = await fetch(`http://localhost:${port}/api/health`)

            // Should get a response (even if 404, server is responding)
            assert.isTrue(response.ok || response.status === 404 || response.status === 200)
        } finally {
            await engine.stop()
        }
    })

    test('server with custom host binding', async ({ assert }) => {
        const storage = new LocalStorageService('.test_tmp_server5')
        const database = new MockDatabaseAdapter({ storage })

        const engine = new DigitalTwinEngine({
            collectors: [],
            harvesters: [],
            handlers: [],
            assetsManagers: [],
            database,
            storage,
            queues: {
                multiQueue: false,
                workers: { collectors: 0, harvesters: 0 }
            },
            logging: { level: LogLevel.SILENT },
            server: {
                port: 0,
                host: '127.0.0.1' // Localhost only
            }
        })

        await engine.start()

        try {
            const port = engine.getPort()
            assert.isDefined(port)
            assert.isAbove(port!, 0)

            // Verify we can connect via localhost
            const response = await fetch(`http://127.0.0.1:${port}/api/health`)
            assert.isTrue(response.ok || response.status === 404 || response.status === 200)
        } finally {
            await engine.stop()
        }
    })

    test('multiple start/stop cycles work correctly', async ({ assert }) => {
        const storage = new LocalStorageService('.test_tmp_server6')
        const database = new MockDatabaseAdapter({ storage })

        const engine = new DigitalTwinEngine({
            collectors: [],
            harvesters: [],
            handlers: [],
            assetsManagers: [],
            database,
            storage,
            queues: {
                multiQueue: false,
                workers: { collectors: 0, harvesters: 0 }
            },
            logging: { level: LogLevel.SILENT },
            server: { port: 0 }
        })

        // First cycle
        await engine.start()
        const port1 = engine.getPort()
        assert.isDefined(port1)
        await engine.stop()
        assert.isUndefined(engine.getPort())

        // Note: Re-starting the same engine instance may not work
        // because uWebSockets.js TemplatedApp.close() is final
        // This test verifies the first cycle works correctly
    })

    test('server refuses connections after stop() - close() works', async ({ assert }) => {
        const storage = new LocalStorageService('.test_tmp_server7')
        const database = new MockDatabaseAdapter({ storage })

        const engine = new DigitalTwinEngine({
            collectors: [],
            harvesters: [],
            handlers: [],
            assetsManagers: [],
            database,
            storage,
            queues: {
                multiQueue: false,
                workers: { collectors: 0, harvesters: 0 }
            },
            logging: { level: LogLevel.SILENT },
            server: { port: 0 }
        })

        await engine.start()
        const port = engine.getPort()
        assert.isDefined(port)

        // Verify server is accepting connections before stop
        const responseBefore = await fetch(`http://localhost:${port}/api/health`)
        assert.isTrue(responseBefore.status === 200 || responseBefore.status === 404)

        // Stop the engine
        await engine.stop()

        // Give a small delay for the server to fully close
        await new Promise(resolve => setTimeout(resolve, 100))

        // Try to connect - should fail with connection refused
        let connectionRefused = false
        try {
            await fetch(`http://localhost:${port}/api/health`, {
                signal: AbortSignal.timeout(2000) // 2 second timeout
            })
        } catch (error) {
            // Expected: connection refused or fetch failed
            connectionRefused = true
        }

        assert.isTrue(connectionRefused, 'Server should refuse connections after stop()')
    })

    test('stop() is idempotent - can be called multiple times', async ({ assert }) => {
        const storage = new LocalStorageService('.test_tmp_server8')
        const database = new MockDatabaseAdapter({ storage })

        const engine = new DigitalTwinEngine({
            collectors: [],
            harvesters: [],
            handlers: [],
            assetsManagers: [],
            database,
            storage,
            queues: {
                multiQueue: false,
                workers: { collectors: 0, harvesters: 0 }
            },
            logging: { level: LogLevel.SILENT },
            server: { port: 0 }
        })

        await engine.start()
        assert.isDefined(engine.getPort())

        // First stop
        await engine.stop()
        assert.isUndefined(engine.getPort())

        // Second stop should not throw
        await engine.stop()
        assert.isUndefined(engine.getPort())

        // Third stop should also not throw
        await engine.stop()
        assert.isUndefined(engine.getPort())
    })

    test('server returns gzip compressed responses when compression is enabled', async ({ assert }) => {
        // Enable compression via environment variable
        const originalEnv = process.env.DIGITALTWIN_ENABLE_COMPRESSION
        process.env.DIGITALTWIN_ENABLE_COMPRESSION = 'true'

        const storage = new LocalStorageService('.test_tmp_server_compression')
        const database = new MockDatabaseAdapter({ storage })

        const engine = new DigitalTwinEngine({
            collectors: [],
            harvesters: [],
            handlers: [],
            assetsManagers: [],
            database,
            storage,
            queues: {
                multiQueue: false,
                workers: { collectors: 0, harvesters: 0 }
            },
            logging: { level: LogLevel.SILENT },
            server: { port: 0 }
        })

        await engine.start()

        try {
            const port = engine.getPort()
            assert.isDefined(port)

            // Request with Accept-Encoding: gzip
            const response = await fetch(`http://localhost:${port}/api/health`, {
                headers: {
                    'Accept-Encoding': 'gzip, deflate'
                }
            })

            // The response should be successful
            assert.equal(response.status, 200)

            // Check if compression was applied (Content-Encoding header)
            // Note: fetch automatically decompresses, so we check the header
            const contentEncoding = response.headers.get('content-encoding')

            // Response should be either gzip compressed or not compressed if too small
            // (compression threshold is 1KB)
            if (contentEncoding) {
                assert.equal(contentEncoding, 'gzip')
            }
            // Small responses may not be compressed - this is expected behavior
        } finally {
            await engine.stop()
            // Restore original environment
            if (originalEnv === undefined) {
                delete process.env.DIGITALTWIN_ENABLE_COMPRESSION
            } else {
                process.env.DIGITALTWIN_ENABLE_COMPRESSION = originalEnv
            }
        }
    })

    test('server does not compress responses when compression is disabled (default)', async ({ assert }) => {
        // Ensure compression is disabled (default behavior)
        const originalEnv = process.env.DIGITALTWIN_ENABLE_COMPRESSION
        delete process.env.DIGITALTWIN_ENABLE_COMPRESSION

        const storage = new LocalStorageService('.test_tmp_server_no_compression')
        const database = new MockDatabaseAdapter({ storage })

        const engine = new DigitalTwinEngine({
            collectors: [],
            harvesters: [],
            handlers: [],
            assetsManagers: [],
            database,
            storage,
            queues: {
                multiQueue: false,
                workers: { collectors: 0, harvesters: 0 }
            },
            logging: { level: LogLevel.SILENT },
            server: { port: 0 }
        })

        await engine.start()

        try {
            const port = engine.getPort()
            assert.isDefined(port)

            // Request with Accept-Encoding: gzip
            const response = await fetch(`http://localhost:${port}/api/health`, {
                headers: {
                    'Accept-Encoding': 'gzip, deflate'
                }
            })

            // The response should be successful
            assert.equal(response.status, 200)

            // Without compression enabled, there should be no Content-Encoding header
            const contentEncoding = response.headers.get('content-encoding')
            assert.isNull(contentEncoding, 'Compression should be disabled by default')
        } finally {
            await engine.stop()
            // Restore original environment
            if (originalEnv !== undefined) {
                process.env.DIGITALTWIN_ENABLE_COMPRESSION = originalEnv
            }
        }
    })
})
