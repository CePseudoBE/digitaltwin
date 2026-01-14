import { test } from '@japa/runner'
import { DigitalTwinEngine } from '../src/engine/digital_twin_engine.js'
import { AssetsManager } from '../src/components/assets_manager.js'
import { GlobalAssetsHandler } from '../src/components/global_assets_handler.js'
import { AssetsManagerConfiguration } from '../src/components/types.js'
import { MockDatabaseAdapter } from './mocks/mock_database_adapter.js'
import { LocalStorageService } from '../src/storage/adapters/local_storage_service.js'
import { LogLevel } from '../src/utils/logger.js'

// Test concrete implementations for different asset types
class GLTFAssetsManager extends AssetsManager {
    getConfiguration(): AssetsManagerConfiguration {
        return {
            name: 'gltf',
            description: 'GLTF 3D models manager',
            contentType: 'model/gltf-binary',
            tags: ['assets', '3d', 'gltf'],
            endpoint: 'gltf'
        }
    }
}

class PointCloudAssetsManager extends AssetsManager {
    getConfiguration(): AssetsManagerConfiguration {
        return {
            name: 'pointcloud',
            description: 'Point cloud data manager',
            contentType: 'application/octet-stream',
            tags: ['assets', 'pointcloud', 'data'],
            endpoint: 'pointcloud'
        }
    }
}

