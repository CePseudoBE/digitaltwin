import { test } from '@japa/runner'
import { AssetsManager } from '../src/assets_manager.js'
import type { CreateAssetRequest, UpdateAssetRequest } from '../src/assets_manager.js'
import type { AssetsManagerConfiguration, DataResponse } from '@cepseudo/shared'
import { MockDatabaseAdapter } from './mocks/mock_database_adapter.js'
import { MockStorageService } from './mocks/mock_storage_service.js'
import { AuthConfig, ApisixAuthParser } from '@cepseudo/auth'

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

function disableAuth() {
    process.env.DIGITALTWIN_DISABLE_AUTH = 'true'
    AuthConfig._resetConfig()
    ApisixAuthParser._resetProvider()
}

function createManager() {
    const storage = new MockStorageService()
    const db = new MockDatabaseAdapter({ storage })
    const manager = new TestAssetsManager()
    manager.setDependencies(db, storage)
    return { manager, db, storage }
}

test.group('AssetsManager — upload', (group) => {
    group.setup(() => disableAuth())

    test('uploadAsset() stores file in storage and saves metadata to database', async ({ assert }) => {
        const { manager, db } = createManager()

        const request: CreateAssetRequest = {
            description: 'Test file',
            source: 'https://example.com/source',
            owner_id: null,
            filename: 'test.bin',
            file: Buffer.from('test file content'),
            is_public: true
        }

        await manager.uploadAsset(request)

        assert.equal(db.getRecordCount(), 1)

        const savedRecord = await db.getLatestByName('test_assets')
        assert.isDefined(savedRecord)
        assert.equal(savedRecord!.name, 'test_assets')
        assert.equal(savedRecord!.description, 'Test file')
        assert.equal(savedRecord!.source, 'https://example.com/source')
        assert.isNull(savedRecord!.owner_id)
        assert.equal(savedRecord!.filename, 'test.bin')
        assert.equal(savedRecord!.contentType, 'application/octet-stream')
    })

    test('uploadAsset() rejects invalid source URL', async ({ assert }) => {
        const { manager } = createManager()

        const request: CreateAssetRequest = {
            description: 'Test file',
            source: 'not-a-valid-url',
            owner_id: null,
            filename: 'test.bin',
            file: Buffer.from('test file content')
        }

        await assert.rejects(async () => {
            await manager.uploadAsset(request)
        }, 'Invalid source URL')
    })

    test('handleUpload() saves file from multipart form request', async ({ assert }) => {
        const { manager, db } = createManager()

        const response = await manager.handleUpload({
            body: {
                description: 'Uploaded file',
                source: 'https://example.com/upload',
                owner_id: 'user456',
                filename: 'upload.bin'
            },
            file: { buffer: Buffer.from('uploaded content') }
        })

        assert.equal(response.status, 200)
        const result = JSON.parse(response.content as string)
        assert.equal(result.message, 'Asset uploaded successfully')
        assert.equal(db.getRecordCount(), 1)
    })

    test('handleUpload() rejects request missing required fields', async ({ assert }) => {
        const { manager } = createManager()

        const response = await manager.handleUpload({
            body: { description: 'Uploaded file' },
            file: { buffer: Buffer.from('uploaded content') }
        })

        assert.equal(response.status, 400)
        const result = JSON.parse(response.content as string)
        assert.include(result.error, 'Missing required fields')
    })

    test('handleUpload() rejects request without file', async ({ assert }) => {
        const { manager } = createManager()

        const response = await manager.handleUpload({
            body: {
                description: 'No file',
                source: 'https://example.com/test'
            }
        })

        assert.equal(response.status, 400)
        const result = JSON.parse(response.content as string)
        assert.include(result.error, 'Missing required fields')
    })

    test('uploadAssetsBatch() saves all assets to database', async ({ assert }) => {
        const { manager, db } = createManager()

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

        await manager.uploadAssetsBatch(requests)

        assert.equal(db.getRecordCount(), 2)
        const allAssets = await manager.getAllAssets()
        assert.equal(allAssets.length, 2)

        const asset1 = allAssets.find(a => a.description === 'Batch file 1')
        assert.isDefined(asset1)
        assert.equal(asset1!.source, 'https://example.com/batch1')
    })

    test('handleUploadBatch() reports per-item success/failure', async ({ assert }) => {
        const { manager } = createManager()

        const response = await manager.handleUploadBatch({
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
                        source: 'invalid-url',
                        owner_id: 'user2',
                        filename: 'invalid.bin',
                        file: Buffer.from('invalid content').toString('base64')
                    }
                ]
            }
        })

        assert.equal(response.status, 207)
        const result = JSON.parse(response.content as string)
        assert.include(result.message, '1/2 assets uploaded successfully')
        assert.isTrue(result.results[0].success)
        assert.isFalse(result.results[1].success)
    })
})

