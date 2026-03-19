import { test } from '@japa/runner'
import { setupInfrastructure, type E2EInfrastructure } from './helpers/setup.js'
import { makeAuthRequest } from './helpers/auth_helpers.js'
import { E2EMapManager } from './helpers/test_components.js'
import { sampleGeoJSON } from './helpers/fixtures.js'
import type { TypedRequest } from '@cepseudo/shared'

test.group('MapManager E2E', (group) => {
    let infra: E2EInfrastructure
    let manager: E2EMapManager

    group.setup(async () => {
        infra = await setupInfrastructure()
        manager = new E2EMapManager()
        manager.setDependencies(infra.db, infra.storage, infra.authMiddleware)

        const config = manager.getConfiguration()
        await infra.db.createTable(config.name)
        await infra.db.ensureColumns(config.name, {
            description: 'text',
            source: 'text',
            owner_id: 'integer',
            filename: 'text',
            is_public: 'boolean default true',
            layer_type: 'text',
            layer_name: 'text',
            geometry_type: 'text',
            properties_count: 'integer',
        })
    })

    group.teardown(async () => {
        await infra.cleanup()
    })

    test('upload GeoJSON layer via body', async ({ assert }) => {
        const geojson = sampleGeoJSON()

        const req = await makeAuthRequest(infra.db, 'user-map-1', ['user'], {
            body: {
                layer: geojson,
                description: 'Test map layer',
                source: 'https://example.com/geo',
            },
        })

        const response = await manager.handleUpload(req as unknown as TypedRequest)
        assert.equal(response.status, 200)

        const parsed = JSON.parse(response.content as string)
        assert.equal(parsed.geometry_type, 'point')
        assert.equal(parsed.properties_count, 3)
        assert.equal(parsed.layer_name, 'test_points')
    })

    test('uploaded layer metadata is analyzed correctly', async ({ assert }) => {
        const config = manager.getConfiguration()
        const latest = await infra.db.getLatestByName(config.name)
        assert.isDefined(latest)

        // Verify the layer data is stored and retrievable
        const blob = await latest!.data()
        const stored = JSON.parse(blob.toString())
        assert.equal(stored.type, 'FeatureCollection')
        assert.isArray(stored.features)
        assert.equal(stored.features.length, 2)
    })

    test('retrieve lists all layers with metadata', async ({ assert }) => {
        const response = await manager.retrieve()
        assert.equal(response.status, 200)

        const layers = JSON.parse(response.content as string)
        assert.isArray(layers)
        assert.isAbove(layers.length, 0)

        const layer = layers[0]
        assert.property(layer, 'layer_type')
        assert.property(layer, 'geometry_type')
        assert.property(layer, 'properties_count')
    })
})
