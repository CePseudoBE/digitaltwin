import { test } from '@japa/runner'
import { TilesetManager } from '../../src/components/tileset_manager.js'
import { MockDatabaseAdapter } from '../mocks/mock_database_adapter.js'
import { LocalStorageService } from '../../src/storage/adapters/local_storage_service.js'
import { AuthConfig, ApisixAuthParser } from '../../src/auth/index.js'
import type { AssetsManagerConfiguration } from '../../src/components/types.js'
import JSZip from 'jszip'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'

// Test implementation of TilesetManager
class TestTilesetManager extends TilesetManager {
    getConfiguration(): AssetsManagerConfiguration {
        return {
            name: 'test-tilesets',
            description: 'Test tileset manager',
            contentType: 'application/json',
            extension: '.zip',
            endpoint: 'test-tilesets'
        }
    }
}

// Helper functions
function ensureAuthEnabled() {
    delete process.env.DIGITALTWIN_DISABLE_AUTH
    AuthConfig._resetConfig()
    ApisixAuthParser._resetProvider()
}

function restoreTestEnv() {
    process.env.DIGITALTWIN_DISABLE_AUTH = 'true'
    AuthConfig._resetConfig()
    ApisixAuthParser._resetProvider()
}

// Helper to create a test ZIP file with tileset.json
async function createTestTilesetZip(files: Record<string, string>): Promise<string> {
    const zip = new JSZip()
    for (const [name, content] of Object.entries(files)) {
        zip.file(name, content)
    }
    const buffer = await zip.generateAsync({ type: 'nodebuffer' })

    const tempDir = os.tmpdir()
    const tempPath = path.join(tempDir, `test-tileset-${Date.now()}.zip`)
    await fs.writeFile(tempPath, buffer)
    return tempPath
}

// Helper to create a valid 3D Tiles tileset.json
function createTilesetJson(name: string = 'Test Tileset'): string {
    return JSON.stringify({
        asset: {
            version: '1.0',
            tilesetVersion: '1.0.0'
        },
        geometricError: 500,
        root: {
            boundingVolume: {
                box: [0, 0, 0, 100, 0, 0, 0, 100, 0, 0, 0, 100]
            },
            geometricError: 100,
            refine: 'ADD',
            content: {
                uri: 'tiles/tile_0.b3dm'
            }
        }
    })
}

