import { test } from '@japa/runner'
import { UploadProcessor } from '../src/upload_processor.js'
import type { TilesetUploadJobData } from '../src/upload_processor.js'
import { MockDatabaseAdapter } from './mocks/mock_database_adapter.js'
import { MockStorageService } from './mocks/mock_storage_service.js'
import JSZip from 'jszip'

function createProcessor() {
    const storage = new MockStorageService()
    storage.setPresignedUrlSupport(true)
    const db = new MockDatabaseAdapter({ storage })
    const processor = new UploadProcessor(storage, db)
    return { processor, db, storage }
}

function mockJob(data: TilesetUploadJobData) {
    let progress = 0
    return {
        id: `mock-job-${data.recordId}`,
        data,
        updateProgress: async (p: number) => { progress = p },
        get progress() { return progress }
    } as any
}

async function createValidTilesetZip(): Promise<Buffer> {
    const zip = new JSZip()
    zip.file('tileset.json', JSON.stringify({ asset: { version: '1.0' }, root: {} }))
    zip.file('tile_0.b3dm', Buffer.from('fake binary tile data'))
    return zip.generateAsync({ type: 'nodebuffer' })
}

async function createInvalidZip(): Promise<Buffer> {
    const zip = new JSZip()
    zip.file('readme.txt', 'no tileset.json here')
    return zip.generateAsync({ type: 'nodebuffer' })
}

test.group('UploadProcessor — presigned key path', () => {
    test('downloads ZIP from storage when presignedKey is set', async ({ assert }) => {
        const { processor, db, storage } = createProcessor()

        // Store a valid tileset ZIP in mock storage at the presigned key
        const zipBuffer = await createValidTilesetZip()
        const presignedKey = 'test_component/presigned/tileset.zip'
        await storage.saveWithPath(zipBuffer, presignedKey)

        // Create a pending record
        const record = await db.save({
            name: 'test_component',
            type: 'application/json',
            url: '',
            date: new Date(),
            description: 'test tileset',
            owner_id: 1,
            filename: 'tileset.zip',
            presigned_key: presignedKey
        })
        await db.updateById('test_component', record.id, { upload_status: 'pending' })

        const job = mockJob({
            type: 'tileset',
            recordId: record.id,
            tempFilePath: '',
            componentName: 'test_component',
            userId: 1,
            filename: 'tileset.zip',
            description: 'test tileset',
            presignedKey
        })

        await processor.processTilesetUpload(job)

        // Verify record is completed with tileset_url
        const updated = await db.getById(String(record.id))
        assert.equal(updated!.upload_status, 'completed')
        assert.isDefined(updated!.tileset_url)
        assert.isTrue((updated!.tileset_url as string).includes('tileset.json'))

        // Verify the original presigned ZIP was cleaned up
        assert.isFalse(storage.has(presignedKey))

        // Verify extracted files exist in storage
        const paths = storage.getStoredPaths()
        assert.isTrue(paths.some(p => p.includes('tileset.json')))
        assert.isTrue(paths.some(p => p.includes('tile_0.b3dm')))
    })

    test('marks record as failed when presigned file not found', async ({ assert }) => {
        const { processor, db } = createProcessor()

        const record = await db.save({
            name: 'test_component',
            type: 'application/json',
            url: '',
            date: new Date(),
            description: 'test tileset',
            owner_id: 1,
            filename: 'tileset.zip',
            presigned_key: 'nonexistent/key.zip'
        })
        await db.updateById('test_component', record.id, { upload_status: 'pending' })

        const job = mockJob({
            type: 'tileset',
            recordId: record.id,
            tempFilePath: '',
            componentName: 'test_component',
            userId: 1,
            filename: 'tileset.zip',
            description: 'test',
            presignedKey: 'nonexistent/key.zip'
        })

        await assert.rejects(() => processor.processTilesetUpload(job))

        const updated = await db.getById(String(record.id))
        assert.equal(updated!.upload_status, 'failed')
        assert.isDefined(updated!.upload_error)
    })

    test('marks record as failed when ZIP has no tileset.json', async ({ assert }) => {
        const { processor, db, storage } = createProcessor()

        const zipBuffer = await createInvalidZip()
        const presignedKey = 'test_component/presigned/bad.zip'
        await storage.saveWithPath(zipBuffer, presignedKey)

        const record = await db.save({
            name: 'test_component',
            type: 'application/json',
            url: '',
            date: new Date(),
            description: 'bad tileset',
            owner_id: 1,
            filename: 'bad.zip',
            presigned_key: presignedKey
        })
        await db.updateById('test_component', record.id, { upload_status: 'pending' })

        const job = mockJob({
            type: 'tileset',
            recordId: record.id,
            tempFilePath: '',
            componentName: 'test_component',
            userId: 1,
            filename: 'bad.zip',
            description: 'bad tileset',
            presignedKey
        })

        await assert.rejects(() => processor.processTilesetUpload(job), 'Invalid tileset: no tileset.json found in the ZIP archive')

        const updated = await db.getById(String(record.id))
        assert.equal(updated!.upload_status, 'failed')
    })

    test('cleans up presigned ZIP even on extraction failure', async ({ assert }) => {
        const { processor, db, storage } = createProcessor()

        const zipBuffer = await createInvalidZip()
        const presignedKey = 'test_component/presigned/cleanup.zip'
        await storage.saveWithPath(zipBuffer, presignedKey)

        const record = await db.save({
            name: 'test_component',
            type: 'application/json',
            url: '',
            date: new Date(),
            description: 'test',
            owner_id: 1,
            filename: 'cleanup.zip',
            presigned_key: presignedKey
        })
        await db.updateById('test_component', record.id, { upload_status: 'pending' })

        const job = mockJob({
            type: 'tileset',
            recordId: record.id,
            tempFilePath: '',
            componentName: 'test_component',
            userId: 1,
            filename: 'cleanup.zip',
            description: 'test',
            presignedKey
        })

        await assert.rejects(() => processor.processTilesetUpload(job))

        // The presigned ZIP should be cleaned up even on failure
        assert.isFalse(storage.has(presignedKey))
    })
})
