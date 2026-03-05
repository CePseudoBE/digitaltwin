import { test } from '@japa/runner'
import { MapManager } from '../src/map_manager.js'
import { MockDatabaseAdapter } from './mocks/mock_database_adapter.js'
import { MockStorageService } from './mocks/mock_storage_service.js'
import { AuthConfig, ApisixAuthParser } from '@digitaltwin/auth'
import type { AssetsManagerConfiguration } from '@digitaltwin/shared'

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

function enableAuth() {
    delete process.env.DIGITALTWIN_DISABLE_AUTH
    AuthConfig._resetConfig()
    ApisixAuthParser._resetProvider()
}

function disableAuth() {
    process.env.DIGITALTWIN_DISABLE_AUTH = 'true'
    AuthConfig._resetConfig()
    ApisixAuthParser._resetProvider()
}

function createManager() {
    const storage = new MockStorageService()
    const db = new MockDatabaseAdapter({ storage })
    const manager = new TestMapManager()
    manager.setDependencies(db, storage)
    return { manager, db, storage }
}

test.group('MapManager — upload validation', (group) => {
    group.setup(() => enableAuth())
    group.teardown(() => disableAuth())

    test('rejects request without body', async ({ assert }) => {
        const { manager } = createManager()

        const response = await manager.handleUpload({})

        assert.equal(response.status, 400)
        assert.include(JSON.parse(response.content as string).error, 'missing request body')
    })

    test('requires authentication', async ({ assert }) => {
        const { manager } = createManager()

        const response = await manager.handleUpload({
            body: { layer: {} },
            headers: {}
        })

        assert.equal(response.status, 401)
        assert.include(JSON.parse(response.content as string).error, 'Authentication required')
    })

    test('rejects request missing layer field', async ({ assert }) => {
        const { manager } = createManager()

        const response = await manager.handleUpload({
            body: { description: 'Test' },
            headers: { 'x-user-id': 'test-user-123', 'x-user-roles': 'user' }
        })

        assert.equal(response.status, 400)
        assert.include(JSON.parse(response.content as string).error, 'layer')
    })

    test('rejects non-object layer value', async ({ assert }) => {
        const { manager } = createManager()

        const response = await manager.handleUpload({
            body: { layer: 'not an object' },
            headers: { 'x-user-id': 'test-user-123', 'x-user-roles': 'user' }
        })

        assert.equal(response.status, 400)
        assert.include(JSON.parse(response.content as string).error, 'valid JSON object')
    })
})

test.group('MapManager — layer type detection', (group) => {
    group.setup(() => enableAuth())
    group.teardown(() => disableAuth())

    test('detects GeoJSON FeatureCollection with geometry and properties', async ({ assert }) => {
        const { manager } = createManager()

        const geojsonLayer = {
            type: 'FeatureCollection',
            name: 'test_layer',
            features: [{
                type: 'Feature',
                geometry: { type: 'Point', coordinates: [0, 0] },
                properties: { name: 'Test Point', value: 42 }
            }]
        }

        const response = await manager.handleUpload({
            body: { layer: geojsonLayer, description: 'Test GeoJSON layer' },
            headers: { 'x-user-id': 'test-user-123', 'x-user-roles': 'user' }
        })

        assert.equal(response.status, 200)
        const parsed = JSON.parse(response.content as string)
        assert.equal(parsed.layer_name, 'test_layer')
        assert.equal(parsed.geometry_type, 'point')
        assert.equal(parsed.properties_count, 2)
    })

    test('detects single GeoJSON Feature', async ({ assert }) => {
        const { manager } = createManager()

        const response = await manager.handleUpload({
            body: {
                layer: {
                    type: 'Feature',
                    geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] },
                    properties: { name: 'My Polygon', area: 1 }
                }
            },
            headers: { 'x-user-id': 'test-user-123', 'x-user-roles': 'user' }
        })

        assert.equal(response.status, 200)
        assert.equal(JSON.parse(response.content as string).geometry_type, 'polygon')
    })

    test('detects layer group with sublayer count', async ({ assert }) => {
        const { manager } = createManager()

        const response = await manager.handleUpload({
            body: {
                layer: {
                    name: 'My Layer Group',
                    layers: [{ id: 'layer1', visible: true }, { id: 'layer2', visible: false }]
                }
            },
            headers: { 'x-user-id': 'test-user-123', 'x-user-roles': 'user' }
        })

        assert.equal(response.status, 200)
        const parsed = JSON.parse(response.content as string)
        assert.equal(parsed.layer_name, 'My Layer Group')
        assert.equal(parsed.properties_count, 2)
    })

    test('handles custom layer objects using title field as name', async ({ assert }) => {
        const { manager } = createManager()

        const response = await manager.handleUpload({
            body: { layer: { title: 'Custom Layer Title', data: [1, 2, 3], settings: { opacity: 0.5 } } },
            headers: { 'x-user-id': 'test-user-123', 'x-user-roles': 'user' }
        })

        assert.equal(response.status, 200)
        assert.equal(JSON.parse(response.content as string).layer_name, 'Custom Layer Title')
    })
})

test.group('MapManager — retrieve', (group) => {
    group.setup(() => enableAuth())
    group.teardown(() => disableAuth())

    test('returns uploaded layers with layer-specific metadata fields', async ({ assert }) => {
        const { manager } = createManager()

        await manager.handleUpload({
            body: {
                layer: {
                    type: 'FeatureCollection',
                    name: 'my_geojson',
                    features: [{
                        type: 'Feature',
                        geometry: { type: 'Point', coordinates: [4.35, 50.85] },
                        properties: { label: 'Brussels' }
                    }]
                },
                description: 'Test layer'
            },
            headers: { 'x-user-id': 'test-user-123', 'x-user-roles': 'user' }
        })

        const response = await manager.retrieve()

        assert.equal(response.status, 200)
        const parsed = JSON.parse(response.content as string)
        assert.isArray(parsed)
        assert.lengthOf(parsed, 1)

        const layer = parsed[0]
        assert.equal(layer.description, 'Test layer')
        assert.isDefined(layer.layer_type)
        assert.isDefined(layer.layer_name)
        assert.isDefined(layer.url)
        assert.isDefined(layer.download_url)
    })
})

test.group('MapManager — auth disabled', (group) => {
    group.setup(() => disableAuth())
    group.teardown(() => disableAuth())

    test('handleUpload works without auth headers when auth is disabled', async ({ assert }) => {
        const { manager } = createManager()

        const response = await manager.handleUpload({
            body: { layer: { name: 'test' } },
            headers: {}
        })

        assert.equal(response.status, 200)
    })
})
