import { test } from '@japa/runner'
import {
    DigitalTwinEngine,
    isCollector,
    isHarvester,
    isHandler,
    isAssetsManager,
    isCustomTableManager
} from '../../src/engine/digital_twin_engine.js'
import { Collector } from '../../src/components/collector.js'
import { Harvester } from '../../src/components/harvester.js'
import { Handler } from '../../src/components/handler.js'
import { AssetsManager } from '../../src/components/assets_manager.js'
import { CustomTableManager } from '../../src/components/custom_table_manager.js'
import type { CollectorConfiguration, HarvesterConfiguration, AssetsManagerConfiguration, StoreConfiguration, ComponentConfiguration } from '../../src/components/types.js'
import type { DataRecord } from '../../src/types/data_record.js'
import { MockDatabaseAdapter } from '../mocks/mock_database_adapter.js'
import { MockStorageService } from '../mocks/mock_storage_service.js'

// Test Collector
class TestCollector extends Collector {
    getConfiguration(): CollectorConfiguration {
        return {
            name: 'test-collector',
            description: 'Test collector',
            contentType: 'application/json',
            endpoint: 'test-collector'
        }
    }

    getSchedule(): string {
        return '0 */5 * * * *'
    }

    async collect(): Promise<Buffer> {
        return Buffer.from('{"test": true}')
    }
}

// Test Harvester
class TestHarvester extends Harvester {
    getUserConfiguration(): HarvesterConfiguration {
        return {
            name: 'test-harvester',
            description: 'Test harvester',
            contentType: 'application/json',
            endpoint: 'test-harvester',
            source: 'test-collector'
        }
    }

    async harvest(
        _sourceData: DataRecord | DataRecord[],
        _dependenciesData: Record<string, DataRecord | DataRecord[] | null>
    ): Promise<Buffer> {
        return Buffer.from('{"harvested": true}')
    }
}

// Test Handler
class TestHandler extends Handler {
    getConfiguration(): ComponentConfiguration {
        return {
            name: 'test-handler',
            description: 'Test handler',
            contentType: 'application/json'
        }
    }
}

// Test AssetsManager
class TestAssetsManager extends AssetsManager {
    getConfiguration(): AssetsManagerConfiguration {
        return {
            name: 'test-assets',
            description: 'Test assets manager',
            contentType: 'image/jpeg',
            endpoint: 'test-assets',
            extension: '.jpg'
        }
    }
}

// Test CustomTableManager
class TestCustomTableManager extends CustomTableManager {
    getConfiguration(): StoreConfiguration {
        return {
            name: 'test-table',
            description: 'Test custom table',
            columns: {
                custom_field: 'text'
            }
        }
    }
}

test.group('Type Guards', () => {
    test('isCollector correctly identifies collectors', ({ assert }) => {
        const collector = new TestCollector()
        const harvester = new TestHarvester()
        const handler = new TestHandler()
        const assetsManager = new TestAssetsManager()
        const customTableManager = new TestCustomTableManager()

        assert.isTrue(isCollector(collector))
        assert.isFalse(isCollector(harvester))
        assert.isFalse(isCollector(handler))
        assert.isFalse(isCollector(assetsManager))
        assert.isFalse(isCollector(customTableManager))
    })

    test('isHarvester correctly identifies harvesters', ({ assert }) => {
        const collector = new TestCollector()
        const harvester = new TestHarvester()
        const handler = new TestHandler()
        const assetsManager = new TestAssetsManager()
        const customTableManager = new TestCustomTableManager()

        assert.isFalse(isHarvester(collector))
        assert.isTrue(isHarvester(harvester))
        assert.isFalse(isHarvester(handler))
        assert.isFalse(isHarvester(assetsManager))
        assert.isFalse(isHarvester(customTableManager))
    })

    test('isHandler correctly identifies handlers', ({ assert }) => {
        const collector = new TestCollector()
        const harvester = new TestHarvester()
        const handler = new TestHandler()
        const assetsManager = new TestAssetsManager()
        const customTableManager = new TestCustomTableManager()

        assert.isFalse(isHandler(collector))
        assert.isFalse(isHandler(harvester))
        assert.isTrue(isHandler(handler))
        assert.isFalse(isHandler(assetsManager))
        assert.isFalse(isHandler(customTableManager))
    })

    test('isAssetsManager correctly identifies assets managers', ({ assert }) => {
        const collector = new TestCollector()
        const harvester = new TestHarvester()
        const handler = new TestHandler()
        const assetsManager = new TestAssetsManager()
        const customTableManager = new TestCustomTableManager()

        assert.isFalse(isAssetsManager(collector))
        assert.isFalse(isAssetsManager(harvester))
        assert.isFalse(isAssetsManager(handler))
        assert.isTrue(isAssetsManager(assetsManager))
        assert.isFalse(isAssetsManager(customTableManager))
    })

    test('isCustomTableManager correctly identifies custom table managers', ({ assert }) => {
        const collector = new TestCollector()
        const harvester = new TestHarvester()
        const handler = new TestHandler()
        const assetsManager = new TestAssetsManager()
        const customTableManager = new TestCustomTableManager()

        assert.isFalse(isCustomTableManager(collector))
        assert.isFalse(isCustomTableManager(harvester))
        assert.isFalse(isCustomTableManager(handler))
        assert.isFalse(isCustomTableManager(assetsManager))
        assert.isTrue(isCustomTableManager(customTableManager))
    })
})

