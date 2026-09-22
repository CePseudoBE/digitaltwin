import { test } from '@japa/runner'
import { TilesetManager } from '../src/tileset_manager.js'
import type { AssetsManagerConfiguration } from '@cepseudo/shared'
import { MockDatabaseAdapter } from './mocks/mock_database_adapter.js'
import { MockStorageService } from './mocks/mock_storage_service.js'

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
    process.env.AUTH_MODE = 'none'
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

test.group('TilesetManager — upload_status state machine', (group) => {
    group.setup(() => disableAuth())

    async function pendingUpload(manager: TestTilesetManager, storage: MockStorageService) {
        const uploadRes = await manager.handlePresignedUploadRequest(makeReq({
            fileName: 'tileset.zip', fileSize: 1024, contentType: 'application/zip', description: 'race'
        }))
        const { fileId, key } = JSON.parse(uploadRes.content as string)
        storage.setObjectExists(key, true)
        return { fileId: Number(fileId), key }
    }

    test('reconciler before confirm: the row is uploaded, confirm still queues extraction', async ({ assert }) => {
        const { manager, db, storage } = createManager()
        const queued: unknown[] = []
        manager.setUploadQueue({ add: async (name: string, data: unknown) => { queued.push(data); return { id: name } } } as any)
        const { fileId } = await pendingUpload(manager, storage)

        // What the reconciler does when it wins the race
        await db.updateById('test_tilesets', fileId, { upload_status: 'uploaded' })

        const res = await manager.handleUploadConfirm(makeReq({}, { fileId: String(fileId) }))
        assert.equal(res.status, 202)
        assert.lengthOf(queued, 1)
        assert.equal((await db.getById(String(fileId)))!.upload_status, 'processing')
    })

    test('confirm before the worker: processing is written before the job is enqueued and a fast worker is not overwritten', async ({ assert }) => {
        const { manager, db, storage } = createManager()
        const { fileId } = await pendingUpload(manager, storage)

        let statusWhenEnqueued: string | undefined
        manager.setUploadQueue({
            add: async (name: string) => {
                statusWhenEnqueued = (await db.getById(String(fileId)))!.upload_status
                // A worker that finishes before add() even returns
                await db.updateById('test_tilesets', fileId, { upload_status: 'completed', tileset_url: 'x/tileset.json' })
                return { id: name }
            }
        } as any)

        const res = await manager.handleUploadConfirm(makeReq({}, { fileId: String(fileId) }))
        assert.equal(res.status, 202)
        assert.equal(statusWhenEnqueued, 'processing')
        assert.equal((await db.getById(String(fileId)))!.upload_status, 'completed')
    })

    test('a failed enqueue puts the row back to uploaded', async ({ assert }) => {
        const { manager, db, storage } = createManager()
        const { fileId } = await pendingUpload(manager, storage)
        manager.setUploadQueue({ add: async () => { throw new Error('redis down') } } as any)

        const res = await manager.handleUploadConfirm(makeReq({}, { fileId: String(fileId) }))
        assert.equal(res.status, 500)
        assert.equal((await db.getById(String(fileId)))!.upload_status, 'uploaded')
    })

    test('confirm refuses rows that are already processing or completed', async ({ assert }) => {
        const { manager, db, storage } = createManager()
        manager.setUploadQueue({ add: async (name: string) => ({ id: name }) } as any)
        const { fileId } = await pendingUpload(manager, storage)
        for (const status of ['processing', 'completed', 'failed', 'expired']) {
            await db.updateById('test_tilesets', fileId, { upload_status: status })
            const res = await manager.handleUploadConfirm(makeReq({}, { fileId: String(fileId) }))
            assert.equal(res.status, 409, status)
        }
    })
})
