import { test } from '@japa/runner'
import { DigitalTwinEngine } from '../../src/engine/digital_twin_engine.js'
import { Collector } from '../../src/components/collector.js'
import { Harvester } from '../../src/components/harvester.js'
import { Handler } from '../../src/components/handler.js'
import { AssetsManager } from '../../src/components/assets_manager.js'
import { CustomTableManager } from '../../src/components/custom_table_manager.js'
import type {
    CollectorConfiguration,
    HarvesterConfiguration,
    ComponentConfiguration,
    AssetsManagerConfiguration
} from '../../src/components/types.js'
import type { DataRecord } from '../../src/types/data_record.js'
import { MockDatabaseAdapter } from '../mocks/mock_database_adapter.js'
import { MockStorageService } from '../mocks/mock_storage_service.js'

// Test implementations with configurable names
class TestCollector extends Collector {
    constructor(private componentName: string = 'test-collector') {
        super()
    }

    getConfiguration(): CollectorConfiguration {
        return {
            name: this.componentName,
            description: 'Test collector',
            contentType: 'application/json',
            endpoint: 'test'
        }
    }

    getSchedule(): string {
        return '0 * * * * *'
    }

    async collect(): Promise<Buffer> {
        return Buffer.from('{"test": true}')
    }
}

class TestHarvester extends Harvester {
    constructor(private componentName: string = 'test-harvester') {
        super()
    }

    getUserConfiguration(): HarvesterConfiguration {
        return {
            name: this.componentName,
            description: 'Test harvester',
            contentType: 'application/json',
            endpoint: 'harvested',
            source: 'test-collector'
        }
    }

    async harvest(sourceData: DataRecord | DataRecord[]): Promise<Buffer> {
        return Buffer.from('{"harvested": true}')
    }
}

class TestHandler extends Handler {
    constructor(private componentName: string = 'test-handler') {
        super()
    }

    getConfiguration(): ComponentConfiguration {
        return {
            name: this.componentName,
            description: 'Test handler',
            contentType: 'application/json'
        }
    }
}

class TestAssetsManager extends AssetsManager {
    constructor(private componentName: string = 'test-assets') {
        super()
    }

    getConfiguration(): AssetsManagerConfiguration {
        return {
            name: this.componentName,
            description: 'Test assets manager',
            contentType: 'image/png',
            endpoint: 'assets'
        }
    }
}

class TestCustomTableManager extends CustomTableManager {
    constructor(private componentName: string = 'test-custom-table') {
        super()
    }

    getConfiguration() {
        return {
            name: this.componentName,
            description: 'Test custom table',
            columns: {
                custom_field: 'TEXT'
            }
        }
    }
}

test.group('DigitalTwinEngine.register() - Basic Registration', () => {
    test('registers a collector and includes it in validation', async ({ assert }) => {
        const storage = new MockStorageService()
        const database = new MockDatabaseAdapter()
        const engine = new DigitalTwinEngine({ storage, database })

        engine.register(new TestCollector('my-collector'))

        const validation = await engine.validateConfiguration()
        const collectorResult = validation.components.find(c => c.name === 'my-collector')

        assert.isNotNull(collectorResult, 'Collector should be found in validation results')
        assert.equal(collectorResult?.type, 'collector')
        assert.isTrue(collectorResult?.valid)
    })

    test('registers a harvester and includes it in validation', async ({ assert }) => {
        const storage = new MockStorageService()
        const database = new MockDatabaseAdapter()
        const engine = new DigitalTwinEngine({ storage, database })

        engine.register(new TestHarvester('my-harvester'))

        const validation = await engine.validateConfiguration()
        const harvesterResult = validation.components.find(c => c.name === 'my-harvester')

        assert.isNotNull(harvesterResult, 'Harvester should be found in validation results')
        assert.equal(harvesterResult?.type, 'harvester')
        assert.isTrue(harvesterResult?.valid)
    })

    test('registers a handler and includes it in validation', async ({ assert }) => {
        const storage = new MockStorageService()
        const database = new MockDatabaseAdapter()
        const engine = new DigitalTwinEngine({ storage, database })

        engine.register(new TestHandler('my-handler'))

        const validation = await engine.validateConfiguration()
        const handlerResult = validation.components.find(c => c.name === 'my-handler')

        assert.isNotNull(handlerResult, 'Handler should be found in validation results')
        assert.equal(handlerResult?.type, 'handler')
        assert.isTrue(handlerResult?.valid)
    })

    test('registers an assets manager and includes it in validation', async ({ assert }) => {
        const storage = new MockStorageService()
        const database = new MockDatabaseAdapter()
        const engine = new DigitalTwinEngine({ storage, database })

        engine.register(new TestAssetsManager('my-assets'))

        const validation = await engine.validateConfiguration()
        const assetsResult = validation.components.find(c => c.name === 'my-assets')

        assert.isNotNull(assetsResult, 'AssetsManager should be found in validation results')
        assert.equal(assetsResult?.type, 'assets_manager')
        assert.isTrue(assetsResult?.valid)
    })

    test('registers a custom table manager and includes it in validation', async ({ assert }) => {
        const storage = new MockStorageService()
        const database = new MockDatabaseAdapter()
        const engine = new DigitalTwinEngine({ storage, database })

        engine.register(new TestCustomTableManager('my-table'))

        const validation = await engine.validateConfiguration()
        const tableResult = validation.components.find(c => c.name === 'my-table')

        assert.isNotNull(tableResult, 'CustomTableManager should be found in validation results')
        assert.equal(tableResult?.type, 'custom_table_manager')
        assert.isTrue(tableResult?.valid)
    })
})