test.group('TilesetManager', (group) => {
    group.setup(() => {
        ensureAuthEnabled()
    })

    group.teardown(() => {
        restoreTestEnv()
    })

    test('should return correct configuration', ({ assert }) => {
        const manager = new TestTilesetManager()
        const config = manager.getConfiguration()

        assert.equal(config.name, 'test-tilesets')
        assert.equal(config.contentType, 'application/json')
        assert.equal(config.extension, '.zip')
    })

    test('handleUpload should reject missing request body', async ({ assert }) => {
        const manager = new TestTilesetManager()
        const db = new MockDatabaseAdapter()
        const storage = new LocalStorageService('.test-tileset')
        manager.setDependencies(db, storage)

        const response = await manager.handleUpload({})

        assert.equal(response.status, 400)
        const parsed = JSON.parse(response.content as string)
        assert.include(parsed.error, 'missing request body')
    })

    test('handleUpload should require authentication', async ({ assert }) => {
        const manager = new TestTilesetManager()
        const db = new MockDatabaseAdapter()
        const storage = new LocalStorageService('.test-tileset-auth')
        manager.setDependencies(db, storage)

        const response = await manager.handleUpload({
            body: { description: 'Test' },
            headers: {} // No auth headers
        })

        assert.equal(response.status, 401)
        const parsed = JSON.parse(response.content as string)
        assert.include(parsed.error, 'Authentication required')
    })

    test('handleUpload should reject missing description', async ({ assert }) => {
        const manager = new TestTilesetManager()
        const db = new MockDatabaseAdapter()
        const storage = new LocalStorageService('.test-tileset-missing')
        manager.setDependencies(db, storage)

        const zipPath = await createTestTilesetZip({
            'tileset.json': createTilesetJson()
        })

        try {
            const response = await manager.handleUpload({
                body: {},
                file: { path: zipPath, originalname: 'tileset.zip' },
                headers: {
                    'x-user-id': 'test-user-123',
                    'x-user-roles': 'user'
                }
            })

            assert.equal(response.status, 400)
            const parsed = JSON.parse(response.content as string)
            assert.include(parsed.error, 'description')
        } finally {
            await fs.unlink(zipPath).catch(() => {})
        }
    })

    test('handleUpload should reject non-ZIP files', async ({ assert }) => {
        const manager = new TestTilesetManager()
        const db = new MockDatabaseAdapter()
        const storage = new LocalStorageService('.test-tileset-invalid')
        manager.setDependencies(db, storage)

        // Create a temp file that's not a ZIP
        const tempPath = path.join(os.tmpdir(), 'test.txt')
        await fs.writeFile(tempPath, 'not a zip file')

        try {
            const response = await manager.handleUpload({
                body: { description: 'Test tileset' },
                file: { path: tempPath, originalname: 'test.txt' },
                headers: {
                    'x-user-id': 'test-user-123',
                    'x-user-roles': 'user'
                }
            })

            assert.equal(response.status, 400)
            const parsed = JSON.parse(response.content as string)
            assert.include(parsed.error, '.zip')
        } finally {
            await fs.unlink(tempPath).catch(() => {})
        }
    })

    test('handleUpload should reject ZIP without tileset.json', async ({ assert }) => {
        const manager = new TestTilesetManager()
        const db = new MockDatabaseAdapter()
        const storage = new LocalStorageService('.test-tileset-no-tileset-json')
        manager.setDependencies(db, storage)

        // Create a ZIP without tileset.json
        const zipPath = await createTestTilesetZip({
            'model.glb': 'binary data',
            'texture.png': 'image data'
        })

        try {
            const response = await manager.handleUpload({
                body: { description: 'Invalid tileset' },
                file: { path: zipPath, originalname: 'invalid.zip' },
                headers: {
                    'x-user-id': 'test-user-123',
                    'x-user-roles': 'user'
                }
            })

            assert.equal(response.status, 400)
            const parsed = JSON.parse(response.content as string)
            assert.include(parsed.error, 'tileset.json')
        } finally {
            await fs.unlink(zipPath).catch(() => {})
        }
    })

    test('handleUpload should accept valid tileset ZIP and return tileset_url', async ({ assert }) => {
        const manager = new TestTilesetManager()
        const db = new MockDatabaseAdapter()
        const storage = new LocalStorageService('.test-tileset-valid')
        manager.setDependencies(db, storage)

        // Create a valid tileset ZIP
        const zipPath = await createTestTilesetZip({
            'tileset.json': createTilesetJson('City Buildings'),
            'tiles/tile_0.b3dm': 'binary tile data'
        })

        try {
            const response = await manager.handleUpload({
                body: { description: 'Valid tileset upload' },
                file: { path: zipPath, originalname: 'city-buildings.zip' },
                headers: {
                    'x-user-id': 'test-user-123',
                    'x-user-roles': 'user'
                }
            })

            assert.equal(response.status, 200)
            const parsed = JSON.parse(response.content as string)
            assert.equal(parsed.message, 'Tileset uploaded successfully')
            assert.equal(parsed.file_count, 2)
            assert.isDefined(parsed.tileset_url)
            // For LocalStorageService, tileset_url is a file path
            assert.include(parsed.tileset_url, 'tileset.json')
        } finally {
            await fs.unlink(zipPath).catch(() => {})
            // Clean up extracted files
            await fs.rm('.test-tileset-valid', { recursive: true, force: true }).catch(() => {})
        }
    })

    test('handleUpload should handle tileset.json in subdirectory', async ({ assert }) => {
        const manager = new TestTilesetManager()
        const db = new MockDatabaseAdapter()
        const storage = new LocalStorageService('.test-tileset-subdir')
        manager.setDependencies(db, storage)

        // Create a tileset ZIP with files in a subdirectory (common for exported tilesets)
        const zipPath = await createTestTilesetZip({
            'my_tileset/tileset.json': createTilesetJson('My Tileset'),
            'my_tileset/tiles/tile_0.b3dm': 'binary data'
        })

        try {
            const response = await manager.handleUpload({
                body: { description: 'Tileset in subdirectory' },
                file: { path: zipPath, originalname: 'exported.zip' },
                headers: {
                    'x-user-id': 'test-user-123',
                    'x-user-roles': 'user'
                }
            })

            assert.equal(response.status, 200)
            const parsed = JSON.parse(response.content as string)
            assert.equal(parsed.file_count, 2)
            // tileset_url should point to the normalized path
            assert.include(parsed.tileset_url, 'tileset.json')
        } finally {
            await fs.unlink(zipPath).catch(() => {})
            await fs.rm('.test-tileset-subdir', { recursive: true, force: true }).catch(() => {})
        }
    })

    test('retrieve should return tilesets with tileset_url', async ({ assert }) => {
        const manager = new TestTilesetManager()
        const db = new MockDatabaseAdapter()
        const storage = new LocalStorageService('.test-tileset-retrieve')
        manager.setDependencies(db, storage)

        const response = await manager.retrieve()

        assert.equal(response.status, 200)
        const parsed = JSON.parse(response.content as string)
        assert.isArray(parsed)
    })

    test('getEndpoints should include status endpoint', ({ assert }) => {
        const manager = new TestTilesetManager()
        const db = new MockDatabaseAdapter()
        const storage = new LocalStorageService('.test-tileset-endpoints')
        manager.setDependencies(db, storage)

        const endpoints = manager.getEndpoints()
        const statusEndpoint = endpoints.find(ep => ep.path.includes('/status'))

        assert.isDefined(statusEndpoint)
        assert.equal(statusEndpoint?.method, 'get')
    })

    test('getEndpoints should not include files endpoint (files served directly from OVH)', ({ assert }) => {
        const manager = new TestTilesetManager()
        const db = new MockDatabaseAdapter()
        const storage = new LocalStorageService('.test-tileset-no-files')
        manager.setDependencies(db, storage)

        const endpoints = manager.getEndpoints()
        const filesEndpoint = endpoints.find(ep => ep.path.includes('/files/'))

        assert.isUndefined(filesEndpoint)
    })
})

