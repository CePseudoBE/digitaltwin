import { test } from '@japa/runner'
import { AssetsManager } from '../src/assets_manager.js'
import type { AssetsManagerConfiguration } from '@digitaltwin/shared'
import { MockDatabaseAdapter } from './mocks/mock_database_adapter.js'
import { MockStorageService } from './mocks/mock_storage_service.js'
import { AuthConfig, ApisixAuthParser } from '@digitaltwin/auth'

class TestPresignedAssetsManager extends AssetsManager {
    getConfiguration(): AssetsManagerConfiguration {
        return {
            name: 'test_presigned',
            description: 'Test presigned assets manager',
            contentType: 'application/octet-stream',
            tags: ['test'],
            endpoint: 'test_presigned'
        }
    }
}

function disableAuth() {
    process.env.DIGITALTWIN_DISABLE_AUTH = 'true'
    AuthConfig._resetConfig()
    ApisixAuthParser._resetProvider()
}

function createManager(presigned = true) {
    const storage = new MockStorageService()
    if (presigned) storage.setPresignedUrlSupport(true)
    const db = new MockDatabaseAdapter({ storage })
    const manager = new TestPresignedAssetsManager()
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

test.group('Presigned Upload — upload-request', (group) => {
    group.setup(() => disableAuth())

    test('returns presigned URL and creates pending record', async ({ assert }) => {
        const { manager, db } = createManager()

        const req = makeReq({
            fileName: 'model.bin',
            fileSize: 1024,
            contentType: 'application/octet-stream',
            description: 'Test model',
            source: 'https://example.com'
        })

        const res = await manager.handlePresignedUploadRequest(req)
        assert.equal(res.status, 200)

        const body = JSON.parse(res.content as string)
        assert.isDefined(body.fileId)
        assert.isDefined(body.uploadUrl)
        assert.isDefined(body.key)
        assert.isDefined(body.expiresAt)
        assert.isTrue(body.uploadUrl.includes('presigned=true'))

        // Check DB record
        const records = db.getAllRecords()
        assert.equal(records.length, 1)
        assert.equal(records[0].upload_status, 'pending')
        assert.isDefined(records[0].presigned_key)
    })

    test('returns 400 when local storage (no presigned support)', async ({ assert }) => {
        const { manager } = createManager(false)

        const req = makeReq({
            fileName: 'model.bin',
            fileSize: 1024,
            contentType: 'application/octet-stream'
        })

        const res = await manager.handlePresignedUploadRequest(req)
        assert.equal(res.status, 400)
        const body = JSON.parse(res.content as string)
        assert.isTrue(body.error.includes('not supported'))
    })

    test('returns error with invalid body (missing fileName)', async ({ assert }) => {
        const { manager } = createManager()

        const req = makeReq({
            fileSize: 1024,
            contentType: 'application/octet-stream'
        })

        const res = await manager.handlePresignedUploadRequest(req)
        // VineJS validation errors return 422
        assert.isTrue(res.status >= 400)
    })

    test('returns error with missing body', async ({ assert }) => {
        const { manager } = createManager()

        const req = { params: {}, headers: { 'x-user-id': 'test-user-1', 'x-user-roles': 'user' }, query: {} } as any
        const res = await manager.handlePresignedUploadRequest(req)
        assert.equal(res.status, 400)
    })
})

test.group('Presigned Upload — confirm', (group) => {
    group.setup(() => disableAuth())

    test('confirms upload when file exists on storage', async ({ assert }) => {
        const { manager, db, storage } = createManager()

        // Create a pending record via upload-request
        const uploadReq = makeReq({
            fileName: 'model.bin',
            fileSize: 1024,
            contentType: 'application/octet-stream',
            description: 'Test model',
            source: 'https://example.com'
        })
        const uploadRes = await manager.handlePresignedUploadRequest(uploadReq)
        assert.equal(uploadRes.status, 200)

        const { fileId, key } = JSON.parse(uploadRes.content as string)

        // Simulate file upload to S3
        storage.setObjectExists(key, true)

        // Confirm upload
        const confirmReq = makeReq({}, { fileId: String(fileId) })
        const confirmRes = await manager.handleUploadConfirm(confirmReq)
        assert.equal(confirmRes.status, 200)

        const confirmBody = JSON.parse(confirmRes.content as string)
        assert.equal(confirmBody.message, 'Upload confirmed successfully')

        // Check record is now completed
        const record = await db.getById(String(fileId))
        assert.equal(record!.upload_status, 'completed')
        assert.equal(record!.url, key)
    })

    test('returns 400 when file not found on storage', async ({ assert }) => {
        const { manager, storage } = createManager()

        // Create a pending record
        const uploadReq = makeReq({
            fileName: 'model.bin',
            fileSize: 1024,
            contentType: 'application/octet-stream',
            description: 'Test model',
            source: 'https://example.com'
        })
        const uploadRes = await manager.handlePresignedUploadRequest(uploadReq)
        const { fileId, key } = JSON.parse(uploadRes.content as string)

        // File NOT uploaded — set explicit false
        storage.setObjectExists(key, false)

        const confirmReq = makeReq({}, { fileId: String(fileId) })
        const confirmRes = await manager.handleUploadConfirm(confirmReq)
        assert.equal(confirmRes.status, 400)
    })

    test('returns 404 for non-existent record', async ({ assert }) => {
        const { manager } = createManager()

        const confirmReq = makeReq({}, { fileId: '999999' })
        const confirmRes = await manager.handleUploadConfirm(confirmReq)
        assert.equal(confirmRes.status, 404)
    })

    test('returns 409 when record is not pending', async ({ assert }) => {
        const { manager, db } = createManager()

        // Create a pending record and mark it completed
        const uploadReq = makeReq({
            fileName: 'model.bin',
            fileSize: 1024,
            contentType: 'application/octet-stream',
            description: 'Test model',
            source: 'https://example.com'
        })
        const uploadRes = await manager.handlePresignedUploadRequest(uploadReq)
        const { fileId } = JSON.parse(uploadRes.content as string)

        // Mark as completed
        await db.updateById('test_presigned', fileId, { upload_status: 'completed' })

        const confirmReq = makeReq({}, { fileId: String(fileId) })
        const confirmRes = await manager.handleUploadConfirm(confirmReq)
        assert.equal(confirmRes.status, 409)
    })

    test('returns 403 when not the owner', async ({ assert }) => {
        const { manager, db } = createManager()

        // Create a pending record
        const uploadReq = makeReq({
            fileName: 'model.bin',
            fileSize: 1024,
            contentType: 'application/octet-stream',
            description: 'Test model',
            source: 'https://example.com'
        })
        const uploadRes = await manager.handlePresignedUploadRequest(uploadReq)
        const { fileId } = JSON.parse(uploadRes.content as string)

        // Change owner to a different user
        await db.updateById('test_presigned', fileId, { owner_id: 999 })

        // Try to confirm with a different user
        const confirmReq = makeReq({}, { fileId: String(fileId) })
        const confirmRes = await manager.handleUploadConfirm(confirmReq)
        assert.equal(confirmRes.status, 403)
    })
})
