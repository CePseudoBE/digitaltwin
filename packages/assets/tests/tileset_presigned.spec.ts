import { test } from '@japa/runner'
import { TilesetManager } from '../src/tileset_manager.js'
import type { AssetsManagerConfiguration } from '@digitaltwin/shared'
import { MockDatabaseAdapter } from './mocks/mock_database_adapter.js'
import { MockStorageService } from './mocks/mock_storage_service.js'
import { AuthConfig, ApisixAuthParser } from '@digitaltwin/auth'

class TestTilesetManager extends TilesetManager {
    getConfiguration(): AssetsManagerConfiguration {
        return {
            name: 'test_tilesets',
            description: 'Test tileset manager',
            contentType: 'application/json',
            tags: ['test'],
            endpoint: 'test_tilesets',
            extension: '.zip'
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
    storage.setPresignedUrlSupport(true)
    const db = new MockDatabaseAdapter({ storage })
    const manager = new TestTilesetManager()
    manager.setDependencies(db, storage)
    return { manager, db, storage }
}

function makeReq(body: Record<string, unknown> = {}, params: Record<string, string> = {}) {
    return {
        body,
        params,
        headers: { 'x-user-id': 'test-user-1', 'x-user-roles': 'user' },
        query: {}
    } as any
}

test.group('TilesetManager — presigned upload', (group) => {
    group.setup(() => disableAuth())

    test('upload-request validates .zip extension', async ({ assert }) => {
        const { manager } = createManager()

        const req = makeReq({
            fileName: 'tileset.glb',
            fileSize: 1024,
            contentType: 'application/zip'
        })

        const res = await manager.handlePresignedUploadRequest(req)
        assert.equal(res.status, 400)
        const body = JSON.parse(res.content as string)
        assert.isTrue(body.error.includes('.zip'))
    })

    test('upload-request accepts .zip files', async ({ assert }) => {
        const { manager } = createManager()

        const req = makeReq({
            fileName: 'tileset.zip',
            fileSize: 1024,
            contentType: 'application/zip',
            description: 'Test tileset'
        })

        const res = await manager.handlePresignedUploadRequest(req)
        assert.equal(res.status, 200)

        const body = JSON.parse(res.content as string)
        assert.isDefined(body.fileId)
        assert.isDefined(body.uploadUrl)
    })

    test('confirm queues BullMQ job when upload queue available', async ({ assert }) => {
        const { manager, storage } = createManager()

        // Set up a mock queue
        const queuedJobs: Array<{ name: string; data: unknown }> = []
        const mockQueue = {
            add: async (name: string, data: unknown, _opts?: unknown) => {
                const job = { id: `mock-job-${queuedJobs.length}`, name, data }
                queuedJobs.push({ name, data })
                return job
            }
        } as any
        manager.setUploadQueue(mockQueue)

        // Create a pending record via upload-request
        const uploadReq = makeReq({
            fileName: 'tileset.zip',
            fileSize: 1024,
            contentType: 'application/zip',
            description: 'Test tileset'
        })
        const uploadRes = await manager.handlePresignedUploadRequest(uploadReq)
        assert.equal(uploadRes.status, 200)

        const { fileId, key } = JSON.parse(uploadRes.content as string)

        // Simulate file exists on S3
        storage.setObjectExists(key, true)

        // Confirm
        const confirmReq = makeReq({}, { fileId: String(fileId) })
        const confirmRes = await manager.handleUploadConfirm(confirmReq)
        assert.equal(confirmRes.status, 202)

        const confirmBody = JSON.parse(confirmRes.content as string)
        assert.equal(confirmBody.status, 'processing')
        assert.isDefined(confirmBody.job_id)

        // Verify job was queued
        assert.equal(queuedJobs.length, 1)
        const jobData = queuedJobs[0].data as { type: string; presignedKey: string }
        assert.equal(jobData.type, 'tileset')
        assert.equal(jobData.presignedKey, key)
    })

    test('confirm returns error when no upload queue', async ({ assert }) => {
        const { manager, storage } = createManager()
        // No upload queue set

        // Create a pending record
        const uploadReq = makeReq({
            fileName: 'tileset.zip',
            fileSize: 1024,
            contentType: 'application/zip',
            description: 'Test tileset'
        })
        const uploadRes = await manager.handlePresignedUploadRequest(uploadReq)
        const { fileId, key } = JSON.parse(uploadRes.content as string)

        storage.setObjectExists(key, true)

        const confirmReq = makeReq({}, { fileId: String(fileId) })
        const confirmRes = await manager.handleUploadConfirm(confirmReq)
        assert.equal(confirmRes.status, 500)
    })
})
