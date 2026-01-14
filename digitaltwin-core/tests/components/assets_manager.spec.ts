import { test } from '@japa/runner'
import { AssetsManager, CreateAssetRequest, UpdateAssetRequest } from '../../src/components/assets_manager.js'
import type { AssetsManagerConfiguration, DataResponse } from '../../src/components/types.js'
import { MockDatabaseAdapter } from '../mocks/mock_database_adapter.js'
import { LocalStorageService } from '../../src/storage/adapters/local_storage_service.js'

class TestAssetsManager extends AssetsManager {
    getConfiguration(): AssetsManagerConfiguration {
        return {
            name: 'test_assets',
            description: 'Test assets manager',
            contentType: 'application/octet-stream',
            tags: ['test', 'assets'],
            endpoint: 'test_assets'
        }
    }
}

test.group('AssetsManager', () => {
    test('uploadAsset() saves file and metadata with JSON type field', async ({ assert }) => {
        const storage = new LocalStorageService('.test_tmp')
        const db = new MockDatabaseAdapter({ storage })

        const assetsManager = new TestAssetsManager()
        assetsManager.setDependencies(db, storage)

        const request: CreateAssetRequest = {
            description: 'Test file',
            source: 'https://example.com/source',
            owner_id: null,
            filename: 'test.bin',
            file: Buffer.from('test file content'),
            is_public: true
        }

        await assetsManager.uploadAsset(request)

        assert.equal(db.getRecordCount(), 1)

        const savedRecord = await db.getLatestByName('test_assets')
        assert.isDefined(savedRecord)
        assert.equal(savedRecord!.name, 'test_assets')

        // Verify asset metadata is stored as properties
        assert.equal(savedRecord!.description, 'Test file')
        assert.equal(savedRecord!.source, 'https://example.com/source')
        assert.isNull(savedRecord!.owner_id)
        assert.equal(savedRecord!.filename, 'test.bin')
        assert.equal(savedRecord!.contentType, 'application/octet-stream')
    })

    test('uploadAsset() validates source URL', async ({ assert }) => {
        const storage = new LocalStorageService('.test_tmp')
        const db = new MockDatabaseAdapter({ storage })

        const assetsManager = new TestAssetsManager()
        assetsManager.setDependencies(db, storage)

        const request: CreateAssetRequest = {
            description: 'Test file',
            source: 'not-a-valid-url',
            owner_id: null,
            filename: 'test.bin',
            file: Buffer.from('test file content')
        }

        await assert.rejects(async () => {
            await assetsManager.uploadAsset(request)
        }, 'Invalid source URL')
    })

    test('retrieve() returns all assets with metadata', async ({ assert }) => {
        const storage = new LocalStorageService('.test_tmp')
        const db = new MockDatabaseAdapter({ storage })

        const assetsManager = new TestAssetsManager()
        assetsManager.setDependencies(db, storage)

        // Add test assets using AssetMetadataRow format
        await db.save({
            id: 1,
            name: 'test_assets',
            type: 'application/octet-stream',
            url: 'test_assets/1/file1.bin',
            date: new Date('2024-01-01'),
            description: 'First asset',
            source: 'https://example.com/1',
            owner_id: 'user1',
            filename: 'file1.bin'
        })

        await db.save({
            id: 2,
            name: 'test_assets',
            type: 'application/octet-stream',
            url: 'test_assets/2/file2.bin',
            date: new Date('2024-01-02'),
            description: 'Second asset',
            source: 'https://example.com/2',
            owner_id: 'user2',
            filename: 'file2.bin'
        })

        const response: DataResponse = await assetsManager.retrieve()

        assert.equal(response.status, 200)
        assert.equal(response.headers?.['Content-Type'], 'application/json')

        const assets = JSON.parse(response.content as string)
        assert.equal(assets.length, 2)

        // Check first asset (should be newest first)
        const asset1 = assets[0]
        assert.equal(asset1.description, 'Second asset')
        assert.equal(asset1.source, 'https://example.com/2')
        assert.equal(asset1.filename, 'file2.bin')
        assert.equal(asset1.url, '/test_assets/2')
        assert.equal(asset1.download_url, '/test_assets/2/download')

        // Check second asset
        const asset2 = assets[1]
        assert.equal(asset2.description, 'First asset')
        assert.equal(asset2.source, 'https://example.com/1')
    })

    test('handleUpload() processes multipart form data', async ({ assert }) => {
        const storage = new LocalStorageService('.test_tmp')
        const db = new MockDatabaseAdapter({ storage })

        const assetsManager = new TestAssetsManager()
        assetsManager.setDependencies(db, storage)

        const mockRequest = {
            body: {
                description: 'Uploaded file',
                source: 'https://example.com/upload',
                owner_id: 'user456',
                filename: 'upload.bin'
            },
            file: {
                buffer: Buffer.from('uploaded content')
            }
        }

        const response = await assetsManager.handleUpload(mockRequest)

        assert.equal(response.status, 200)
        assert.equal(response.headers?.['Content-Type'], 'application/json')

        const result = JSON.parse(response.content as string)
        assert.equal(result.message, 'Asset uploaded successfully')

        // Verify it was saved
        assert.equal(db.getRecordCount(), 1)
    })

    test('handleUpload() validates required fields', async ({ assert }) => {
        const storage = new LocalStorageService('.test_tmp')
        const db = new MockDatabaseAdapter({ storage })

        const assetsManager = new TestAssetsManager()
        assetsManager.setDependencies(db, storage)

        const mockRequest = {
            body: {
                description: 'Uploaded file'
                // Missing source, owner_id, filename
            },
            file: {
                buffer: Buffer.from('uploaded content')
            }
        }

        const response = await assetsManager.handleUpload(mockRequest)

        assert.equal(response.status, 400)

        const result = JSON.parse(response.content as string)
        assert.include(result.error, 'Missing required fields')
    })

    test('handleGetAsset() returns file content for display', async ({ assert }) => {
        const storage = new LocalStorageService('.test_tmp')
        const db = new MockDatabaseAdapter({ storage })

        const assetsManager = new TestAssetsManager()
        assetsManager.setDependencies(db, storage)

        const mockBlob = Buffer.from('asset file content')

        // Create a mock record using AssetMetadataRow format
        const existingRecord = {
            id: 123,
            name: 'test_assets',
            contentType: 'application/octet-stream',
            url: 'test_assets/123/test.bin',
            date: new Date(),
            data: async () => mockBlob,
            description: 'Test asset',
            source: 'https://example.com/test',
            owner_id: 'user123',
            filename: 'test.bin',
            is_public: true
        }

        const dbWithData = new MockDatabaseAdapter({
            storage,
            initialData: [existingRecord]
        })

        assetsManager.setDependencies(dbWithData, storage)

        const mockRequest = {
            params: { id: '123' }
        }

        const response = await assetsManager.handleGetAsset(mockRequest)

        assert.equal(response.status, 200)
        assert.deepEqual(response.content, mockBlob)
        assert.equal(response.headers?.['Content-Type'], 'application/octet-stream')
        // Should NOT have Content-Disposition header (for display, not download)
        assert.isUndefined(response.headers?.['Content-Disposition'])
    })

    test('handleDownload() returns file content with download headers', async ({ assert }) => {
        const storage = new LocalStorageService('.test_tmp')
        const db = new MockDatabaseAdapter({ storage })

        const assetsManager = new TestAssetsManager()
        assetsManager.setDependencies(db, storage)

        const mockBlob = Buffer.from('asset file content')

        // Create a mock record using AssetMetadataRow format
        const existingRecord = {
            id: 123,
            name: 'test_assets',
            contentType: 'application/octet-stream',
            url: 'test_assets/123/test.bin',
            date: new Date(),
            data: async () => mockBlob,
            description: 'Test asset',
            source: 'https://example.com/test',
            owner_id: 'user123',
            filename: 'test.bin',
            is_public: true
        }

        const dbWithData = new MockDatabaseAdapter({
            storage,
            initialData: [existingRecord]
        })

        assetsManager.setDependencies(dbWithData, storage)

        const mockRequest = {
            params: { id: '123' }
        }

        const response = await assetsManager.handleDownload(mockRequest)

        assert.equal(response.status, 200)
        assert.deepEqual(response.content, mockBlob)
        assert.equal(response.headers?.['Content-Type'], 'application/octet-stream')
        assert.equal(response.headers?.['Content-Disposition'], 'attachment; filename="test.bin"')
    })

    test('updateAssetMetadata() updates existing asset', async ({ assert }) => {
        const storage = new LocalStorageService('.test_tmp')
        const db = new MockDatabaseAdapter({ storage })

        const assetsManager = new TestAssetsManager()
        assetsManager.setDependencies(db, storage)

        // Create original record using AssetMetadataRow format
        const originalRecord = {
            id: 123,
            name: 'test_assets',
            contentType: 'application/octet-stream',
            url: 'test_assets/123/test.bin',
            date: new Date(),
            data: async () => Buffer.from('content'),
            description: 'Original description',
            source: 'https://example.com/original',
            owner_id: 'user123',
            filename: 'test.bin'
        }

        const dbWithData = new MockDatabaseAdapter({
            storage,
            initialData: [originalRecord]
        })

        assetsManager.setDependencies(dbWithData, storage)

        const updates: UpdateAssetRequest = {
            description: 'Updated description',
            source: 'https://example.com/updated'
        }

        await assetsManager.updateAssetMetadata('123', updates)

        // Verify the record was updated
        const updatedRecord = await dbWithData.getById('123')
        assert.isDefined(updatedRecord)

        // Now metadata fields are direct properties
        assert.equal(updatedRecord!.description, 'Updated description')
        assert.equal(updatedRecord!.source, 'https://example.com/updated')
        assert.equal(updatedRecord!.owner_id, 'user123') // Should remain unchanged
        assert.equal(updatedRecord!.filename, 'test.bin') // Should remain unchanged
    })

    test('deleteAssetById() removes asset', async ({ assert }) => {
        const storage = new LocalStorageService('.test_tmp')
        const db = new MockDatabaseAdapter({ storage })

        const assetsManager = new TestAssetsManager()
        assetsManager.setDependencies(db, storage)

        // Create record using AssetMetadataRow format
        const recordToDelete = {
            id: 123,
            name: 'test_assets',
            contentType: 'application/octet-stream',
            url: 'test_assets/123/delete.bin',
            date: new Date(),
            data: async () => Buffer.from('content'),
            description: 'To be deleted',
            source: 'https://example.com/delete',
            owner_id: 'user123',
            filename: 'delete.bin'
        }

        const dbWithData = new MockDatabaseAdapter({
            storage,
            initialData: [recordToDelete]
        })

        assetsManager.setDependencies(dbWithData, storage)

        assert.isTrue(dbWithData.hasRecord('123'))

        await assetsManager.deleteAssetById('123')

        assert.isFalse(dbWithData.hasRecord('123'))
    })

    test('prevents cross-component access', async ({ assert }) => {
        const storage = new LocalStorageService('.test_tmp')
        const db = new MockDatabaseAdapter({ storage })

        const assetsManager = new TestAssetsManager()
        assetsManager.setDependencies(db, storage)

        // Create record from different component
        const otherComponentRecord = {
            id: 123,
            name: 'other_assets', // Different component name
            contentType: 'application/json',
            url: 'other_assets/123/file.json',
            date: new Date(),
            data: async () => Buffer.from('content'),
        }

        const dbWithData = new MockDatabaseAdapter({
            storage,
            initialData: [otherComponentRecord]
        })

        assetsManager.setDependencies(dbWithData, storage)

        const mockRequest = {
            params: { id: '123' }
        }

        // Should not be able to access asset from different component
        const response = await assetsManager.handleGetAsset(mockRequest)
        assert.equal(response.status, 404)
    })

    test('uploadAssetsBatch() uploads multiple assets', async ({ assert }) => {
        const storage = new LocalStorageService('.test_tmp')
        const db = new MockDatabaseAdapter({ storage })

        const assetsManager = new TestAssetsManager()
        assetsManager.setDependencies(db, storage)

        const requests: CreateAssetRequest[] = [
            {
                description: 'Batch file 1',
                source: 'https://example.com/batch1',
                owner_id: null,
                filename: 'batch1.bin',
                file: Buffer.from('batch content 1'),
                is_public: true
            },
            {
                description: 'Batch file 2',
                source: 'https://example.com/batch2',
                owner_id: null,
                filename: 'batch2.bin',
                file: Buffer.from('batch content 2'),
                is_public: true
            }
        ]

        await assetsManager.uploadAssetsBatch(requests)

        assert.equal(db.getRecordCount(), 2)

        const allAssets = await assetsManager.getAllAssets()
        assert.equal(allAssets.length, 2)

        // Verify first asset
        const asset1 = allAssets.find(a => a.description === 'Batch file 1')
        assert.isDefined(asset1)
        assert.equal(asset1!.source, 'https://example.com/batch1')
        assert.equal(asset1!.filename, 'batch1.bin')
    })

    test('deleteAssetsBatch() deletes multiple assets', async ({ assert }) => {
        const storage = new LocalStorageService('.test_tmp')
        const db = new MockDatabaseAdapter({ storage })

        const assetsManager = new TestAssetsManager()
        assetsManager.setDependencies(db, storage)

        // Create test assets
        const asset1 = await db.save({
            id: 1,
            name: 'test_assets',
            type: 'application/octet-stream',
            url: 'test_assets/1/file1.bin',
            date: new Date(),
            description: 'Asset 1',
            source: 'https://example.com/1',
            owner_id: 'user1',
            filename: 'file1.bin'
        })

        const asset2 = await db.save({
            id: 2,
            name: 'test_assets',
            type: 'application/octet-stream',
            url: 'test_assets/2/file2.bin',
            date: new Date(),
            description: 'Asset 2',
            source: 'https://example.com/2',
            owner_id: 'user2',
            filename: 'file2.bin'
        })

        assert.equal(db.getRecordCount(), 2)

        await assetsManager.deleteAssetsBatch(['1', '2'])

        assert.equal(db.getRecordCount(), 0)
    })

    test('handleUploadBatch() processes multiple uploads with error handling', async ({ assert }) => {
        const storage = new LocalStorageService('.test_tmp')
        const db = new MockDatabaseAdapter({ storage })

        const assetsManager = new TestAssetsManager()
        assetsManager.setDependencies(db, storage)

        const mockRequest = {
            body: {
                requests: [
                    {
                        description: 'Valid upload',
                        source: 'https://example.com/valid',
                        owner_id: 'user1',
                        filename: 'valid.bin',
                        file: Buffer.from('valid content').toString('base64')
                    },
                    {
                        description: 'Invalid upload',
                        source: 'invalid-url', // This will cause validation error
                        owner_id: 'user2',
                        filename: 'invalid.bin',
                        file: Buffer.from('invalid content').toString('base64')
                    }
                ]
            }
        }

        const response = await assetsManager.handleUploadBatch(mockRequest)

        assert.equal(response.status, 207) // Multi-Status due to mixed results
        
        const result = JSON.parse(response.content as string)
        assert.include(result.message, '1/2 assets uploaded successfully')
        assert.equal(result.results.length, 2)
        assert.isTrue(result.results[0].success)
        assert.isFalse(result.results[1].success)
    })

    test('handleDeleteBatch() processes multiple deletions with error handling', async ({ assert }) => {
        const storage = new LocalStorageService('.test_tmp')
        const db = new MockDatabaseAdapter({ storage })

        const assetsManager = new TestAssetsManager()
        assetsManager.setDependencies(db, storage)

        // Create one test asset (with is_public: true so anonymous user can delete)
        await db.save({
            id: 1,
            name: 'test_assets',
            type: 'application/octet-stream',
            url: 'test_assets/1/file1.bin',
            date: new Date(),
            description: 'Existing asset',
            source: 'https://example.com/1',
            owner_id: null,
            filename: 'file1.bin',
            is_public: true
        })

        const mockRequest = {
            body: {
                ids: ['1', '999'] // 1 exists, 999 doesn't
            }
        }

        const response = await assetsManager.handleDeleteBatch(mockRequest)

        assert.equal(response.status, 207) // Multi-Status due to mixed results

        const result = JSON.parse(response.content as string)
        assert.include(result.message, '1/2 assets deleted successfully')
        assert.equal(result.results.length, 2)
        assert.isTrue(result.results[0].success)
        assert.isFalse(result.results[1].success)
    })
})