test.group('TilesetManager with auth disabled', group => {
    group.setup(() => {
        process.env.DIGITALTWIN_DISABLE_AUTH = 'true'
        AuthConfig._resetConfig()
        ApisixAuthParser._resetProvider()
    })

    group.teardown(() => {
        restoreTestEnv()
    })

    test('handleUpload should work without auth headers when auth disabled', async ({ assert }) => {
        const manager = new TestTilesetManager()
        const db = new MockDatabaseAdapter()
        const storage = new LocalStorageService('.test-tileset-noauth')
        manager.setDependencies(db, storage)

        const zipPath = await createTestTilesetZip({
            'tileset.json': createTilesetJson()
        })

        try {
            const response = await manager.handleUpload({
                body: { description: 'No auth tileset' },
                file: { path: zipPath, originalname: 'tileset.zip' },
                headers: {}
            })

            assert.equal(response.status, 200)
            const parsed = JSON.parse(response.content as string)
            assert.include(parsed.tileset_url, 'tileset.json')
        } finally {
            await fs.unlink(zipPath).catch(() => {})
            await fs.rm('.test-tileset-noauth', { recursive: true, force: true }).catch(() => {})
        }
    })
})

test.group('TilesetManager.handleGetStatus', group => {
    group.setup(() => {
        process.env.DIGITALTWIN_DISABLE_AUTH = 'true'
        AuthConfig._resetConfig()
        ApisixAuthParser._resetProvider()
    })

    group.teardown(() => {
        restoreTestEnv()
    })

    test('returns 400 when id is missing', async ({ assert }) => {
        const manager = new TestTilesetManager()
        const db = new MockDatabaseAdapter()
        const storage = new LocalStorageService('.test-status-no-id')
        manager.setDependencies(db, storage)

        const response = await manager.handleGetStatus({ params: {} })

        assert.equal(response.status, 400)
        const parsed = JSON.parse(response.content as string)
        assert.include(parsed.error, 'required')
    })

    test('returns 404 for non-existent tileset', async ({ assert }) => {
        const manager = new TestTilesetManager()
        const db = new MockDatabaseAdapter()
        const storage = new LocalStorageService('.test-status-not-found')
        manager.setDependencies(db, storage)

        const response = await manager.handleGetStatus({ params: { id: '999' } })

        assert.equal(response.status, 404)
    })

    test('returns completed status with tileset_url', async ({ assert }) => {
        const manager = new TestTilesetManager()
        const db = new MockDatabaseAdapter()
        const storage = new LocalStorageService('.test-status-completed')
        manager.setDependencies(db, storage)

        // Create a completed tileset record
        const record = await db.save({
            name: 'test-tilesets',
            type: 'application/json',
            url: 'test-tilesets/123',
            tileset_url: 'https://example.com/test-tilesets/123/tileset.json',
            date: new Date(),
            description: 'Test',
            filename: 'test.zip',
            owner_id: 1,
            upload_status: 'completed'
        })

        const response = await manager.handleGetStatus({ params: { id: String(record.id) } })

        assert.equal(response.status, 200)
        const parsed = JSON.parse(response.content as string)
        assert.equal(parsed.status, 'completed')
        assert.isDefined(parsed.tileset_url)
    })

    test('returns failed status with error message', async ({ assert }) => {
        const manager = new TestTilesetManager()
        const db = new MockDatabaseAdapter()
        const storage = new LocalStorageService('.test-status-failed')
        manager.setDependencies(db, storage)

        const record = await db.save({
            name: 'test-tilesets',
            type: 'application/json',
            url: '',
            tileset_url: '',
            date: new Date(),
            description: 'Test',
            filename: 'test.zip',
            owner_id: 1,
            upload_status: 'failed',
            upload_error: 'Extraction failed'
        })

        const response = await manager.handleGetStatus({ params: { id: String(record.id) } })

        assert.equal(response.status, 200)
        const parsed = JSON.parse(response.content as string)
        assert.equal(parsed.status, 'failed')
        assert.include(parsed.error, 'Extraction failed')
    })

    test('returns pending status with job_id', async ({ assert }) => {
        const manager = new TestTilesetManager()
        const db = new MockDatabaseAdapter()
        const storage = new LocalStorageService('.test-status-pending')
        manager.setDependencies(db, storage)

        const record = await db.save({
            name: 'test-tilesets',
            type: 'application/json',
            url: '',
            tileset_url: '',
            date: new Date(),
            description: 'Test',
            filename: 'test.zip',
            owner_id: 1,
            upload_status: 'pending',
            upload_job_id: 'job-456'
        })

        const response = await manager.handleGetStatus({ params: { id: String(record.id) } })

        assert.equal(response.status, 200)
        const parsed = JSON.parse(response.content as string)
        assert.equal(parsed.status, 'pending')
        assert.equal(parsed.job_id, 'job-456')
    })
})

