import { test } from '@japa/runner'
import { DigitalTwinEngine } from '../src/digital_twin_engine.js'
import { TestAssetsManager } from './fixtures/mock_components.js'
import { MockDatabaseAdapter } from './fixtures/mock_database.js'
import { MockStorageService } from './fixtures/mock_storage.js'
import { AssetsManager } from '@cepseudo/assets'
import type { ComponentConfiguration } from '@cepseudo/shared'
import { LogLevel } from '@cepseudo/shared'

test.group('Engine dry run and validation', () => {
    test('dry run completes without starting server or queues', async ({ assert }) => {
        const engine = new DigitalTwinEngine({
            assetsManagers: [new TestAssetsManager()],
            database: new MockDatabaseAdapter(),
            storage: new MockStorageService(),
            dryRun: true,
            logging: { level: LogLevel.SILENT },
            server: { port: 0 }
        })

        await assert.doesNotReject(() => engine.start())
    })

    test('validateConfiguration returns detailed component results', async ({ assert }) => {
        const engine = new DigitalTwinEngine({
            assetsManagers: [new TestAssetsManager('my-assets')],
            database: new MockDatabaseAdapter(),
            storage: new MockStorageService(),
            logging: { level: LogLevel.SILENT },
            server: { port: 0 }
        })

        const result = await engine.validateConfiguration()

        assert.isTrue(result.valid)
        assert.equal(result.summary.total, 1)
        assert.equal(result.summary.valid, 1)
        assert.equal(result.components[0].name, 'my-assets')
        assert.equal(result.components[0].type, 'assets_manager')
        assert.isTrue(result.components[0].valid)
    })

    test('validateConfiguration detects invalid component (missing name)', async ({ assert }) => {
        class BrokenManager extends AssetsManager {
            getConfiguration(): ComponentConfiguration {
                return { name: '', description: 'Broken', contentType: '', tags: ['test'] }
            }
        }

        const engine = new DigitalTwinEngine({
            assetsManagers: [new BrokenManager()],
            database: new MockDatabaseAdapter(),
            storage: new MockStorageService(),
            logging: { level: LogLevel.SILENT },
            server: { port: 0 }
        })

        const result = await engine.validateConfiguration()

        assert.isFalse(result.valid)
        assert.equal(result.summary.invalid, 1)
        assert.isAbove(result.components[0].errors.length, 0)
    })

    test('dry run rejects when validation fails', async ({ assert }) => {
        class BrokenManager extends AssetsManager {
            getConfiguration(): ComponentConfiguration {
                return { name: '', description: 'Broken', contentType: 'x', tags: [] }
            }
        }

        const engine = new DigitalTwinEngine({
            assetsManagers: [new BrokenManager()],
            database: new MockDatabaseAdapter(),
            storage: new MockStorageService(),
            dryRun: true,
            logging: { level: LogLevel.SILENT },
            server: { port: 0 }
        })

        await assert.rejects(() => engine.start(), /Validation failed/)
    })

    test('testComponents returns results for all registered components', async ({ assert }) => {
        const engine = new DigitalTwinEngine({
            assetsManagers: [new TestAssetsManager('tested')],
            database: new MockDatabaseAdapter(),
            storage: new MockStorageService(),
            logging: { level: LogLevel.SILENT },
            server: { port: 0 }
        })

        const results = await engine.testComponents()

        assert.equal(results.length, 1)
        assert.equal(results[0].name, 'tested')
        assert.isTrue(results[0].valid)
    })
})