test.group('DigitalTwinEngine.register()', () => {
    test('register() auto-detects and registers a collector', async ({ assert }) => {
        const storage = new MockStorageService()
        const database = new MockDatabaseAdapter({ storage })

        const engine = new DigitalTwinEngine({ storage, database })
        const collector = new TestCollector()

        const result = engine.register(collector)

        // Should return the engine for chaining
        assert.strictEqual(result, engine)

        // Verify collector is registered by validating configuration
        const validation = await engine.validateConfiguration()
        const collectorResult = validation.components.find(c => c.name === 'test-collector')
        assert.isDefined(collectorResult)
        assert.equal(collectorResult?.type, 'collector')
    })

    test('register() auto-detects and registers a harvester', async ({ assert }) => {
        const storage = new MockStorageService()
        const database = new MockDatabaseAdapter({ storage })

        const engine = new DigitalTwinEngine({ storage, database })
        const harvester = new TestHarvester()

        engine.register(harvester)

        const validation = await engine.validateConfiguration()
        const harvesterResult = validation.components.find(c => c.name === 'test-harvester')
        assert.isDefined(harvesterResult)
        assert.equal(harvesterResult?.type, 'harvester')
    })

    test('register() auto-detects and registers a handler', async ({ assert }) => {
        const storage = new MockStorageService()
        const database = new MockDatabaseAdapter({ storage })

        const engine = new DigitalTwinEngine({ storage, database })
        const handler = new TestHandler()

        engine.register(handler)

        const validation = await engine.validateConfiguration()
        const handlerResult = validation.components.find(c => c.name === 'test-handler')
        assert.isDefined(handlerResult)
        assert.equal(handlerResult?.type, 'handler')
    })

    test('register() auto-detects and registers an assets manager', async ({ assert }) => {
        const storage = new MockStorageService()
        const database = new MockDatabaseAdapter({ storage })

        const engine = new DigitalTwinEngine({ storage, database })
        const assetsManager = new TestAssetsManager()

        engine.register(assetsManager)

        const validation = await engine.validateConfiguration()
        const assetsResult = validation.components.find(c => c.name === 'test-assets')
        assert.isDefined(assetsResult)
        assert.equal(assetsResult?.type, 'assets_manager')
    })

    test('register() auto-detects and registers a custom table manager', async ({ assert }) => {
        const storage = new MockStorageService()
        const database = new MockDatabaseAdapter({ storage })

        const engine = new DigitalTwinEngine({ storage, database })
        const customTableManager = new TestCustomTableManager()

        engine.register(customTableManager)

        const validation = await engine.validateConfiguration()
        const customTableResult = validation.components.find(c => c.name === 'test-table')
        assert.isDefined(customTableResult)
        assert.equal(customTableResult?.type, 'custom_table_manager')
    })

    test('register() supports method chaining', async ({ assert }) => {
        const storage = new MockStorageService()
        const database = new MockDatabaseAdapter({ storage })

        const engine = new DigitalTwinEngine({ storage, database })
            .register(new TestCollector())
            .register(new TestHarvester())
            .register(new TestHandler())

        const validation = await engine.validateConfiguration()
        assert.equal(validation.components.length, 3)
    })

    test('register() throws when called after start()', async ({ assert }) => {
        const storage = new MockStorageService()
        const database = new MockDatabaseAdapter({ storage })

        const engine = new DigitalTwinEngine({
            storage,
            database,
            dryRun: false
        })

        await engine.start()

        assert.throws(
            () => engine.register(new TestCollector()),
            /Cannot register components after the engine has started/
        )

        await engine.stop()
    })

    test('register() throws for unknown component type', ({ assert }) => {
        const storage = new MockStorageService()
        const database = new MockDatabaseAdapter({ storage })

        const engine = new DigitalTwinEngine({ storage, database })

        // Create a fake object that doesn't match any component type
        const fakeComponent = {
            getConfiguration: () => ({ name: 'fake' })
        }

        assert.throws(
            () => engine.register(fakeComponent as any),
            /Unknown component type/
        )
    })
})

