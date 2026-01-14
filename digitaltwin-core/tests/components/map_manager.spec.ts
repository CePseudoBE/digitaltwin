import { test } from '@japa/runner'
import { MapManager } from '../../src/components/map_manager.js'
import { MockDatabaseAdapter } from '../mocks/mock_database_adapter.js'
import { LocalStorageService } from '../../src/storage/adapters/local_storage_service.js'
import { AuthConfig } from '../../src/auth/auth_config.js'
import type { AssetsManagerConfiguration } from '../../src/components/types.js'

// Test implementation of MapManager
class TestMapManager extends MapManager {
    getConfiguration(): AssetsManagerConfiguration {
        return {
            name: 'test-map-layers',
            description: 'Test map layers manager',
            contentType: 'application/json',
            extension: '.json',
            endpoint: 'test-map-layers'
        }
    }
}

// Helper functions
function ensureAuthEnabled() {
    delete process.env.DIGITALTWIN_DISABLE_AUTH
    AuthConfig._resetConfig()
}

function restoreTestEnv() {
    process.env.DIGITALTWIN_DISABLE_AUTH = 'true'
    AuthConfig._resetConfig()
}

test.group('MapManager', (group) => {
    group.setup(() => {
        ensureAuthEnabled()
    })

    group.teardown(() => {
        restoreTestEnv()
    })

    test('should return correct configuration', ({ assert }) => {
        const manager = new TestMapManager()
        const config = manager.getConfiguration()

        assert.equal(config.name, 'test-map-layers')
        assert.equal(config.contentType, 'application/json')
        assert.equal(config.extension, '.json')
    })

    test('handleUpload should reject missing request body', async ({ assert }) => {
        const manager = new TestMapManager()
        const db = new MockDatabaseAdapter()
        const storage = new LocalStorageService('.test-map')
        manager.setDependencies(db, storage)

        const response = await manager.handleUpload({})

        assert.equal(response.status, 400)
        const parsed = JSON.parse(response.content as string)
        assert.include(parsed.error, 'missing request body')
    })

    test('handleUpload should require authentication', async ({ assert }) => {
        const manager = new TestMapManager()
        const db = new MockDatabaseAdapter()
        const storage = new LocalStorageService('.test-map-auth')
        manager.setDependencies(db, storage)

        const response = await manager.handleUpload({
            body: { layer: {} },
            headers: {} // No auth headers
        })

        assert.equal(response.status, 401)
        const parsed = JSON.parse(response.content as string)
        assert.include(parsed.error, 'Authentication required')
    })

    test('handleUpload should reject missing layer field', async ({ assert }) => {
        const manager = new TestMapManager()
        const db = new MockDatabaseAdapter()
        const storage = new LocalStorageService('.test-map-layer')
        manager.setDependencies(db, storage)

        const response = await manager.handleUpload({
            body: { description: 'Test' },
            headers: {
                'x-user-id': 'test-user-123',
                'x-user-roles': 'user'
            }
        })

        assert.equal(response.status, 400)
        const parsed = JSON.parse(response.content as string)
        assert.include(parsed.error, 'layer')
    })

    test('handleUpload should reject non-object layer', async ({ assert }) => {
        const manager = new TestMapManager()
        const db = new MockDatabaseAdapter()
        const storage = new LocalStorageService('.test-map-invalid')
        manager.setDependencies(db, storage)

        const response = await manager.handleUpload({
            body: { layer: 'not an object' },
            headers: {
                'x-user-id': 'test-user-123',
                'x-user-roles': 'user'
            }
        })

        assert.equal(response.status, 400)
        const parsed = JSON.parse(response.content as string)
        assert.include(parsed.error, 'valid JSON object')
    })

    test('handleUpload should accept valid GeoJSON FeatureCollection', async ({ assert }) => {
        const manager = new TestMapManager()
        const db = new MockDatabaseAdapter()
        const storage = new LocalStorageService('.test-map-geojson')
        manager.setDependencies(db, storage)

        const geojsonLayer = {
            type: 'FeatureCollection',
            name: 'test_layer',
            features: [
                {
                    type: 'Feature',
                    geometry: { type: 'Point', coordinates: [0, 0] },
                    properties: { name: 'Test Point', value: 42 }
                }
            ]
        }

        const response = await manager.handleUpload({
            body: { layer: geojsonLayer, description: 'Test GeoJSON layer' },
            headers: {
                'x-user-id': 'test-user-123',
                'x-user-roles': 'user'
            }
        })

        assert.equal(response.status, 200)
        const parsed = JSON.parse(response.content as string)
        assert.equal(parsed.message, 'Layer uploaded successfully')
        assert.equal(parsed.layer_name, 'test_layer')
        assert.equal(parsed.geometry_type, 'point')
        assert.equal(parsed.properties_count, 2) // name and value
    })

    test('handleUpload should handle single GeoJSON Feature', async ({ assert }) => {
        const manager = new TestMapManager()
        const db = new MockDatabaseAdapter()
        const storage = new LocalStorageService('.test-map-feature')
        manager.setDependencies(db, storage)

        const feature = {
            type: 'Feature',
            geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] },
            properties: { name: 'My Polygon', area: 1 }
        }

        const response = await manager.handleUpload({
            body: { layer: feature },
            headers: {
                'x-user-id': 'test-user-123',
                'x-user-roles': 'user'
            }
        })

        assert.equal(response.status, 200)
        const parsed = JSON.parse(response.content as string)
        assert.equal(parsed.geometry_type, 'polygon')
    })

    test('handleUpload should handle layer groups', async ({ assert }) => {
        const manager = new TestMapManager()
        const db = new MockDatabaseAdapter()
        const storage = new LocalStorageService('.test-map-group')
        manager.setDependencies(db, storage)

        const layerGroup = {
            name: 'My Layer Group',
            layers: [
                { id: 'layer1', visible: true },
                { id: 'layer2', visible: false }
            ]
        }

        const response = await manager.handleUpload({
            body: { layer: layerGroup },
            headers: {
                'x-user-id': 'test-user-123',
                'x-user-roles': 'user'
            }
        })

        assert.equal(response.status, 200)
        const parsed = JSON.parse(response.content as string)
        assert.equal(parsed.layer_name, 'My Layer Group')
        assert.equal(parsed.properties_count, 2) // 2 layers
    })

    test('handleUpload should handle custom layer objects', async ({ assert }) => {
        const manager = new TestMapManager()
        const db = new MockDatabaseAdapter()
        const storage = new LocalStorageService('.test-map-custom')
        manager.setDependencies(db, storage)

        const customLayer = {
            title: 'Custom Layer Title',
            data: [1, 2, 3],
            settings: { opacity: 0.5 }
        }

        const response = await manager.handleUpload({
            body: { layer: customLayer },
            headers: {
                'x-user-id': 'test-user-123',
                'x-user-roles': 'user'
            }
        })

        assert.equal(response.status, 200)
        const parsed = JSON.parse(response.content as string)
        assert.equal(parsed.layer_name, 'Custom Layer Title')
    })

    test('retrieve should return layers with metadata', async ({ assert }) => {
        const manager = new TestMapManager()
        const db = new MockDatabaseAdapter()
        const storage = new LocalStorageService('.test-map-retrieve')
        manager.setDependencies(db, storage)

        // Upload a layer first
        await manager.handleUpload({
            body: {
                layer: { type: 'FeatureCollection', features: [] },
                description: 'Test layer'
            },
            headers: {
                'x-user-id': 'test-user-123',
                'x-user-roles': 'user'
            }
        })

        const response = await manager.retrieve()

        assert.equal(response.status, 200)
        const parsed = JSON.parse(response.content as string)
        assert.isArray(parsed)
    })
})

test.group('MapManager with auth disabled', (group) => {
    group.setup(() => {
        process.env.DIGITALTWIN_DISABLE_AUTH = 'true'
        AuthConfig._resetConfig()
    })

    group.teardown(() => {
        restoreTestEnv()
    })

    test('handleUpload should work without auth headers when auth disabled', async ({ assert }) => {
        const manager = new TestMapManager()
        const db = new MockDatabaseAdapter()
        const storage = new LocalStorageService('.test-map-noauth')
        manager.setDependencies(db, storage)

        const response = await manager.handleUpload({
            body: { layer: { name: 'test' } },
            headers: {}
        })

        assert.equal(response.status, 200)
    })
})
