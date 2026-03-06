import { test } from '@japa/runner'
import { GlobalAssetsHandler } from '../src/global_assets_handler.js'
import { AssetsManager } from '@digitaltwin/assets'
import type { AssetsManagerConfiguration } from '@digitaltwin/shared'
import { MockDatabaseAdapter } from './fixtures/mock_database.js'
import { MockStorageService } from './fixtures/mock_storage.js'

class GltfManager extends AssetsManager {
    getConfiguration(): AssetsManagerConfiguration {
        return { name: 'gltf', description: 'GLTF models', contentType: 'model/gltf-binary', tags: ['3d'], endpoint: 'gltf' }
    }
}

class PointCloudManager extends AssetsManager {
    getConfiguration(): AssetsManagerConfiguration {
        return { name: 'pointcloud', description: 'Point clouds', contentType: 'application/octet-stream', tags: ['pc'], endpoint: 'pointcloud' }
    }
}

test.group('GlobalAssetsHandler', () => {
    test('aggregates assets from multiple managers with correct URLs', async ({ assert }) => {
        const storage = new MockStorageService()
        const db = new MockDatabaseAdapter({ storage })

        const gltf = new GltfManager()
        const pc = new PointCloudManager()
        gltf.setDependencies(db, storage)
        pc.setDependencies(db, storage)

        await gltf.uploadAsset({ description: 'Model', source: 'https://example.com/test', owner_id: 'u1', filename: 'a.glb', file: Buffer.from('glb') })
        await pc.uploadAsset({ description: 'Cloud', source: 'https://example.com/test', owner_id: 'u2', filename: 'b.ply', file: Buffer.from('ply') })

        const handler = new GlobalAssetsHandler()
        handler.setAssetsManagers([gltf, pc])

        const response = await handler.getAllAssets()
        const result = JSON.parse(response.content as string)

        assert.equal(response.status, 200)
        assert.equal(result.total, 2)

        const gltfAsset = result.assets.find((a: any) => a.component === 'gltf')
        assert.isDefined(gltfAsset)
        assert.equal(gltfAsset.url, `/gltf/${gltfAsset.id}`)
        assert.equal(gltfAsset.download_url, `/gltf/${gltfAsset.id}/download`)

        const pcAsset = result.assets.find((a: any) => a.component === 'pointcloud')
        assert.isDefined(pcAsset)
    })

    test('returns empty list when no managers are registered', async ({ assert }) => {
        const handler = new GlobalAssetsHandler()
        handler.setAssetsManagers([])

        const response = await handler.getAllAssets()
        const result = JSON.parse(response.content as string)

        assert.equal(result.total, 0)
        assert.deepEqual(result.assets, [])
    })

    test('continues serving assets when one manager fails', async ({ assert }) => {
        const storage = new MockStorageService()
        const db = new MockDatabaseAdapter({ storage })

        const working = new GltfManager()
        working.setDependencies(db, storage)
        await working.uploadAsset({ description: 'OK', source: 'https://example.com/test', owner_id: 'u1', filename: 'x.glb', file: Buffer.from('ok') })

        const broken = new PointCloudManager()
        // No dependencies → getAllAssets will throw

        const handler = new GlobalAssetsHandler()
        handler.setAssetsManagers([working, broken])

        const response = await handler.getAllAssets()
        const result = JSON.parse(response.content as string)

        assert.equal(response.status, 200)
        assert.equal(result.total, 1)
        assert.equal(result.assets[0].component, 'gltf')
    })
})