test.group('DigitalTwinEngine.registerAll()', () => {
    test('registerAll() registers multiple components at once', async ({ assert }) => {
        const storage = new MockStorageService()
        const database = new MockDatabaseAdapter({ storage })

        const engine = new DigitalTwinEngine({ storage, database })
            .registerAll([
                new TestCollector(),
                new TestHarvester(),
                new TestHandler(),
                new TestAssetsManager(),
                new TestCustomTableManager()
            ])

        const validation = await engine.validateConfiguration()
        assert.equal(validation.components.length, 5)
    })

    test('registerAll() supports chaining', async ({ assert }) => {
        const storage = new MockStorageService()
        const database = new MockDatabaseAdapter({ storage })

        const result = new DigitalTwinEngine({ storage, database })
            .registerAll([new TestCollector()])
            .registerAll([new TestHandler()])

        assert.instanceOf(result, DigitalTwinEngine)

        const validation = await result.validateConfiguration()
        assert.equal(validation.components.length, 2)
    })
})

test.group('Type-specific register methods', () => {
    test('registerCollector() registers a collector', async ({ assert }) => {
        const storage = new MockStorageService()
        const database = new MockDatabaseAdapter({ storage })

        const engine = new DigitalTwinEngine({ storage, database })
            .registerCollector(new TestCollector())

        const validation = await engine.validateConfiguration()
        const collectorResult = validation.components.find(c => c.type === 'collector')
        assert.isDefined(collectorResult)
    })

    test('registerHarvester() registers a harvester', async ({ assert }) => {
        const storage = new MockStorageService()
        const database = new MockDatabaseAdapter({ storage })

        const engine = new DigitalTwinEngine({ storage, database })
            .registerHarvester(new TestHarvester())

        const validation = await engine.validateConfiguration()
        const harvesterResult = validation.components.find(c => c.type === 'harvester')
        assert.isDefined(harvesterResult)
    })

    test('registerHandler() registers a handler', async ({ assert }) => {
        const storage = new MockStorageService()
        const database = new MockDatabaseAdapter({ storage })

        const engine = new DigitalTwinEngine({ storage, database })
            .registerHandler(new TestHandler())

        const validation = await engine.validateConfiguration()
        const handlerResult = validation.components.find(c => c.type === 'handler')
        assert.isDefined(handlerResult)
    })

    test('registerAssetsManager() registers an assets manager', async ({ assert }) => {
        const storage = new MockStorageService()
        const database = new MockDatabaseAdapter({ storage })

        const engine = new DigitalTwinEngine({ storage, database })
            .registerAssetsManager(new TestAssetsManager())

        const validation = await engine.validateConfiguration()
        const assetsResult = validation.components.find(c => c.type === 'assets_manager')
        assert.isDefined(assetsResult)
    })

    test('registerCustomTableManager() registers a custom table manager', async ({ assert }) => {
        const storage = new MockStorageService()
        const database = new MockDatabaseAdapter({ storage })

        const engine = new DigitalTwinEngine({ storage, database })
            .registerCustomTableManager(new TestCustomTableManager())

        const validation = await engine.validateConfiguration()
        const customTableResult = validation.components.find(c => c.type === 'custom_table_manager')
        assert.isDefined(customTableResult)
    })

    test('type-specific methods throw when called after start()', async ({ assert }) => {
        const storage = new MockStorageService()
        const database = new MockDatabaseAdapter({ storage })

        const engine = new DigitalTwinEngine({ storage, database })
        await engine.start()

        assert.throws(
            () => engine.registerCollector(new TestCollector()),
            /Cannot register components after the engine has started/
        )

        assert.throws(
            () => engine.registerHarvester(new TestHarvester()),
            /Cannot register components after the engine has started/
        )

        assert.throws(
            () => engine.registerHandler(new TestHandler()),
            /Cannot register components after the engine has started/
        )

        assert.throws(
            () => engine.registerAssetsManager(new TestAssetsManager()),
            /Cannot register components after the engine has started/
        )

        assert.throws(
            () => engine.registerCustomTableManager(new TestCustomTableManager()),
            /Cannot register components after the engine has started/
        )

        await engine.stop()
    })
})

test.group('Mixed registration approaches', () => {
    test('can combine constructor options with register() calls', async ({ assert }) => {
        const storage = new MockStorageService()
        const database = new MockDatabaseAdapter({ storage })

        const engine = new DigitalTwinEngine({
            storage,
            database,
            collectors: [new TestCollector()]
        }).register(new TestHandler())

        const validation = await engine.validateConfiguration()
        assert.equal(validation.components.length, 2)

        const hasCollector = validation.components.some(c => c.type === 'collector')
        const hasHandler = validation.components.some(c => c.type === 'handler')
        assert.isTrue(hasCollector)
        assert.isTrue(hasHandler)
    })
})
