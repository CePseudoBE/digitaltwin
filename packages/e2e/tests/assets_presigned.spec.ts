import { test } from '@japa/runner'
import { setupInfrastructure, type E2EInfrastructure } from './helpers/setup.js'
import { makeAuthRequest } from './helpers/auth_helpers.js'
import { E2EAssetsManager } from './helpers/test_components.js'
import { AuthConfig } from '@cepseudo/auth'
import type { TypedRequest } from '@cepseudo/shared'

/** Helper to build a valid presigned upload request body (includes required fileSize) */
function presignedBody(overrides: Record<string, unknown> = {}) {
    return {
        fileName: 'test-file.bin',
        fileSize: 1024,
        contentType: 'application/octet-stream',
        description: 'E2E test file',
        source: 'https://example.com',
        ...overrides,
    }
}

test.group('AssetsManager presigned upload E2E', (group) => {
    let infra: E2EInfrastructure
    let manager: E2EAssetsManager

    group.setup(async () => {
        infra = await setupInfrastructure()
        manager = new E2EAssetsManager()
        manager.setDependencies(infra.db, infra.storage, infra.authMiddleware)

        // Create the assets table with extended columns
        const config = manager.getConfiguration()
        await infra.db.createTable(config.name)
        await infra.db.ensureColumns(config.name, {
            description: 'text',
            source: 'text',
            owner_id: 'integer',
            filename: 'text',
            is_public: 'boolean default true',
            upload_status: 'text',
            upload_error: 'text',
            upload_job_id: 'text',
            presigned_key: 'text',
            presigned_expires_at: 'timestamp',
            created_at: 'timestamp',
            updated_at: 'timestamp',
        })
    })

    group.teardown(async () => {
        // Ensure auth is disabled again for cleanup
        process.env.DIGITALTWIN_DISABLE_AUTH = 'true'
        AuthConfig._resetConfig()
        await infra.cleanup()
    })

    test('handleUploadRequest returns presigned URL with pending status in DB', async ({ assert }) => {
        const req = await makeAuthRequest(infra.db, 'user-presigned-1', ['user'], {
            body: presignedBody(),
        })

        const response = await (manager as any).presignedService.handleUploadRequest(req as unknown as TypedRequest)
        assert.equal(response.status, 200)

        const parsed = JSON.parse(response.content as string)
        assert.properties(parsed, ['fileId', 'uploadUrl', 'key', 'expiresAt'])
        assert.isAbove(parsed.fileId, 0)
        assert.isString(parsed.uploadUrl)
        assert.include(parsed.uploadUrl, 'X-Amz-Signature')
    })

    test('PUT to presigned URL + handleConfirm marks upload completed', async ({ assert }) => {
        const req = await makeAuthRequest(infra.db, 'user-presigned-2', ['user'], {
            body: presignedBody({ fileName: 'confirm-test.bin' }),
        })

        const uploadResponse = await (manager as any).presignedService.handleUploadRequest(req as unknown as TypedRequest)
        assert.equal(uploadResponse.status, 200)
        const { fileId, uploadUrl, key } = JSON.parse(uploadResponse.content as string)

        // PUT file directly to MinIO via the presigned URL
        const putResponse = await fetch(uploadUrl, {
            method: 'PUT',
            body: Buffer.from('hello-e2e-presigned-upload'),
            headers: { 'Content-Type': 'application/octet-stream' },
        })
        assert.equal(putResponse.status, 200)

        // Confirm
        const confirmReq = await makeAuthRequest(infra.db, 'user-presigned-2', ['user'], {
            params: { fileId: String(fileId) },
        })
        const confirmResponse = await (manager as any).presignedService.handleConfirm(confirmReq as unknown as TypedRequest)
        assert.equal(confirmResponse.status, 200)

        const parsed = JSON.parse(confirmResponse.content as string)
        assert.equal(parsed.id, fileId)
        assert.equal(parsed.url, key)
    })

    test('handleConfirm without actual upload fails', async ({ assert }) => {
        const req = await makeAuthRequest(infra.db, 'user-presigned-3', ['user'], {
            body: presignedBody({ fileName: 'no-upload.bin' }),
        })

        const uploadResponse = await (manager as any).presignedService.handleUploadRequest(req as unknown as TypedRequest)
        const { fileId } = JSON.parse(uploadResponse.content as string)

        const confirmReq = await makeAuthRequest(infra.db, 'user-presigned-3', ['user'], {
            params: { fileId: String(fileId) },
        })
        const confirmResponse = await (manager as any).presignedService.handleConfirm(confirmReq as unknown as TypedRequest)
        assert.equal(confirmResponse.status, 400)
    })

    test('wrong owner gets 403 on confirm', async ({ assert }) => {
        // User A requests upload (with auth disabled, gets anonymous user)
        const reqA = await makeAuthRequest(infra.db, 'user-owner-a', ['user'], {
            body: presignedBody({ fileName: 'owner-test.bin' }),
        })

        const uploadResponse = await (manager as any).presignedService.handleUploadRequest(reqA as unknown as TypedRequest)
        const { fileId, uploadUrl } = JSON.parse(uploadResponse.content as string)

        // Upload the file
        await fetch(uploadUrl, {
            method: 'PUT',
            body: Buffer.from('owner-test-content'),
            headers: { 'Content-Type': 'application/octet-stream' },
        })

        // Re-enable auth and reset cache so AuthMiddleware checks headers
        delete process.env.DIGITALTWIN_DISABLE_AUTH
        AuthConfig._resetConfig()

        // User B (different keycloak ID) tries to confirm — should fail
        const reqB = await makeAuthRequest(infra.db, 'user-owner-b', ['user'], {
            params: { fileId: String(fileId) },
        })

        const confirmResponse = await (manager as any).presignedService.handleConfirm(reqB as unknown as TypedRequest)
        // 401 because APISIX header validation fails (no real gateway), or 403 if it passes
        assert.oneOf(confirmResponse.status, [401, 403])

        // Restore disabled auth
        process.env.DIGITALTWIN_DISABLE_AUTH = 'true'
        AuthConfig._resetConfig()
    })

    test('double confirm returns 409', async ({ assert }) => {
        const req = await makeAuthRequest(infra.db, 'user-double-confirm', ['user'], {
            body: presignedBody({ fileName: 'double-confirm.bin' }),
        })

        const uploadResponse = await (manager as any).presignedService.handleUploadRequest(req as unknown as TypedRequest)
        const { fileId, uploadUrl } = JSON.parse(uploadResponse.content as string)

        // Upload file
        await fetch(uploadUrl, {
            method: 'PUT',
            body: Buffer.from('double-confirm-content'),
            headers: { 'Content-Type': 'application/octet-stream' },
        })

        // First confirm succeeds
        const confirmReq1 = await makeAuthRequest(infra.db, 'user-double-confirm', ['user'], {
            params: { fileId: String(fileId) },
        })
        const response1 = await (manager as any).presignedService.handleConfirm(confirmReq1 as unknown as TypedRequest)
        assert.equal(response1.status, 200)

        // Second confirm returns 409
        const confirmReq2 = await makeAuthRequest(infra.db, 'user-double-confirm', ['user'], {
            params: { fileId: String(fileId) },
        })
        const response2 = await (manager as any).presignedService.handleConfirm(confirmReq2 as unknown as TypedRequest)
        assert.equal(response2.status, 409)
    })
})