test.group('TilesetManager.handleDelete', group => {
    group.setup(() => {
        process.env.DIGITALTWIN_DISABLE_AUTH = 'true'
        AuthConfig._resetConfig()
        ApisixAuthParser._resetProvider()
    })

    group.teardown(() => {
        restoreTestEnv()
    })

    test('returns 400 when id is missing', async ({ assert }) => {
        const manager = new TestTilesetManager()
        const db = new MockDatabaseAdapter()
        const storage = new LocalStorageService('.test-delete-no-id')
        manager.setDependencies(db, storage)

        const response = await manager.handleDelete({ params: {}, headers: {} })

        assert.equal(response.status, 400)
        const parsed = JSON.parse(response.content as string)
        assert.include(parsed.error, 'required')
    })

    test('returns 404 for non-existent tileset', async ({ assert }) => {
        const manager = new TestTilesetManager()
        const db = new MockDatabaseAdapter()
        const storage = new LocalStorageService('.test-delete-not-found')
        manager.setDependencies(db, storage)

        const response = await manager.handleDelete({ params: { id: '999' }, headers: {} })

        assert.equal(response.status, 404)
    })

    test('returns 409 when upload is in progress (pending)', async ({ assert }) => {
        const manager = new TestTilesetManager()
        const db = new MockDatabaseAdapter()
        const storage = new LocalStorageService('.test-delete-pending')
        manager.setDependencies(db, storage)

        const record = await db.save({
            name: 'test-tilesets',
            type: 'application/json',
            url: '',
            tileset_url: '',
            date: new Date(),
            description: 'Test',
            filename: 'test.zip',
            owner_id: 1,
            upload_status: 'pending'
        })

        const response = await manager.handleDelete({ params: { id: String(record.id) }, headers: {} })

        assert.equal(response.status, 409)
        const parsed = JSON.parse(response.content as string)
        assert.include(parsed.error, 'upload is in progress')
    })

    test('returns 409 when upload is processing', async ({ assert }) => {
        const manager = new TestTilesetManager()
        const db = new MockDatabaseAdapter()
        const storage = new LocalStorageService('.test-delete-processing')
        manager.setDependencies(db, storage)

        const record = await db.save({
            name: 'test-tilesets',
            type: 'application/json',
            url: '',
            tileset_url: '',
            date: new Date(),
            description: 'Test',
            filename: 'test.zip',
            owner_id: 1,
            upload_status: 'processing'
        })

        const response = await manager.handleDelete({ params: { id: String(record.id) }, headers: {} })

        assert.equal(response.status, 409)
    })

    test('deletes tileset using url prefix', async ({ assert }) => {
        const manager = new TestTilesetManager()
        const db = new MockDatabaseAdapter()
        const storage = new LocalStorageService('.test-delete-prefix')
        manager.setDependencies(db, storage)

        const record = await db.save({
            name: 'test-tilesets',
            type: 'application/json',
            url: 'test-tilesets/123',
            tileset_url: 'http://localhost/test-tilesets/123/tileset.json',
            date: new Date(),
            description: 'Test',
            filename: 'test.zip',
            owner_id: 1,
            upload_status: 'completed'
        })

        const response = await manager.handleDelete({ params: { id: String(record.id) }, headers: {} })

        assert.equal(response.status, 200)
        const parsed = JSON.parse(response.content as string)
        assert.include(parsed.message, 'deleted successfully')

        // Verify record deleted
        const found = await db.getById(String(record.id), 'test-tilesets')
        assert.isUndefined(found)

        await fs.rm('.test-delete-prefix', { recursive: true, force: true }).catch(() => {})
    })

    test('handles legacy file_index format', async ({ assert }) => {
        const manager = new TestTilesetManager()
        const db = new MockDatabaseAdapter()
        const storage = new LocalStorageService('.test-delete-legacy')
        manager.setDependencies(db, storage)

        const record = await db.save({
            name: 'test-tilesets',
            type: 'application/json',
            url: '',
            tileset_url: 'http://localhost/legacy/tileset.json',
            date: new Date(),
            description: 'Legacy tileset',
            filename: 'legacy.zip',
            owner_id: 1,
            upload_status: 'completed',
            file_index: {
                files: [{ path: 'legacy/tileset.json' }, { path: 'legacy/tile.b3dm' }],
                root_file: 'tileset.json'
            }
        })

        const response = await manager.handleDelete({ params: { id: String(record.id) }, headers: {} })

        assert.equal(response.status, 200)

        await fs.rm('.test-delete-legacy', { recursive: true, force: true }).catch(() => {})
    })
})

