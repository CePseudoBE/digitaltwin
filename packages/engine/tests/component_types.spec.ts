import { test } from '@japa/runner'
import {
    isCollector,
    isHarvester,
    isHandler,
    isAssetsManager,
    isCustomTableManager,
    isActiveComponent,
    detectComponentType,
    type AnyComponent
} from '../src/component_types.js'
import {
    TestCollector,
    TestHarvester,
    TestHandler,
    TestAssetsManager,
    TestCustomTableManager
} from './fixtures/mock_components.js'

test.group('detectComponentType', () => {
    test('correctly identifies each component type', ({ assert }) => {
        assert.equal(detectComponentType(new TestCollector()), 'collector')
        assert.equal(detectComponentType(new TestHarvester()), 'harvester')
        assert.equal(detectComponentType(new TestHandler()), 'handler')
        assert.equal(detectComponentType(new TestAssetsManager()), 'assets_manager')
        assert.equal(detectComponentType(new TestCustomTableManager()), 'custom_table_manager')
    })

    test('throws for objects that are not valid components', ({ assert }) => {
        const fakeObject = { foo: 'bar' } as unknown as AnyComponent
        assert.throws(() => detectComponentType(fakeObject), /Unable to detect component type/)

        const fakeWithConfig = {
            getConfiguration: () => ({ name: 'fake' })
        } as unknown as AnyComponent
        assert.throws(() => detectComponentType(fakeWithConfig), /Unable to detect component type/)
    })
})

test.group('type guards', () => {
    test('isCollector only matches Collector instances', ({ assert }) => {
        assert.isTrue(isCollector(new TestCollector()))
        assert.isFalse(isCollector(new TestHarvester()))
        assert.isFalse(isCollector(new TestHandler()))
    })

    test('isHarvester only matches Harvester instances', ({ assert }) => {
        assert.isTrue(isHarvester(new TestHarvester()))
        assert.isFalse(isHarvester(new TestCollector()))
    })

    test('isHandler only matches Handler instances', ({ assert }) => {
        assert.isTrue(isHandler(new TestHandler()))
        assert.isFalse(isHandler(new TestCollector()))
        assert.isFalse(isHandler(new TestAssetsManager()))
    })

    test('isAssetsManager only matches AssetsManager instances', ({ assert }) => {
        assert.isTrue(isAssetsManager(new TestAssetsManager()))
        assert.isFalse(isAssetsManager(new TestHandler()))
    })

    test('isCustomTableManager only matches CustomTableManager instances', ({ assert }) => {
        assert.isTrue(isCustomTableManager(new TestCustomTableManager()))
        assert.isFalse(isCustomTableManager(new TestHandler()))
    })

    test('isActiveComponent matches only schedulable types (Collector, Harvester)', ({ assert }) => {
        assert.isTrue(isActiveComponent(new TestCollector()))
        assert.isTrue(isActiveComponent(new TestHarvester()))
        assert.isFalse(isActiveComponent(new TestHandler()))
        assert.isFalse(isActiveComponent(new TestAssetsManager()))
        assert.isFalse(isActiveComponent(new TestCustomTableManager()))
    })
})
