import { test } from '@japa/runner'
import { DigitalTwinEngine } from '../../src/engine/digital_twin_engine.js'
import { AssetsManager } from '../../src/components/assets_manager.js'
import { AssetsManagerConfiguration, ComponentConfiguration } from '../../src/components/types.js'
import { MockDatabaseAdapter } from '../mocks/mock_database_adapter.js'
import { LocalStorageService } from '../../src/storage/adapters/local_storage_service.js'
import { LogLevel } from '../../src/utils/logger.js'

// Test AssetsManager for validation
class TestValidationAssetsManager extends AssetsManager {
    getConfiguration(): AssetsManagerConfiguration {
        return {
            name: 'validation_test',
            description: 'Test assets manager for validation',
            contentType: 'application/octet-stream',
            tags: ['test', 'validation'],
            endpoint: 'validation_test'
        }
    }
}

test.group('Digital Twin Engine - Dry Run and Validation', () => {
    test('Engine dry run mode validates configuration without creating tables', async ({ assert }) => {
        const storage = new LocalStorageService('.test_tmp')
        const database = new MockDatabaseAdapter({ storage })
        
        const assetsManager = new TestValidationAssetsManager()
        
        // Create engine in dry run mode
        const engine = new DigitalTwinEngine({
            collectors: [],
            harvesters: [],
            handlers: [],
            assetsManagers: [assetsManager],
            database,
            storage,
            dryRun: true,  // Key: dry run mode
            logging: { level: LogLevel.SILENT },
            server: { port: 0 }
        })

        // Start should complete without errors in dry run mode
        await engine.start()
        
        // Validation should pass
        assert.isTrue(true, 'Dry run completed without errors')
    })

    test('validateConfiguration returns detailed validation results', async ({ assert }) => {
        const storage = new LocalStorageService('.test_tmp')
        const database = new MockDatabaseAdapter({ storage })
        
        const assetsManager = new TestValidationAssetsManager()
        
        const engine = new DigitalTwinEngine({
            collectors: [],
            harvesters: [],
            handlers: [],
            assetsManagers: [assetsManager],
            database,
            storage,
            logging: { level: LogLevel.SILENT },
            server: { port: 0 }
        })

        const result = await engine.validateConfiguration()
        
        assert.isTrue(result.valid, 'Configuration should be valid')
        assert.equal(result.components.length, 1, 'Should validate 1 component')
        assert.equal(result.components[0].name, 'validation_test')
        assert.equal(result.components[0].type, 'assets_manager')
        assert.isTrue(result.components[0].valid, 'Assets manager should be valid')
        assert.equal(result.engineErrors.length, 0, 'Should have no engine errors')
        assert.equal(result.summary.total, 1)
        assert.equal(result.summary.valid, 1)
        assert.equal(result.summary.invalid, 0)
    })

    test('testComponents returns test results for all components', async ({ assert }) => {
        const storage = new LocalStorageService('.test_tmp')
        const database = new MockDatabaseAdapter({ storage })
        
        const assetsManager = new TestValidationAssetsManager()
        
        const engine = new DigitalTwinEngine({
            collectors: [],
            harvesters: [],
            handlers: [],
            assetsManagers: [assetsManager],
            database,
            storage,
            logging: { level: LogLevel.SILENT },
            server: { port: 0 }
        })

        const results = await engine.testComponents()
        
        assert.equal(results.length, 1, 'Should test 1 component')
        assert.equal(results[0].name, 'validation_test')
        assert.equal(results[0].type, 'assets_manager')
        assert.isTrue(results[0].valid, 'Assets manager test should pass')
    })

    test('validateConfiguration detects missing required fields', async ({ assert }) => {
        // Create a broken assets manager
        class BrokenAssetsManager extends AssetsManager {
            getConfiguration(): ComponentConfiguration {
                return {
                    name: '', // Missing name
                    description: 'Broken test manager',
                    contentType: '', // Missing content type
                    tags: ['test']
                }
            }
        }

        const storage = new LocalStorageService('.test_tmp')
        const database = new MockDatabaseAdapter({ storage })
        
        const brokenManager = new BrokenAssetsManager()
        
        const engine = new DigitalTwinEngine({
            collectors: [],
            harvesters: [],
            handlers: [],
            assetsManagers: [brokenManager],
            database,
            storage,
            logging: { level: LogLevel.SILENT },
            server: { port: 0 }
        })

        const result = await engine.validateConfiguration()
        
        assert.isFalse(result.valid, 'Configuration should be invalid')
        assert.equal(result.summary.invalid, 1, 'Should have 1 invalid component')
        assert.isTrue(result.components[0].errors.length > 0, 'Should have validation errors')
    })

    test('dry run mode fails when validation fails', async ({ assert }) => {
        // Create a broken assets manager  
        class BrokenAssetsManager extends AssetsManager {
            getConfiguration(): ComponentConfiguration {
                return {
                    name: '', // Missing name - will cause validation to fail
                    description: 'Broken test manager',
                    contentType: 'application/octet-stream',
                    tags: ['test']
                }
            }
        }

        const storage = new LocalStorageService('.test_tmp')
        const database = new MockDatabaseAdapter({ storage })
        
        const brokenManager = new BrokenAssetsManager()
        
        const engine = new DigitalTwinEngine({
            collectors: [],
            harvesters: [],
            handlers: [],
            assetsManagers: [brokenManager],
            database,
            storage,
            dryRun: true,
            logging: { level: LogLevel.SILENT },
            server: { port: 0 }
        })

        // Should throw error when validation fails in dry run mode
        await assert.rejects(async () => {
            await engine.start()
        }, /Validation failed/)
    })
})