test.group('TilesetManager.handleDelete with auth', group => {
    group.setup(() => {
        ensureAuthEnabled()
    })

    group.teardown(() => {
        restoreTestEnv()
    })

    test('returns 401 without auth', async ({ assert }) => {
        const manager = new TestTilesetManager()
        const db = new MockDatabaseAdapter()
        const storage = new LocalStorageService('.test-delete-noauth')
        manager.setDependencies(db, storage)

        const record = await db.save({
            name: 'test-tilesets',
            type: 'application/json',
            url: 'test-tilesets/1',
            tileset_url: 'https://example.com/1/tileset.json',
            date: new Date(),
            description: 'Test',
            filename: 'test.zip',
            owner_id: 1,
            upload_status: 'completed'
        })

        const response = await manager.handleDelete({ params: { id: String(record.id) }, headers: {} })

        assert.equal(response.status, 401)
    })

    test('returns 403 when user does not own tileset', async ({ assert }) => {
        const manager = new TestTilesetManager()
        const db = new MockDatabaseAdapter()
        const storage = new LocalStorageService('.test-delete-forbidden')
        manager.setDependencies(db, storage)

        // Create owner user
        await db.getKnex()('users').insert({ keycloak_id: 'owner-1' })
        const owner = await db.getKnex()('users').where('keycloak_id', 'owner-1').first()

        // Create other user
        await db.getKnex()('users').insert({ keycloak_id: 'other-user' })

        const record = await db.save({
            name: 'test-tilesets',
            type: 'application/json',
            url: 'test-tilesets/1',
            tileset_url: 'https://example.com/1/tileset.json',
            date: new Date(),
            description: 'Test',
            filename: 'test.zip',
            owner_id: owner.id,
            upload_status: 'completed'
        })

        const response = await manager.handleDelete({
            params: { id: String(record.id) },
            headers: { 'x-user-id': 'other-user', 'x-user-roles': 'user' }
        })

        assert.equal(response.status, 403)
    })

    test('allows admin to delete any tileset', async ({ assert }) => {
        const manager = new TestTilesetManager()
        const db = new MockDatabaseAdapter()
        const storage = new LocalStorageService('.test-delete-admin')
        manager.setDependencies(db, storage)

        await db.getKnex()('users').insert({ keycloak_id: 'owner-1' })
        const owner = await db.getKnex()('users').where('keycloak_id', 'owner-1').first()

        const record = await db.save({
            name: 'test-tilesets',
            type: 'application/json',
            url: 'test-tilesets/1',
            tileset_url: 'https://example.com/1/tileset.json',
            date: new Date(),
            description: 'Test',
            filename: 'test.zip',
            owner_id: owner.id,
            upload_status: 'completed'
        })

        const response = await manager.handleDelete({
            params: { id: String(record.id) },
            headers: { 'x-user-id': 'admin-user', 'x-user-roles': 'admin' }
        })

        assert.equal(response.status, 200)

        await fs.rm('.test-delete-admin', { recursive: true, force: true }).catch(() => {})
    })
})