test.group('AssetsManager — retrieve', (group) => {
    group.setup(() => disableAuth())

    test('returns all assets sorted newest-first with metadata and URLs', async ({ assert }) => {
        const { manager, db } = createManager()

        await db.save({
            id: 1, name: 'test_assets', type: 'application/octet-stream',
            url: 'test_assets/1/file1.bin', date: new Date('2024-01-01'),
            description: 'First asset', source: 'https://example.com/1',
            owner_id: 'user1', filename: 'file1.bin'
        })

        await db.save({
            id: 2, name: 'test_assets', type: 'application/octet-stream',
            url: 'test_assets/2/file2.bin', date: new Date('2024-01-02'),
            description: 'Second asset', source: 'https://example.com/2',
            owner_id: 'user2', filename: 'file2.bin'
        })

        const response: DataResponse = await manager.retrieve()

        assert.equal(response.status, 200)
        const assets = JSON.parse(response.content as string)
        assert.equal(assets.length, 2)

        // Newest first
        assert.equal(assets[0].description, 'Second asset')
        assert.equal(assets[0].source, 'https://example.com/2')
        assert.equal(assets[0].filename, 'file2.bin')
        assert.equal(assets[0].url, '/test_assets/2')
        assert.equal(assets[0].download_url, '/test_assets/2/download')

        assert.equal(assets[1].description, 'First asset')
    })

    test('returns empty array when no assets exist', async ({ assert }) => {
        const { manager } = createManager()

        const response = await manager.retrieve()

        assert.equal(response.status, 200)
        const assets = JSON.parse(response.content as string)
        assert.isArray(assets)
        assert.lengthOf(assets, 0)
    })
})

test.group('AssetsManager — get and download', (group) => {
    group.setup(() => disableAuth())

    test('handleGetAsset() returns file content without Content-Disposition', async ({ assert }) => {
        const storage = new MockStorageService()
        const mockBlob = Buffer.from('asset file content')

        const existingRecord = {
            id: 123, name: 'test_assets', contentType: 'application/octet-stream',
            url: 'test_assets/123/test.bin', date: new Date(),
            data: async () => mockBlob,
            description: 'Test asset', source: 'https://example.com/test',
            owner_id: 'user123', filename: 'test.bin', is_public: true
        }

        const db = new MockDatabaseAdapter({ storage, initialData: [existingRecord] })
        const manager = new TestAssetsManager()
        manager.setDependencies(db, storage)

        const response = await manager.handleGetAsset({ params: { id: '123' } })

        assert.equal(response.status, 200)
        assert.deepEqual(response.content, mockBlob)
        assert.equal(response.headers?.['Content-Type'], 'application/octet-stream')
        assert.isUndefined(response.headers?.['Content-Disposition'])
    })

    test('handleDownload() returns file content with attachment Content-Disposition', async ({ assert }) => {
        const storage = new MockStorageService()
        const mockBlob = Buffer.from('asset file content')

        const existingRecord = {
            id: 123, name: 'test_assets', contentType: 'application/octet-stream',
            url: 'test_assets/123/test.bin', date: new Date(),
            data: async () => mockBlob,
            description: 'Test asset', source: 'https://example.com/test',
            owner_id: 'user123', filename: 'test.bin', is_public: true
        }

        const db = new MockDatabaseAdapter({ storage, initialData: [existingRecord] })
        const manager = new TestAssetsManager()
        manager.setDependencies(db, storage)

        const response = await manager.handleDownload({ params: { id: '123' } })

        assert.equal(response.status, 200)
        assert.deepEqual(response.content, mockBlob)
        assert.equal(response.headers?.['Content-Type'], 'application/octet-stream')
        assert.equal(response.headers?.['Content-Disposition'], 'attachment; filename="test.bin"')
    })

    test('handleGetAsset() returns 404 for asset from different component', async ({ assert }) => {
        const storage = new MockStorageService()
        const otherComponentRecord = {
            id: 123, name: 'other_assets', contentType: 'application/json',
            url: 'other_assets/123/file.json', date: new Date(),
            data: async () => Buffer.from('content'),
        }

        const db = new MockDatabaseAdapter({ storage, initialData: [otherComponentRecord] })
        const manager = new TestAssetsManager()
        manager.setDependencies(db, storage)

        const response = await manager.handleGetAsset({ params: { id: '123' } })
        assert.equal(response.status, 404)
    })
})

