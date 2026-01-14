import { test } from '@japa/runner'
import { GlobalAssetsHandler } from '../../src/components/global_assets_handler.js'
import { AssetsManager } from '../../src/components/assets_manager.js'
import { AssetsManagerConfiguration } from '../../src/components/types.js'
import { MockDatabaseAdapter } from '../mocks/mock_database_adapter.js'
import { LocalStorageService } from '../../src/storage/adapters/local_storage_service.js'

// Test AssetsManager for GLTF
class TestGLTFAssetsManager extends AssetsManager {
    getConfiguration(): AssetsManagerConfiguration {
        return {
            name: 'gltf',
            description: 'GLTF 3D models manager',
            contentType: 'model/gltf-binary',
            tags: ['test', 'gltf', '3d'],
            endpoint: 'gltf'
        }
    }
}

// Test AssetsManager for PointCloud
class TestPointCloudAssetsManager extends AssetsManager {
    getConfiguration(): AssetsManagerConfiguration {
        return {
            name: 'pointcloud',
            description: 'Point cloud data manager',
            contentType: 'application/octet-stream',
            tags: ['test', 'pointcloud', 'data'],
            endpoint: 'pointcloud'
        }
    }
}

test.group('GlobalAssetsHandler (Refactored)', () => {
    test('aggregates assets from multiple AssetsManager instances', async ({ assert }) => {
        const storage = new LocalStorageService('.test_tmp')
        const database = new MockDatabaseAdapter({ storage })
        
        // Create test managers
        const gltfManager = new TestGLTFAssetsManager()
        const pointcloudManager = new TestPointCloudAssetsManager()
        
        // Initialize managers
        gltfManager.setDependencies(database, storage)
        pointcloudManager.setDependencies(database, storage)
        
        // Add test assets to each manager
        await gltfManager.uploadAsset({
            description: 'Test GLTF model',
            source: 'https://example.com/gltf',
            owner_id: 'user1',
            filename: 'model.glb',
            file: Buffer.from('gltf content')
        })
        
        await pointcloudManager.uploadAsset({
            description: 'Test point cloud',
            source: 'https://example.com/pointcloud',
            owner_id: 'user2',
            filename: 'points.ply',
            file: Buffer.from('pointcloud content')
        })
        
        // Create global handler and inject managers
        const globalHandler = new GlobalAssetsHandler()
        globalHandler.setAssetsManagers([gltfManager, pointcloudManager])
        
        // Test aggregation
        const response = await globalHandler.getAllAssets()
        
        assert.equal(response.status, 200)
        assert.equal(response.headers?.['Content-Type'], 'application/json')
        
        const result = JSON.parse(response.content as string)
        assert.equal(result.total, 2)
        assert.equal(result.assets.length, 2)
        
        // Find assets by component
        const gltfAsset = result.assets.find((a: any) => a.component === 'gltf')
        const pointcloudAsset = result.assets.find((a: any) => a.component === 'pointcloud')
        
        // Verify GLTF asset
        assert.isDefined(gltfAsset)
        assert.equal(gltfAsset.description, 'Test GLTF model')
        assert.equal(gltfAsset.url, '/gltf/' + gltfAsset.id)
        assert.equal(gltfAsset.download_url, '/gltf/' + gltfAsset.id + '/download')
        
        // Verify PointCloud asset
        assert.isDefined(pointcloudAsset)
        assert.equal(pointcloudAsset.description, 'Test point cloud')
        assert.equal(pointcloudAsset.url, '/pointcloud/' + pointcloudAsset.id)
        assert.equal(pointcloudAsset.download_url, '/pointcloud/' + pointcloudAsset.id + '/download')
    })
    
    test('handles empty managers list gracefully', async ({ assert }) => {
        const globalHandler = new GlobalAssetsHandler()
        globalHandler.setAssetsManagers([])
        
        const response = await globalHandler.getAllAssets()
        
        assert.equal(response.status, 200)
        const result = JSON.parse(response.content as string)
        assert.equal(result.total, 0)
        assert.equal(result.assets.length, 0)
    })
    
    test('continues if one manager fails', async ({ assert }) => {
        const storage = new LocalStorageService('.test_tmp')
        const database = new MockDatabaseAdapter({ storage })
        
        // Create one working manager
        const gltfManager = new TestGLTFAssetsManager()
        gltfManager.setDependencies(database, storage)
        
        // Add asset to working manager
        await gltfManager.uploadAsset({
            description: 'Working asset',
            source: 'https://example.com/working',
            owner_id: 'user1',
            filename: 'working.glb',
            file: Buffer.from('working content')
        })
        
        // Create a broken manager (no dependencies)
        const brokenManager = new TestPointCloudAssetsManager()
        // Don't set dependencies - this will cause getAllAssets to fail
        
        const globalHandler = new GlobalAssetsHandler()
        globalHandler.setAssetsManagers([gltfManager, brokenManager])
        
        const response = await globalHandler.getAllAssets()
        
        // Should still succeed with the working manager
        assert.equal(response.status, 200)
        const result = JSON.parse(response.content as string)
        assert.equal(result.total, 1)
        assert.equal(result.assets[0].component, 'gltf')
        assert.equal(result.assets[0].description, 'Working asset')
    })
})