test.group('TilesetManager.retrieve filtering', group => {
    group.setup(() => {
        ensureAuthEnabled()
    })

    group.teardown(() => {
        restoreTestEnv()
    })

    test('returns public tilesets for anonymous users', async ({ assert }) => {
        const manager = new TestTilesetManager()
        const db = new MockDatabaseAdapter()
        const storage = new LocalStorageService('.test-retrieve-public')
        manager.setDependencies(db, storage)

        await db.save({
            name: 'test-tilesets',
            type: 'application/json',
            url: 'test-tilesets/1',
            tileset_url: 'https://example.com/1/tileset.json',
            date: new Date(),
            description: 'Public tileset',
            filename: 'public.zip',
            owner_id: 1,
            is_public: true
        })

        await db.save({
            name: 'test-tilesets',
            type: 'application/json',
            url: 'test-tilesets/2',
            tileset_url: 'https://example.com/2/tileset.json',
            date: new Date(),
            description: 'Private tileset',
            filename: 'private.zip',
            owner_id: 1,
            is_public: false
        })

        const response = await manager.retrieve({ headers: {} })

        assert.equal(response.status, 200)
        const parsed = JSON.parse(response.content as string)
        assert.lengthOf(parsed, 1)
        assert.equal(parsed[0].description, 'Public tileset')
    })

    test('returns all tilesets for admin users', async ({ assert }) => {
        const manager = new TestTilesetManager()
        const db = new MockDatabaseAdapter()
        const storage = new LocalStorageService('.test-retrieve-admin')
        manager.setDependencies(db, storage)

        await db.save({
            name: 'test-tilesets',
            type: 'application/json',
            url: 'test-tilesets/1',
            tileset_url: 'https://example.com/1/tileset.json',
            date: new Date(),
            description: 'Public tileset',
            filename: 'public.zip',
            owner_id: 1,
            is_public: true
        })

        await db.save({
            name: 'test-tilesets',
            type: 'application/json',
            url: 'test-tilesets/2',
            tileset_url: 'https://example.com/2/tileset.json',
            date: new Date(),
            description: 'Private tileset',
            filename: 'private.zip',
            owner_id: 1,
            is_public: false
        })

        const response = await manager.retrieve({
            headers: { 'x-user-id': 'admin-1', 'x-user-roles': 'admin' }
        })

        assert.equal(response.status, 200)
        const parsed = JSON.parse(response.content as string)
        assert.lengthOf(parsed, 2)
    })

    test('returns owned private tilesets to owner', async ({ assert }) => {
        const manager = new TestTilesetManager()
        const db = new MockDatabaseAdapter()
        const storage = new LocalStorageService('.test-retrieve-owner')
        manager.setDependencies(db, storage)

        // Create owner user
        await db.getKnex()('users').insert({ keycloak_id: 'owner-user' })
        const user = await db.getKnex()('users').where('keycloak_id', 'owner-user').first()

        await db.save({
            name: 'test-tilesets',
            type: 'application/json',
            url: 'test-tilesets/1',
            tileset_url: 'https://example.com/1/tileset.json',
            date: new Date(),
            description: 'My private tileset',
            filename: 'private.zip',
            owner_id: user.id,
            is_public: false
        })

        const response = await manager.retrieve({
            headers: { 'x-user-id': 'owner-user', 'x-user-roles': 'user' }
        })

        assert.equal(response.status, 200)
        const parsed = JSON.parse(response.content as string)
        assert.lengthOf(parsed, 1)
        assert.equal(parsed[0].description, 'My private tileset')
    })
})

