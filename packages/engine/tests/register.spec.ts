import { test } from '@japa/runner'
import { DigitalTwinEngine } from '../src/digital_twin_engine.js'
import {
    TestCollector,
    TestHarvester,
    TestHandler,
    TestAssetsManager,
    TestCustomTableManager
} from './fixtures/mock_components.js'
import { MockDatabaseAdapter } from './fixtures/mock_database.js'
import { MockStorageService } from './fixtures/mock_storage.js'

function createEngine() {
    return new DigitalTwinEngine({
        storage: new MockStorageService(),
        database: new MockDatabaseAdapter()
    })
}

test.group('Engine.register() — component registration', () => {
    test('registers each component type and appears in validation', async ({ assert }) => {
        const engine = createEngine()

        engine.register(new TestCollector('col'))
        engine.register(new TestHarvester('harv'))
        engine.register(new TestHandler('han'))
        engine.register(new TestAssetsManager('am'))
        engine.register(new TestCustomTableManager('ct'))

        const v = await engine.validateConfiguration()
        assert.equal(v.summary.total, 5)

        const types = v.components.map(c => c.type)
        assert.include(types, 'collector')
        assert.include(types, 'harvester')
        assert.include(types, 'handler')
        assert.include(types, 'assets_manager')
        assert.include(types, 'custom_table_manager')
    })

    test('chained register() calls all end up registered', async ({ assert }) => {
        const engine = createEngine()

        engine
            .register(new TestCollector('a'))
            .register(new TestHandler('b'))

        const v = await engine.validateConfiguration()
        assert.equal(v.summary.total, 2)
        assert.isNotNull(v.components.find(c => c.name === 'a'))
        assert.isNotNull(v.components.find(c => c.name === 'b'))
    })

    test('rejects duplicate names within same component type', ({ assert }) => {
        const engine = createEngine()
        engine.register(new TestCollector('dup'))

        assert.throws(
            () => engine.register(new TestCollector('dup')),
            /already registered/
        )
    })

    test('detects duplicates across constructor and register()', ({ assert }) => {
        const engine = new DigitalTwinEngine({
            storage: new MockStorageService(),
            database: new MockDatabaseAdapter(),
            collectors: [new TestCollector('from-ctor')]
        })

        assert.throws(
            () => engine.register(new TestCollector('from-ctor')),
            /already registered/
        )
    })

    test('allows same name for different component types', async ({ assert }) => {
        const engine = createEngine()
        engine.register(new TestCollector('shared'))
        engine.register(new TestHandler('shared'))

        const v = await engine.validateConfiguration()
        const matches = v.components.filter(c => c.name === 'shared')
        assert.equal(matches.length, 2)
    })
})

test.group('Engine.registerAll()', () => {
    test('registers multiple components at once', async ({ assert }) => {
        const engine = createEngine()

        engine.registerAll([
            new TestCollector('c'),
            new TestHarvester('h'),
            new TestHandler('ha')
        ])

        const v = await engine.validateConfiguration()
        assert.equal(v.summary.total, 3)
    })

    test('throws on first duplicate', ({ assert }) => {
        const engine = createEngine()
        assert.throws(
            () => engine.registerAll([new TestCollector('x'), new TestCollector('x')]),
            /already registered/
        )
    })
})

test.group('Engine.registerComponents()', () => {
    test('registers typed components from object', async ({ assert }) => {
        const engine = createEngine()

        engine.registerComponents({
            collectors: [new TestCollector('tc')],
            handlers: [new TestHandler('th')]
        })

        const v = await engine.validateConfiguration()
        assert.equal(v.summary.total, 2)
    })
})

test.group('Constructor + dynamic registration', () => {
    test('combines constructor and dynamic components', async ({ assert }) => {
        const engine = new DigitalTwinEngine({
            storage: new MockStorageService(),
            database: new MockDatabaseAdapter(),
            collectors: [new TestCollector('ctor')]
        })

        engine.register(new TestHandler('dyn'))

        const v = await engine.validateConfiguration()
        assert.equal(v.summary.total, 2)
        assert.isNotNull(v.components.find(c => c.name === 'ctor'))
        assert.isNotNull(v.components.find(c => c.name === 'dyn'))
    })
})