test.group('DigitalTwinEngine.register() - Method Chaining', () => {
    test('returns engine instance for chaining', ({ assert }) => {
        const storage = new MockStorageService()
        const database = new MockDatabaseAdapter()
        const engine = new DigitalTwinEngine({ storage, database })

        const result = engine.register(new TestCollector())

        assert.strictEqual(result, engine, 'register() should return the engine instance')
    })

    test('supports fluent chaining of multiple registrations', async ({ assert }) => {
        const storage = new MockStorageService()
        const database = new MockDatabaseAdapter()
        const engine = new DigitalTwinEngine({ storage, database })

        engine
            .register(new TestCollector('collector-1'))
            .register(new TestHarvester('harvester-1'))
            .register(new TestHandler('handler-1'))

        const validation = await engine.validateConfiguration()

        assert.equal(validation.summary.total, 3, 'Should have 3 components registered')
        assert.isNotNull(validation.components.find(c => c.name === 'collector-1'))
        assert.isNotNull(validation.components.find(c => c.name === 'harvester-1'))
        assert.isNotNull(validation.components.find(c => c.name === 'handler-1'))
    })
})

test.group('DigitalTwinEngine.register() - Duplicate Detection', () => {
    test('throws error when registering duplicate collector name', ({ assert }) => {
        const storage = new MockStorageService()
        const database = new MockDatabaseAdapter()
        const engine = new DigitalTwinEngine({ storage, database })

        engine.register(new TestCollector('duplicate-name'))

        assert.throws(
            () => engine.register(new TestCollector('duplicate-name')),
            /already registered/,
            'Should throw error for duplicate name'
        )
    })

    test('throws error when registering duplicate via constructor then register', ({ assert }) => {
        const storage = new MockStorageService()
        const database = new MockDatabaseAdapter()
        const engine = new DigitalTwinEngine({
            storage,
            database,
            collectors: [new TestCollector('from-constructor')]
        })

        assert.throws(
            () => engine.register(new TestCollector('from-constructor')),
            /already registered/,
            'Should detect duplicates across constructor and register()'
        )
    })

    test('allows same name for different component types', async ({ assert }) => {
        const storage = new MockStorageService()
        const database = new MockDatabaseAdapter()
        const engine = new DigitalTwinEngine({ storage, database })

        // Same name, different types - should be allowed
        engine.register(new TestCollector('shared-name'))
        engine.register(new TestHandler('shared-name'))

        const validation = await engine.validateConfiguration()
        const components = validation.components.filter(c => c.name === 'shared-name')

        assert.equal(components.length, 2, 'Should have 2 components with same name but different types')
        assert.isTrue(components.some(c => c.type === 'collector'))
        assert.isTrue(components.some(c => c.type === 'handler'))
    })
})

test.group('DigitalTwinEngine.registerAll()', () => {
    test('registers multiple components and includes all in validation', async ({ assert }) => {
        const storage = new MockStorageService()
        const database = new MockDatabaseAdapter()
        const engine = new DigitalTwinEngine({ storage, database })

        engine.registerAll([
            new TestCollector('bulk-collector'),
            new TestHarvester('bulk-harvester'),
            new TestHandler('bulk-handler')
        ])

        const validation = await engine.validateConfiguration()

        assert.equal(validation.summary.total, 3)
        assert.isNotNull(validation.components.find(c => c.name === 'bulk-collector'))
        assert.isNotNull(validation.components.find(c => c.name === 'bulk-harvester'))
        assert.isNotNull(validation.components.find(c => c.name === 'bulk-handler'))
    })

    test('returns engine instance for chaining', ({ assert }) => {
        const storage = new MockStorageService()
        const database = new MockDatabaseAdapter()
        const engine = new DigitalTwinEngine({ storage, database })

        const result = engine.registerAll([new TestCollector()])

        assert.strictEqual(result, engine)
    })

    test('handles empty array gracefully', async ({ assert }) => {
        const storage = new MockStorageService()
        const database = new MockDatabaseAdapter()
        const engine = new DigitalTwinEngine({ storage, database })

        engine.registerAll([])

        const validation = await engine.validateConfiguration()
        assert.equal(validation.summary.total, 0)
    })

    test('throws error on first duplicate encountered', ({ assert }) => {
        const storage = new MockStorageService()
        const database = new MockDatabaseAdapter()
        const engine = new DigitalTwinEngine({ storage, database })

        assert.throws(
            () =>
                engine.registerAll([
                    new TestCollector('dup'),
                    new TestCollector('dup') // Duplicate
                ]),
            /already registered/
        )
    })
})