test.group('TilesetManager.getOpenAPISpec', () => {
    test('returns valid OpenAPI spec', async ({ assert }) => {
        const manager = new TestTilesetManager()
        const db = new MockDatabaseAdapter()
        const storage = new LocalStorageService('.test-openapi')
        manager.setDependencies(db, storage)

        const spec = manager.getOpenAPISpec()

        assert.isDefined(spec.paths)
        assert.isDefined(spec.paths['/test-tilesets'])
        assert.isDefined(spec.paths['/test-tilesets'].get)
        assert.isDefined(spec.paths['/test-tilesets'].post)
        assert.isDefined(spec.paths['/test-tilesets/{id}/status'])
        assert.isDefined(spec.paths['/test-tilesets/{id}'])
        assert.isDefined(spec.paths['/test-tilesets/{id}'].put)
        assert.isDefined(spec.paths['/test-tilesets/{id}'].delete)
    })

    test('includes TilesetResponse schema', async ({ assert }) => {
        const manager = new TestTilesetManager()
        const db = new MockDatabaseAdapter()
        const storage = new LocalStorageService('.test-openapi-schema')
        manager.setDependencies(db, storage)

        const spec = manager.getOpenAPISpec()

        assert.isDefined(spec.schemas)
        assert.isDefined(spec.schemas!['TilesetResponse'])
        assert.isDefined(spec.schemas!['TilesetResponse'].properties)
        assert.isDefined(spec.schemas!['TilesetResponse'].properties!['tileset_url'])
        assert.isDefined(spec.schemas!['TilesetResponse'].properties!['upload_status'])
    })

    test('includes tags', async ({ assert }) => {
        const manager = new TestTilesetManager()
        const db = new MockDatabaseAdapter()
        const storage = new LocalStorageService('.test-openapi-tags')
        manager.setDependencies(db, storage)

        const spec = manager.getOpenAPISpec()

        assert.isDefined(spec.tags)
        assert.lengthOf(spec.tags!, 1)
        assert.equal(spec.tags![0].name, 'test-tilesets')
        assert.isDefined(spec.tags![0].description)
    })

    test('includes 202 response for async upload', async ({ assert }) => {
        const manager = new TestTilesetManager()
        const db = new MockDatabaseAdapter()
        const storage = new LocalStorageService('.test-openapi-202')
        manager.setDependencies(db, storage)

        const spec = manager.getOpenAPISpec()
        const postResponses = spec.paths['/test-tilesets'].post!.responses

        assert.isDefined(postResponses!['202'])
    })

    test('includes 409 response for delete endpoint', async ({ assert }) => {
        const manager = new TestTilesetManager()
        const db = new MockDatabaseAdapter()
        const storage = new LocalStorageService('.test-openapi-409')
        manager.setDependencies(db, storage)

        const spec = manager.getOpenAPISpec()
        const deleteResponses = spec.paths['/test-tilesets/{id}'].delete!.responses

        assert.isDefined(deleteResponses!['409'])
    })
})

test.group('TilesetManager.setUploadQueue', () => {
    test('accepts upload queue', async ({ assert }) => {
        const manager = new TestTilesetManager()
        const db = new MockDatabaseAdapter()
        const storage = new LocalStorageService('.test-queue')
        manager.setDependencies(db, storage)

        // Mock queue
        const mockQueue = {
            add: async () => ({ id: 'job-1' })
        } as any

        // Should not throw
        manager.setUploadQueue(mockQueue)
        assert.isTrue(true)
    })
})