test.group('AssetsManager — update', (group) => {
    group.setup(() => disableAuth())

    test('updateAssetMetadata() changes description and source without affecting other fields', async ({ assert }) => {
        const storage = new MockStorageService()
        const originalRecord = {
            id: 123, name: 'test_assets', contentType: 'application/octet-stream',
            url: 'test_assets/123/test.bin', date: new Date(),
            data: async () => Buffer.from('content'),
            description: 'Original description', source: 'https://example.com/original',
            owner_id: 'user123', filename: 'test.bin'
        }

        const db = new MockDatabaseAdapter({ storage, initialData: [originalRecord] })
        const manager = new TestAssetsManager()
        manager.setDependencies(db, storage)

        const updates: UpdateAssetRequest = {
            description: 'Updated description',
            source: 'https://example.com/updated'
        }

        await manager.updateAssetMetadata('123', updates)

        const updatedRecord = await db.getById('123')
        assert.equal(updatedRecord!.description, 'Updated description')
        assert.equal(updatedRecord!.source, 'https://example.com/updated')
        assert.equal(updatedRecord!.owner_id, 'user123')
        assert.equal(updatedRecord!.filename, 'test.bin')
    })

    test('handleUpdate() updates asset metadata via HTTP', async ({ assert }) => {
        const storage = new MockStorageService()
        const existingRecord = {
            id: 123, name: 'test_assets', contentType: 'application/octet-stream',
            url: 'test_assets/123/test.bin', date: new Date(),
            data: async () => Buffer.from('content'),
            description: 'Original', source: 'https://example.com/original',
            owner_id: null, filename: 'test.bin', is_public: true
        }

        const db = new MockDatabaseAdapter({ storage, initialData: [existingRecord] })
        const manager = new TestAssetsManager()
        manager.setDependencies(db, storage)

        const response = await manager.handleUpdate({
            params: { id: '123' },
            body: { description: 'Updated via HTTP' }
        })

        assert.equal(response.status, 200)
        const updatedRecord = await db.getById('123')
        assert.equal(updatedRecord!.description, 'Updated via HTTP')
    })
})

test.group('AssetsManager — delete', (group) => {
    group.setup(() => disableAuth())

    test('deleteAssetById() removes asset from database', async ({ assert }) => {
        const storage = new MockStorageService()
        const recordToDelete = {
            id: 123, name: 'test_assets', contentType: 'application/octet-stream',
            url: 'test_assets/123/delete.bin', date: new Date(),
            data: async () => Buffer.from('content'),
            description: 'To be deleted', source: 'https://example.com/delete',
            owner_id: 'user123', filename: 'delete.bin'
        }

        const db = new MockDatabaseAdapter({ storage, initialData: [recordToDelete] })
        const manager = new TestAssetsManager()
        manager.setDependencies(db, storage)

        assert.isTrue(db.hasRecord('123'))
        await manager.deleteAssetById('123')
        assert.isFalse(db.hasRecord('123'))
    })

    test('handleDeleteBatch() reports per-item success/failure', async ({ assert }) => {
        const { manager, db } = createManager()

        await db.save({
            id: 1, name: 'test_assets', type: 'application/octet-stream',
            url: 'test_assets/1/file1.bin', date: new Date(),
            description: 'Existing asset', source: 'https://example.com/1',
            owner_id: null, filename: 'file1.bin', is_public: true
        })

        const response = await manager.handleDeleteBatch({
            body: { ids: ['1', '999'] }
        })

        assert.equal(response.status, 207)
        const result = JSON.parse(response.content as string)
        assert.include(result.message, '1/2 assets deleted successfully')
        assert.isTrue(result.results[0].success)
        assert.isFalse(result.results[1].success)
    })

    test('deleteAssetsBatch() removes multiple assets', async ({ assert }) => {
        const { manager, db } = createManager()

        await db.save({
            id: 1, name: 'test_assets', type: 'application/octet-stream',
            url: 'test_assets/1/file1.bin', date: new Date(),
            description: 'Asset 1', source: 'https://example.com/1',
            owner_id: 'user1', filename: 'file1.bin'
        })
        await db.save({
            id: 2, name: 'test_assets', type: 'application/octet-stream',
            url: 'test_assets/2/file2.bin', date: new Date(),
            description: 'Asset 2', source: 'https://example.com/2',
            owner_id: 'user2', filename: 'file2.bin'
        })

        assert.equal(db.getRecordCount(), 2)
        await manager.deleteAssetsBatch(['1', '2'])
        assert.equal(db.getRecordCount(), 0)
    })
})