test.group('Assets Integration Tests (No Redis)', () => {
    test('Assets Manager and Global Assets Handler integration via Digital Twin Engine', async ({ assert }) => {
        // Setup infrastructure without Redis
        const storage = new LocalStorageService('.test_tmp')
        const database = new MockDatabaseAdapter({ storage })
        
        // Create concrete asset managers
        const gltfManager = new GLTFAssetsManager()
        const pointcloudManager = new PointCloudAssetsManager()
        
        // Create global assets handler
        const globalHandler = new GlobalAssetsHandler()
        
        // Setup engine WITHOUT Redis and WITHOUT collectors/harvesters
        const engine = new DigitalTwinEngine({
            // No collectors or harvesters to avoid Redis dependency
            collectors: [],
            harvesters: [],
            handlers: [globalHandler],
            assetsManagers: [gltfManager, pointcloudManager],
            database,
            storage,
            // No Redis configuration
            queues: {
                multiQueue: false, // Disable queue processing
                workers: {
                    collectors: 0,
                    harvesters: 0
                }
            },
            logging: {
                level: LogLevel.SILENT
            },
            server: {
                port: 0 // Random port
            }
        })

        // Start engine
        await engine.start()
        
        try {
            // Test 1: Upload assets to different managers
            await gltfManager.uploadAsset({
                description: 'Test GLTF building model',
                source: 'https://city-data.example.com/buildings',
                owner_id: 'user1',
                filename: 'building.glb',
                file: Buffer.from('fake gltf binary content')
            })
            
            await pointcloudManager.uploadAsset({
                description: 'Test point cloud scan',
                source: 'https://lidar.example.com/scans',
                owner_id: 'user2',
                filename: 'scan.ply',
                file: Buffer.from('fake pointcloud data')
            })
            
            // Test 2: Verify individual manager functionality
            const gltfAssets = await gltfManager.getAllAssets()
            const pointcloudAssets = await pointcloudManager.getAllAssets()
            
            assert.equal(gltfAssets.length, 1, 'GLTF manager should have 1 asset')
            assert.equal(pointcloudAssets.length, 1, 'PointCloud manager should have 1 asset')
            
            assert.equal(gltfAssets[0].name, 'gltf')
            assert.equal(gltfAssets[0].description, 'Test GLTF building model')
            assert.equal(gltfAssets[0].filename, 'building.glb')
            
            assert.equal(pointcloudAssets[0].name, 'pointcloud')
            assert.equal(pointcloudAssets[0].description, 'Test point cloud scan')
            assert.equal(pointcloudAssets[0].filename, 'scan.ply')
            
            // Test 3: Verify global handler aggregation
            const globalResponse = await globalHandler.getAllAssets()
            
            assert.equal(globalResponse.status, 200)
            assert.equal(globalResponse.headers?.['Content-Type'], 'application/json')
            
            const globalResult = JSON.parse(globalResponse.content as string)
            assert.equal(globalResult.total, 2, 'Global handler should aggregate 2 assets')
            assert.equal(globalResult.assets.length, 2)
            
            // Find assets by component
            const gltfAsset = globalResult.assets.find((a: any) => a.component === 'gltf')
            const pointcloudAsset = globalResult.assets.find((a: any) => a.component === 'pointcloud')
            
            // Verify GLTF asset in global view
            assert.isDefined(gltfAsset)
            assert.equal(gltfAsset.description, 'Test GLTF building model')
            assert.equal(gltfAsset.url, '/gltf/' + gltfAsset.id)
            assert.equal(gltfAsset.download_url, '/gltf/' + gltfAsset.id + '/download')
            assert.equal(gltfAsset.component, 'gltf')
            
            // Verify PointCloud asset in global view
            assert.isDefined(pointcloudAsset)
            assert.equal(pointcloudAsset.description, 'Test point cloud scan')
            assert.equal(pointcloudAsset.url, '/pointcloud/' + pointcloudAsset.id)
            assert.equal(pointcloudAsset.download_url, '/pointcloud/' + pointcloudAsset.id + '/download')
            assert.equal(pointcloudAsset.component, 'pointcloud')
            
            // Test 4: Test asset retrieval through managers
            const gltfAssetData = await gltfManager.getAssetById(gltfAssets[0].id.toString())
            const pointcloudAssetData = await pointcloudManager.getAssetById(pointcloudAssets[0].id.toString())
            
            assert.isDefined(gltfAssetData)
            assert.isDefined(pointcloudAssetData)
            
            const gltfContent = await gltfAssetData!.data()
            const pointcloudContent = await pointcloudAssetData!.data()
            
            assert.equal(gltfContent.toString(), 'fake gltf binary content')
            assert.equal(pointcloudContent.toString(), 'fake pointcloud data')
            
            // Test 5: Test asset update through managers
            await gltfManager.updateAssetMetadata(gltfAssets[0].id.toString(), {
                description: 'Updated GLTF building model with textures'
            })
            
            const updatedGltfAssets = await gltfManager.getAllAssets()
            assert.equal(updatedGltfAssets[0].description, 'Updated GLTF building model with textures')
            
            // Verify global view reflects the update
            const updatedGlobalResponse = await globalHandler.getAllAssets()
            const updatedGlobalResult = JSON.parse(updatedGlobalResponse.content as string)
            const updatedGltfAsset = updatedGlobalResult.assets.find((a: any) => a.component === 'gltf')
            
            assert.equal(updatedGltfAsset.description, 'Updated GLTF building model with textures')
            
            // Test 6: Test asset deletion
            const pointcloudId = pointcloudAssets[0].id.toString()
            await pointcloudManager.deleteAssetById(pointcloudId)
            
            const finalPointcloudAssets = await pointcloudManager.getAllAssets()
            assert.equal(finalPointcloudAssets.length, 0, 'PointCloud manager should have no assets after deletion')
            
            // Verify global view reflects the deletion
            const finalGlobalResponse = await globalHandler.getAllAssets()
            const finalGlobalResult = JSON.parse(finalGlobalResponse.content as string)
            assert.equal(finalGlobalResult.total, 1, 'Global handler should have 1 asset after deletion')
            assert.equal(finalGlobalResult.assets.length, 1)
            assert.equal(finalGlobalResult.assets[0].component, 'gltf')
            
        } finally {
            // Cleanup - Force stop with timeout like in full_integration.spec.ts
            await Promise.race([
                engine.stop(),
                new Promise((resolve) => setTimeout(resolve, 3000))
            ])
        }
    }).disableTimeout()

    test('Engine works without any assets managers', async ({ assert }) => {
        const storage = new LocalStorageService('.test_tmp')
        const database = new MockDatabaseAdapter({ storage })
        
        const globalHandler = new GlobalAssetsHandler()
        
        // Engine with no assets managers
        const engine = new DigitalTwinEngine({
            collectors: [],
            harvesters: [],
            handlers: [globalHandler],
            assetsManagers: [], // Empty array
            database,
            storage,
            queues: {
                multiQueue: false,
                workers: { collectors: 0, harvesters: 0 }
            },
            logging: { level: LogLevel.SILENT },
            server: { port: 0 }
        })

        await engine.start()
        
        try {
            // Test global handler with no managers
            const response = await globalHandler.getAllAssets()
            
            assert.equal(response.status, 200)
            const result = JSON.parse(response.content as string)
            assert.equal(result.total, 0)
            assert.equal(result.assets.length, 0)
            
        } finally {
            await Promise.race([
                engine.stop(),
                new Promise((resolve) => setTimeout(resolve, 3000))
            ])
        }
    }).disableTimeout()

    test('Assets Manager HTTP endpoints work correctly', async ({ assert }) => {
        const storage = new LocalStorageService('.test_tmp')
        const database = new MockDatabaseAdapter({ storage })
        
        const gltfManager = new GLTFAssetsManager()
        
        const engine = new DigitalTwinEngine({
            collectors: [],
            harvesters: [],
            handlers: [],
            assetsManagers: [gltfManager],
            database,
            storage,
            queues: { multiQueue: false, workers: { collectors: 0, harvesters: 0 } },
            logging: { level: LogLevel.SILENT },
            server: { port: 0 }
        })

        await engine.start()
        
        try {
            // Test upload endpoint
            const mockUploadRequest = {
                body: {
                    description: 'HTTP uploaded model',
                    source: 'https://example.com/http-upload',
                    owner_id: 'user123',
                    filename: 'http-model.glb'
                },
                file: {
                    buffer: Buffer.from('http uploaded content')
                }
            }
            
            const uploadResponse = await gltfManager.handleUpload(mockUploadRequest)
            assert.equal(uploadResponse.status, 200)
            
            const uploadResult = JSON.parse(uploadResponse.content as string)
            assert.equal(uploadResult.message, 'Asset uploaded successfully')
            
            // Test retrieve endpoint
            const retrieveResponse = await gltfManager.retrieve()
            assert.equal(retrieveResponse.status, 200)
            
            const assets = JSON.parse(retrieveResponse.content as string)
            assert.equal(assets.length, 1)
            assert.equal(assets[0].description, 'HTTP uploaded model')
            assert.equal(assets[0].url, '/gltf/' + assets[0].id)
            
            // Test get asset endpoint
            const assetId = assets[0].id
            const mockGetRequest = { params: { id: assetId.toString() } }
            
            const getResponse = await gltfManager.handleGetAsset(mockGetRequest)
            assert.equal(getResponse.status, 200)
            assert.equal(getResponse.headers?.['Content-Type'], 'model/gltf-binary')
            assert.deepEqual(getResponse.content, Buffer.from('http uploaded content'))
            
            // Test download endpoint
            const downloadResponse = await gltfManager.handleDownload(mockGetRequest)
            assert.equal(downloadResponse.status, 200)
            assert.equal(downloadResponse.headers?.['Content-Type'], 'model/gltf-binary')
            assert.equal(downloadResponse.headers?.['Content-Disposition'], 'attachment; filename="http-model.glb"')
            assert.deepEqual(downloadResponse.content, Buffer.from('http uploaded content'))
            
        } finally {
            await Promise.race([
                engine.stop(),
                new Promise((resolve) => setTimeout(resolve, 3000))
            ])
        }
    }).disableTimeout()
})