test.group('DigitalTwinEngine.registerComponents()', () => {
    test('registers typed components and includes all in validation', async ({ assert }) => {
        const storage = new MockStorageService()
        const database = new MockDatabaseAdapter()
        const engine = new DigitalTwinEngine({ storage, database })

        engine.registerComponents({
            collectors: [new TestCollector('typed-collector')],
            harvesters: [new TestHarvester('typed-harvester')],
            handlers: [new TestHandler('typed-handler')],
            assetsManagers: [new TestAssetsManager('typed-assets')],
            customTableManagers: [new TestCustomTableManager('typed-table')]
        })

        const validation = await engine.validateConfiguration()

        assert.equal(validation.summary.total, 5)
        assert.isNotNull(validation.components.find(c => c.name === 'typed-collector'))
        assert.isNotNull(validation.components.find(c => c.name === 'typed-harvester'))
        assert.isNotNull(validation.components.find(c => c.name === 'typed-handler'))
        assert.isNotNull(validation.components.find(c => c.name === 'typed-assets'))
        assert.isNotNull(validation.components.find(c => c.name === 'typed-table'))
    })

    test('accepts partial components object with only collectors', async ({ assert }) => {
        const storage = new MockStorageService()
        const database = new MockDatabaseAdapter()
        const engine = new DigitalTwinEngine({ storage, database })

        engine.registerComponents({
            collectors: [new TestCollector('partial-collector')]
        })

        const validation = await engine.validateConfiguration()

        assert.equal(validation.summary.total, 1)
        assert.isNotNull(validation.components.find(c => c.name === 'partial-collector'))
    })

    test('handles empty components object gracefully', async ({ assert }) => {
        const storage = new MockStorageService()
        const database = new MockDatabaseAdapter()
        const engine = new DigitalTwinEngine({ storage, database })

        engine.registerComponents({})

        const validation = await engine.validateConfiguration()
        assert.equal(validation.summary.total, 0)
    })

    test('returns engine instance for chaining', ({ assert }) => {
        const storage = new MockStorageService()
        const database = new MockDatabaseAdapter()
        const engine = new DigitalTwinEngine({ storage, database })

        const result = engine.registerComponents({
            collectors: [new TestCollector()]
        })

        assert.strictEqual(result, engine)
    })
})

test.group('Dynamic and Constructor Components Integration', () => {
    test('combines constructor and dynamic components in validation', async ({ assert }) => {
        const storage = new MockStorageService()
        const database = new MockDatabaseAdapter()
        const engine = new DigitalTwinEngine({
            storage,
            database,
            collectors: [new TestCollector('constructor-collector')],
            handlers: [new TestHandler('constructor-handler')]
        })

        engine.register(new TestCollector('dynamic-collector'))
        engine.register(new TestHarvester('dynamic-harvester'))

        const validation = await engine.validateConfiguration()

        assert.equal(validation.summary.total, 4, 'Should have 4 total components')

        // Verify all are present
        assert.isNotNull(validation.components.find(c => c.name === 'constructor-collector'))
        assert.isNotNull(validation.components.find(c => c.name === 'constructor-handler'))
        assert.isNotNull(validation.components.find(c => c.name === 'dynamic-collector'))
        assert.isNotNull(validation.components.find(c => c.name === 'dynamic-harvester'))
    })

    test('testComponents() includes dynamically registered components', async ({ assert }) => {
        const storage = new MockStorageService()
        const database = new MockDatabaseAdapter()
        const engine = new DigitalTwinEngine({ storage, database })

        engine.register(new TestCollector('test-me'))
        engine.register(new TestHandler('test-me-too'))

        const results = await engine.testComponents()

        assert.equal(results.length, 2, 'testComponents should test dynamic components')
        assert.isNotNull(results.find(r => r.name === 'test-me'))
        assert.isNotNull(results.find(r => r.name === 'test-me-too'))
    })
})
