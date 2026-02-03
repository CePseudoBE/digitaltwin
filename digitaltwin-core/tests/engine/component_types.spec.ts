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
} from '../../src/engine/component_types.js'
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

// Test implementations
class TestCollector extends Collector {
    getConfiguration(): CollectorConfiguration {
        return {
            name: 'test-collector',
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
    getUserConfiguration(): HarvesterConfiguration {
        return {
            name: 'test-harvester',
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
    getConfiguration(): ComponentConfiguration {
        return {
            name: 'test-handler',
            description: 'Test handler',
            contentType: 'application/json'
        }
    }
}

class TestAssetsManager extends AssetsManager {
    getConfiguration(): AssetsManagerConfiguration {
        return {
            name: 'test-assets',
            description: 'Test assets manager',
            contentType: 'image/png',
            endpoint: 'assets'
        }
    }
}

class TestCustomTableManager extends CustomTableManager {
    getConfiguration() {
        return {
            name: 'test-custom-table',
            description: 'Test custom table',
            columns: {
                custom_field: 'TEXT'
            }
        }
    }
}

test.group('Type Guards - isCollector', () => {
    test('returns true for Collector instance', ({ assert }) => {
        const collector = new TestCollector()
        assert.isTrue(isCollector(collector))
    })

    test('returns false for Harvester instance', ({ assert }) => {
        const harvester = new TestHarvester()
        assert.isFalse(isCollector(harvester))
    })

    test('returns false for Handler instance', ({ assert }) => {
        const handler = new TestHandler()
        assert.isFalse(isCollector(handler))
    })

    test('returns false for AssetsManager instance', ({ assert }) => {
        const assetsManager = new TestAssetsManager()
        assert.isFalse(isCollector(assetsManager))
    })

    test('returns false for CustomTableManager instance', ({ assert }) => {
        const customTableManager = new TestCustomTableManager()
        assert.isFalse(isCollector(customTableManager))
    })
})

test.group('Type Guards - isHarvester', () => {
    test('returns true for Harvester instance', ({ assert }) => {
        const harvester = new TestHarvester()
        assert.isTrue(isHarvester(harvester))
    })

    test('returns false for Collector instance', ({ assert }) => {
        const collector = new TestCollector()
        assert.isFalse(isHarvester(collector))
    })

    test('returns false for Handler instance', ({ assert }) => {
        const handler = new TestHandler()
        assert.isFalse(isHarvester(handler))
    })
})

test.group('Type Guards - isHandler', () => {
    test('returns true for Handler instance', ({ assert }) => {
        const handler = new TestHandler()
        assert.isTrue(isHandler(handler))
    })

    test('returns false for Collector instance', ({ assert }) => {
        const collector = new TestCollector()
        assert.isFalse(isHandler(collector))
    })

    test('returns false for Harvester instance', ({ assert }) => {
        const harvester = new TestHarvester()
        assert.isFalse(isHandler(harvester))
    })

    test('returns false for AssetsManager instance', ({ assert }) => {
        const assetsManager = new TestAssetsManager()
        assert.isFalse(isHandler(assetsManager))
    })
})

test.group('Type Guards - isAssetsManager', () => {
    test('returns true for AssetsManager instance', ({ assert }) => {
        const assetsManager = new TestAssetsManager()
        assert.isTrue(isAssetsManager(assetsManager))
    })

    test('returns false for Handler instance', ({ assert }) => {
        const handler = new TestHandler()
        assert.isFalse(isAssetsManager(handler))
    })

    test('returns false for Collector instance', ({ assert }) => {
        const collector = new TestCollector()
        assert.isFalse(isAssetsManager(collector))
    })
})

test.group('Type Guards - isCustomTableManager', () => {
    test('returns true for CustomTableManager instance', ({ assert }) => {
        const customTableManager = new TestCustomTableManager()
        assert.isTrue(isCustomTableManager(customTableManager))
    })

    test('returns false for Handler instance', ({ assert }) => {
        const handler = new TestHandler()
        assert.isFalse(isCustomTableManager(handler))
    })

    test('returns false for AssetsManager instance', ({ assert }) => {
        const assetsManager = new TestAssetsManager()
        assert.isFalse(isCustomTableManager(assetsManager))
    })
})

test.group('Type Guards - isActiveComponent', () => {
    test('returns true for Collector (schedulable)', ({ assert }) => {
        const collector = new TestCollector()
        assert.isTrue(isActiveComponent(collector))
    })

    test('returns true for Harvester (schedulable)', ({ assert }) => {
        const harvester = new TestHarvester()
        assert.isTrue(isActiveComponent(harvester))
    })

    test('returns false for Handler (not schedulable)', ({ assert }) => {
        const handler = new TestHandler()
        assert.isFalse(isActiveComponent(handler))
    })

    test('returns false for AssetsManager (not schedulable)', ({ assert }) => {
        const assetsManager = new TestAssetsManager()
        assert.isFalse(isActiveComponent(assetsManager))
    })

    test('returns false for CustomTableManager (not schedulable)', ({ assert }) => {
        const customTableManager = new TestCustomTableManager()
        assert.isFalse(isActiveComponent(customTableManager))
    })
})

test.group('detectComponentType', () => {
    test('detects collector type correctly', ({ assert }) => {
        const collector = new TestCollector()
        const type = detectComponentType(collector)
        assert.equal(type, 'collector')
    })

    test('detects harvester type correctly', ({ assert }) => {
        const harvester = new TestHarvester()
        const type = detectComponentType(harvester)
        assert.equal(type, 'harvester')
    })

    test('detects handler type correctly', ({ assert }) => {
        const handler = new TestHandler()
        const type = detectComponentType(handler)
        assert.equal(type, 'handler')
    })

    test('detects assets_manager type correctly', ({ assert }) => {
        const assetsManager = new TestAssetsManager()
        const type = detectComponentType(assetsManager)
        assert.equal(type, 'assets_manager')
    })

    test('detects custom_table_manager type correctly', ({ assert }) => {
        const customTableManager = new TestCustomTableManager()
        const type = detectComponentType(customTableManager)
        assert.equal(type, 'custom_table_manager')
    })

    test('throws error for invalid object without getConfiguration', ({ assert }) => {
        const invalidObject = { foo: 'bar' } as unknown as AnyComponent

        assert.throws(() => detectComponentType(invalidObject), /Unable to detect component type/)
    })

    test('throws error for object with getConfiguration but wrong structure', ({ assert }) => {
        const invalidComponent = {
            getConfiguration: () => ({ name: 'fake' })
        } as unknown as AnyComponent

        assert.throws(() => detectComponentType(invalidComponent), /Unable to detect component type/)
    })
})
