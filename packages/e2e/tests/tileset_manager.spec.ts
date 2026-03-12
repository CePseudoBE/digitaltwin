import { test } from '@japa/runner'
import { setupInfrastructure, type E2EInfrastructure } from './helpers/setup.js'
import { makeAuthRequest } from './helpers/auth_helpers.js'
import { E2ETilesetManager } from './helpers/test_components.js'
import { sampleTilesetZip } from './helpers/fixtures.js'
import type { TypedRequest } from '@digitaltwin/shared'

test.group('TilesetManager E2E', (group) => {
    let infra: E2EInfrastructure
    let manager: E2ETilesetManager

    group.setup(async () => {
        infra = await setupInfrastructure()
        manager = new E2ETilesetManager()
        manager.setDependencies(infra.db, infra.storage, infra.authMiddleware)

        const config = manager.getConfiguration()
        await infra.db.createTable(config.name)
        await infra.db.ensureColumns(config.name, {
            description: 'text',
            source: 'text',
            owner_id: 'integer',
            filename: 'text',
            is_public: 'boolean default true',
            tileset_url: 'text',
            upload_status: 'text',
            upload_error: 'text',
            upload_job_id: 'text',
            presigned_key: 'text',
            presigned_expires_at: 'timestamp',
        })
    })

    group.teardown(async () => {
        await infra.cleanup()
    })

    test('handleUpload sync uploads small ZIP, extracts to MinIO, sets tileset_url', async ({ assert }) => {
        const zipBuffer = await sampleTilesetZip()

        const req = await makeAuthRequest(infra.db, 'user-tileset-1', ['user'], {
            body: {
                description: 'E2E test tileset',
            },
        })

        // Simulate multer file
        const fileReq = {
            ...req,
            file: {
                buffer: zipBuffer,
                originalname: 'test-tileset.zip',
                mimetype: 'application/zip',
                size: zipBuffer.length,
            },
        } as unknown as TypedRequest

        const response = await manager.handleUpload(fileReq)
        assert.equal(response.status, 200)

        const parsed = JSON.parse(response.content as string)
        assert.property(parsed, 'tileset_url')
        assert.include(parsed.tileset_url, 'tileset.json')
    })

    test('uploaded tileset files are retrievable from storage', async ({ assert }) => {
        const config = manager.getConfiguration()
        const latest = await infra.db.getLatestByName(config.name)
        assert.isDefined(latest)

        // The tileset_url should point to a stored tileset.json
        if (latest?.tileset_url) {
            // Extract the storage key from the URL
            // For MinIO with pathStyle, the key is the path after the bucket
            const url = new URL(latest.tileset_url)
            const key = url.pathname.replace(`/${process.env.TEST_MINIO_BUCKET || 'test-bucket'}/`, '').replace(/^\//, '')

            const content = await infra.storage.retrieve(key)
            assert.instanceOf(content, Buffer)
            const tilesetJson = JSON.parse(content.toString())
            assert.property(tilesetJson, 'asset')
            assert.equal(tilesetJson.asset.version, '1.0')
        }
    })
})
