import { test } from '@japa/runner'
import { TilesetManager } from '../src/tileset_manager.js'
import { MockDatabaseAdapter } from './mocks/mock_database_adapter.js'
import { LocalStorageService } from '@digitaltwin/storage'
import { AuthConfig, ApisixAuthParser } from '@digitaltwin/auth'
import type { AssetsManagerConfiguration } from '@digitaltwin/shared'
import JSZip from 'jszip'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'

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

function enableAuth() {
    delete process.env.DIGITALTWIN_DISABLE_AUTH
    AuthConfig._resetConfig()
    ApisixAuthParser._resetProvider()
}

function disableAuth() {
    process.env.DIGITALTWIN_DISABLE_AUTH = 'true'
    AuthConfig._resetConfig()
    ApisixAuthParser._resetProvider()
}

async function createTestTilesetZip(files: Record<string, string>): Promise<string> {
    const zip = new JSZip()
    for (const [name, content] of Object.entries(files)) {
        zip.file(name, content)
    }
    const buffer = await zip.generateAsync({ type: 'nodebuffer' })
    const tempPath = path.join(os.tmpdir(), `test-tileset-${Date.now()}.zip`)
    await fs.writeFile(tempPath, buffer)
    return tempPath
}

function createTilesetJson(): string {
    return JSON.stringify({
        asset: { version: '1.0', tilesetVersion: '1.0.0' },
        geometricError: 500,
        root: {
            boundingVolume: { box: [0, 0, 0, 100, 0, 0, 0, 100, 0, 0, 0, 100] },
            geometricError: 100, refine: 'ADD',
            content: { uri: 'tiles/tile_0.b3dm' }
        }
    })
}

function authHeaders(roles: string = 'user') {
    return { 'x-user-id': 'test-user-123', 'x-user-roles': roles }
}

test.group('TilesetManager — upload validation', (group) => {
    group.setup(() => enableAuth())
    group.teardown(() => disableAuth())

    test('rejects request without body', async ({ assert }) => {
        const manager = new TestTilesetManager()
        const db = new MockDatabaseAdapter()
        const storage = new LocalStorageService('.test-tileset')
        manager.setDependencies(db, storage)

        const response = await manager.handleUpload({})

        assert.equal(response.status, 400)
        assert.include(JSON.parse(response.content as string).error, 'missing request body')
    })

    test('requires authentication', async ({ assert }) => {
        const manager = new TestTilesetManager()
        const db = new MockDatabaseAdapter()
        const storage = new LocalStorageService('.test-tileset-auth')
        manager.setDependencies(db, storage)

        const response = await manager.handleUpload({
            body: { description: 'Test' },
            headers: {}
        })

        assert.equal(response.status, 401)
        assert.include(JSON.parse(response.content as string).error, 'Authentication required')
    })

    test('rejects missing description', async ({ assert }) => {
        const manager = new TestTilesetManager()
        const db = new MockDatabaseAdapter()
        const storage = new LocalStorageService('.test-tileset-desc')
        manager.setDependencies(db, storage)

        const zipPath = await createTestTilesetZip({ 'tileset.json': createTilesetJson() })

        try {
            const response = await manager.handleUpload({
                body: {},
                file: { path: zipPath, originalname: 'tileset.zip' },
                headers: authHeaders()
            })

            assert.equal(response.status, 400)
            assert.include(JSON.parse(response.content as string).error, 'description')
        } finally {
            await fs.unlink(zipPath).catch(() => {})
        }
    })

    test('rejects non-ZIP files', async ({ assert }) => {
        const manager = new TestTilesetManager()
        const db = new MockDatabaseAdapter()
        const storage = new LocalStorageService('.test-tileset-nozip')
        manager.setDependencies(db, storage)

        const tempPath = path.join(os.tmpdir(), 'test.txt')
        await fs.writeFile(tempPath, 'not a zip file')

        try {
            const response = await manager.handleUpload({
                body: { description: 'Test tileset' },
                file: { path: tempPath, originalname: 'test.txt' },
                headers: authHeaders()
            })

            assert.equal(response.status, 400)
            assert.include(JSON.parse(response.content as string).error, '.zip')
        } finally {
            await fs.unlink(tempPath).catch(() => {})
        }
    })

    test('rejects ZIP without tileset.json', async ({ assert }) => {
        const manager = new TestTilesetManager()
        const db = new MockDatabaseAdapter()
        const storage = new LocalStorageService('.test-tileset-notileset')
        manager.setDependencies(db, storage)

        const zipPath = await createTestTilesetZip({
            'model.glb': 'binary data',
            'texture.png': 'image data'
        })

        try {
            const response = await manager.handleUpload({
                body: { description: 'Invalid tileset' },
                file: { path: zipPath, originalname: 'invalid.zip' },
                headers: authHeaders()
            })

            assert.equal(response.status, 400)
            assert.include(JSON.parse(response.content as string).error, 'tileset.json')
        } finally {
            await fs.unlink(zipPath).catch(() => {})
        }
    })
})

test.group('TilesetManager — successful upload', (group) => {
    group.setup(() => enableAuth())
    group.teardown(() => disableAuth())

    test('extracts valid ZIP and returns tileset_url pointing to tileset.json', async ({ assert }) => {
        const manager = new TestTilesetManager()
        const db = new MockDatabaseAdapter()
        const storage = new LocalStorageService('.test-tileset-valid')
        manager.setDependencies(db, storage)

        const zipPath = await createTestTilesetZip({
            'tileset.json': createTilesetJson(),
            'tiles/tile_0.b3dm': 'binary tile data'
        })

        try {
            const response = await manager.handleUpload({
                body: { description: 'Valid tileset upload' },
                file: { path: zipPath, originalname: 'city-buildings.zip' },
                headers: authHeaders()
            })

            assert.equal(response.status, 200)
            const parsed = JSON.parse(response.content as string)
            assert.equal(parsed.message, 'Tileset uploaded successfully')
            assert.equal(parsed.file_count, 2)
            assert.include(parsed.tileset_url, 'tileset.json')
        } finally {
            await fs.unlink(zipPath).catch(() => {})
            await fs.rm('.test-tileset-valid', { recursive: true, force: true }).catch(() => {})
        }
    })

    test('normalizes paths when tileset.json is in a subdirectory', async ({ assert }) => {
        const manager = new TestTilesetManager()
        const db = new MockDatabaseAdapter()
        const storage = new LocalStorageService('.test-tileset-subdir')
        manager.setDependencies(db, storage)

        const zipPath = await createTestTilesetZip({
            'my_tileset/tileset.json': createTilesetJson(),
            'my_tileset/tiles/tile_0.b3dm': 'binary data'
        })

        try {
            const response = await manager.handleUpload({
                body: { description: 'Tileset in subdirectory' },
                file: { path: zipPath, originalname: 'exported.zip' },
                headers: authHeaders()
            })

            assert.equal(response.status, 200)
            const parsed = JSON.parse(response.content as string)
            assert.equal(parsed.file_count, 2)
            assert.include(parsed.tileset_url, 'tileset.json')
        } finally {
            await fs.unlink(zipPath).catch(() => {})
            await fs.rm('.test-tileset-subdir', { recursive: true, force: true }).catch(() => {})
        }
    })

    test('works without auth headers when auth is disabled', async ({ assert }) => {
        disableAuth()

        const manager = new TestTilesetManager()
        const db = new MockDatabaseAdapter()
        const storage = new LocalStorageService('.test-tileset-noauth')
        manager.setDependencies(db, storage)

        const zipPath = await createTestTilesetZip({ 'tileset.json': createTilesetJson() })

        try {
            const response = await manager.handleUpload({
                body: { description: 'No auth tileset' },
                file: { path: zipPath, originalname: 'tileset.zip' },
                headers: {}
            })

            assert.equal(response.status, 200)
            assert.include(JSON.parse(response.content as string).tileset_url, 'tileset.json')
        } finally {
            enableAuth()
            await fs.unlink(zipPath).catch(() => {})
            await fs.rm('.test-tileset-noauth', { recursive: true, force: true }).catch(() => {})
        }
    })
})

test.group('TilesetManager — status polling', (group) => {
    group.setup(() => disableAuth())
    group.teardown(() => disableAuth())

    test('returns 400 when id is missing', async ({ assert }) => {
        const manager = new TestTilesetManager()
        const db = new MockDatabaseAdapter()
        const storage = new LocalStorageService('.test-status')
        manager.setDependencies(db, storage)

        const response = await manager.handleGetStatus({ params: {} })

        assert.equal(response.status, 400)
        assert.include(JSON.parse(response.content as string).error, 'required')
    })

    test('returns 404 for non-existent tileset', async ({ assert }) => {
        const manager = new TestTilesetManager()
        const db = new MockDatabaseAdapter()
        const storage = new LocalStorageService('.test-status')
        manager.setDependencies(db, storage)

        const response = await manager.handleGetStatus({ params: { id: '999' } })
        assert.equal(response.status, 404)
    })

    test('returns completed status with tileset_url', async ({ assert }) => {
        const manager = new TestTilesetManager()
        const db = new MockDatabaseAdapter()
        const storage = new LocalStorageService('.test-status')
        manager.setDependencies(db, storage)

        const record = await db.save({
            name: 'test-tilesets', type: 'application/json',
            url: 'test-tilesets/123',
            tileset_url: 'https://example.com/test-tilesets/123/tileset.json',
            date: new Date(), description: 'Test', filename: 'test.zip',
            owner_id: 1, upload_status: 'completed'
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
        const storage = new LocalStorageService('.test-status')
        manager.setDependencies(db, storage)

        const record = await db.save({
            name: 'test-tilesets', type: 'application/json',
            url: '', tileset_url: '',
            date: new Date(), description: 'Test', filename: 'test.zip',
            owner_id: 1, upload_status: 'failed', upload_error: 'Extraction failed'
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
        const storage = new LocalStorageService('.test-status')
        manager.setDependencies(db, storage)

        const record = await db.save({
            name: 'test-tilesets', type: 'application/json',
            url: '', tileset_url: '',
            date: new Date(), description: 'Test', filename: 'test.zip',
            owner_id: 1, upload_status: 'pending', upload_job_id: 'job-456'
        })

        const response = await manager.handleGetStatus({ params: { id: String(record.id) } })

        assert.equal(response.status, 200)
        const parsed = JSON.parse(response.content as string)
        assert.equal(parsed.status, 'pending')
        assert.equal(parsed.job_id, 'job-456')
    })
})

test.group('TilesetManager — delete', (group) => {
    group.setup(() => disableAuth())
    group.teardown(() => disableAuth())

    test('returns 400 when id is missing', async ({ assert }) => {
        const manager = new TestTilesetManager()
        const db = new MockDatabaseAdapter()
        const storage = new LocalStorageService('.test-delete')
        manager.setDependencies(db, storage)

        const response = await manager.handleDelete({ params: {}, headers: {} })
        assert.equal(response.status, 400)
    })

    test('returns 404 for non-existent tileset', async ({ assert }) => {
        const manager = new TestTilesetManager()
        const db = new MockDatabaseAdapter()
        const storage = new LocalStorageService('.test-delete')
        manager.setDependencies(db, storage)

        const response = await manager.handleDelete({ params: { id: '999' }, headers: {} })
        assert.equal(response.status, 404)
    })

    test('returns 409 when upload is in progress', async ({ assert }) => {
        const manager = new TestTilesetManager()
        const db = new MockDatabaseAdapter()
        const storage = new LocalStorageService('.test-delete')
        manager.setDependencies(db, storage)

        const record = await db.save({
            name: 'test-tilesets', type: 'application/json',
            url: '', tileset_url: '',
            date: new Date(), description: 'Test', filename: 'test.zip',
            owner_id: 1, upload_status: 'pending'
        })

        const response = await manager.handleDelete({ params: { id: String(record.id) }, headers: {} })
        assert.equal(response.status, 409)
        assert.include(JSON.parse(response.content as string).error, 'upload is in progress')
    })

    test('returns 409 when upload is processing', async ({ assert }) => {
        const manager = new TestTilesetManager()
        const db = new MockDatabaseAdapter()
        const storage = new LocalStorageService('.test-delete')
        manager.setDependencies(db, storage)

        const record = await db.save({
            name: 'test-tilesets', type: 'application/json',
            url: '', tileset_url: '',
            date: new Date(), description: 'Test', filename: 'test.zip',
            owner_id: 1, upload_status: 'processing'
        })

        const response = await manager.handleDelete({ params: { id: String(record.id) }, headers: {} })
        assert.equal(response.status, 409)
    })

    test('deletes completed tileset and removes record from database', async ({ assert }) => {
        const manager = new TestTilesetManager()
        const db = new MockDatabaseAdapter()
        const storage = new LocalStorageService('.test-delete-prefix')
        manager.setDependencies(db, storage)

        const record = await db.save({
            name: 'test-tilesets', type: 'application/json',
            url: 'test-tilesets/123',
            tileset_url: 'http://localhost/test-tilesets/123/tileset.json',
            date: new Date(), description: 'Test', filename: 'test.zip',
            owner_id: 1, upload_status: 'completed'
        })

        const response = await manager.handleDelete({ params: { id: String(record.id) }, headers: {} })

        assert.equal(response.status, 200)
        assert.include(JSON.parse(response.content as string).message, 'deleted successfully')

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
            name: 'test-tilesets', type: 'application/json',
            url: '', tileset_url: 'http://localhost/legacy/tileset.json',
            date: new Date(), description: 'Legacy tileset', filename: 'legacy.zip',
            owner_id: 1, upload_status: 'completed',
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

test.group('TilesetManager — delete with auth', (group) => {
    group.setup(() => enableAuth())
    group.teardown(() => disableAuth())

    test('returns 401 without auth headers', async ({ assert }) => {
        const manager = new TestTilesetManager()
        const db = new MockDatabaseAdapter()
        const storage = new LocalStorageService('.test-delete-noauth')
        manager.setDependencies(db, storage)

        const record = await db.save({
            name: 'test-tilesets', type: 'application/json',
            url: 'test-tilesets/1',
            tileset_url: 'https://example.com/1/tileset.json',
            date: new Date(), description: 'Test', filename: 'test.zip',
            owner_id: 1, upload_status: 'completed'
        })

        const response = await manager.handleDelete({ params: { id: String(record.id) }, headers: {} })
        assert.equal(response.status, 401)
    })

    test('returns 403 when non-owner tries to delete', async ({ assert }) => {
        const manager = new TestTilesetManager()
        const db = new MockDatabaseAdapter()
        const storage = new LocalStorageService('.test-delete-forbidden')
        manager.setDependencies(db, storage)

        await db.getKnex()('users').insert({ keycloak_id: 'owner-1' })
        const owner = await db.getKnex()('users').where('keycloak_id', 'owner-1').first()
        await db.getKnex()('users').insert({ keycloak_id: 'other-user' })

        const record = await db.save({
            name: 'test-tilesets', type: 'application/json',
            url: 'test-tilesets/1',
            tileset_url: 'https://example.com/1/tileset.json',
            date: new Date(), description: 'Test', filename: 'test.zip',
            owner_id: owner.id, upload_status: 'completed'
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
            name: 'test-tilesets', type: 'application/json',
            url: 'test-tilesets/1',
            tileset_url: 'https://example.com/1/tileset.json',
            date: new Date(), description: 'Test', filename: 'test.zip',
            owner_id: owner.id, upload_status: 'completed'
        })

        const response = await manager.handleDelete({
            params: { id: String(record.id) },
            headers: { 'x-user-id': 'admin-user', 'x-user-roles': 'admin' }
        })

        assert.equal(response.status, 200)
        await fs.rm('.test-delete-admin', { recursive: true, force: true }).catch(() => {})
    })
})

test.group('TilesetManager — retrieve with visibility filtering', (group) => {
    group.setup(() => enableAuth())
    group.teardown(() => disableAuth())

    test('anonymous users only see public tilesets', async ({ assert }) => {
        const manager = new TestTilesetManager()
        const db = new MockDatabaseAdapter()
        const storage = new LocalStorageService('.test-retrieve')
        manager.setDependencies(db, storage)

        await db.save({
            name: 'test-tilesets', type: 'application/json',
            url: 'test-tilesets/1',
            tileset_url: 'https://example.com/1/tileset.json',
            date: new Date(), description: 'Public tileset', filename: 'public.zip',
            owner_id: 1, is_public: true
        })

        await db.save({
            name: 'test-tilesets', type: 'application/json',
            url: 'test-tilesets/2',
            tileset_url: 'https://example.com/2/tileset.json',
            date: new Date(), description: 'Private tileset', filename: 'private.zip',
            owner_id: 1, is_public: false
        })

        const response = await manager.retrieve({ headers: {} })

        assert.equal(response.status, 200)
        const parsed = JSON.parse(response.content as string)
        assert.lengthOf(parsed, 1)
        assert.equal(parsed[0].description, 'Public tileset')
    })

    test('admin users see all tilesets', async ({ assert }) => {
        const manager = new TestTilesetManager()
        const db = new MockDatabaseAdapter()
        const storage = new LocalStorageService('.test-retrieve-admin')
        manager.setDependencies(db, storage)

        await db.save({
            name: 'test-tilesets', type: 'application/json',
            url: 'test-tilesets/1', tileset_url: 'https://example.com/1/tileset.json',
            date: new Date(), description: 'Public', filename: 'public.zip',
            owner_id: 1, is_public: true
        })

        await db.save({
            name: 'test-tilesets', type: 'application/json',
            url: 'test-tilesets/2', tileset_url: 'https://example.com/2/tileset.json',
            date: new Date(), description: 'Private', filename: 'private.zip',
            owner_id: 1, is_public: false
        })

        const response = await manager.retrieve({
            headers: { 'x-user-id': 'admin-1', 'x-user-roles': 'admin' }
        })

        assert.equal(response.status, 200)
        assert.lengthOf(JSON.parse(response.content as string), 2)
    })

    test('owner sees their own private tilesets', async ({ assert }) => {
        const manager = new TestTilesetManager()
        const db = new MockDatabaseAdapter()
        const storage = new LocalStorageService('.test-retrieve-owner')
        manager.setDependencies(db, storage)

        await db.getKnex()('users').insert({ keycloak_id: 'owner-user' })
        const user = await db.getKnex()('users').where('keycloak_id', 'owner-user').first()

        await db.save({
            name: 'test-tilesets', type: 'application/json',
            url: 'test-tilesets/1', tileset_url: 'https://example.com/1/tileset.json',
            date: new Date(), description: 'My private tileset', filename: 'private.zip',
            owner_id: user.id, is_public: false
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

test.group('TilesetManager — endpoints and OpenAPI', () => {
    test('exposes status endpoint and excludes direct file serving', ({ assert }) => {
        const manager = new TestTilesetManager()
        const db = new MockDatabaseAdapter()
        const storage = new LocalStorageService('.test-endpoints')
        manager.setDependencies(db, storage)

        const endpoints = manager.getEndpoints()

        const statusEndpoint = endpoints.find(ep => ep.path.includes('/status'))
        assert.isDefined(statusEndpoint)
        assert.equal(statusEndpoint?.method, 'get')

        const filesEndpoint = endpoints.find(ep => ep.path.includes('/files/'))
        assert.isUndefined(filesEndpoint)
    })

    test('getOpenAPISpec returns complete spec with tileset-specific paths and schemas', ({ assert }) => {
        const manager = new TestTilesetManager()
        const db = new MockDatabaseAdapter()
        const storage = new LocalStorageService('.test-openapi')
        manager.setDependencies(db, storage)

        const spec = manager.getOpenAPISpec()

        // Paths
        assert.isDefined(spec.paths['/test-tilesets'])
        assert.isDefined(spec.paths['/test-tilesets'].get)
        assert.isDefined(spec.paths['/test-tilesets'].post)
        assert.isDefined(spec.paths['/test-tilesets/{id}/status'])
        assert.isDefined(spec.paths['/test-tilesets/{id}'].put)
        assert.isDefined(spec.paths['/test-tilesets/{id}'].delete)

        // Tileset-specific responses
        assert.isDefined(spec.paths['/test-tilesets'].post!.responses!['202'])
        assert.isDefined(spec.paths['/test-tilesets/{id}'].delete!.responses!['409'])

        // Schema
        assert.isDefined(spec.schemas!['TilesetResponse'])
        assert.isDefined(spec.schemas!['TilesetResponse'].properties!['tileset_url'])
        assert.isDefined(spec.schemas!['TilesetResponse'].properties!['upload_status'])

        // Tags
        assert.isDefined(spec.tags)
        assert.equal(spec.tags![0].name, 'test-tilesets')
    })
})

// Test subclass for queue verification
class TestTilesetManagerWithQueueAccess extends TilesetManager {
    getConfiguration(): AssetsManagerConfiguration {
        return {
            name: 'test-tilesets-queue',
            description: 'Test tileset manager for queue testing',
            contentType: 'application/json',
            extension: '.zip',
            endpoint: 'test-tilesets-queue'
        }
    }

    hasUploadQueue(): boolean {
        return this.uploadQueue !== null
    }
}

test.group('TilesetManager — async upload queue', () => {
    test('setUploadQueue enables async processing', ({ assert }) => {
        const manager = new TestTilesetManagerWithQueueAccess()
        const db = new MockDatabaseAdapter()
        const storage = new LocalStorageService('.test-queue')
        manager.setDependencies(db, storage)

        assert.isFalse(manager.hasUploadQueue())

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mockQueue = { add: async () => ({ id: 'job-1' }) } as any
        manager.setUploadQueue(mockQueue)

        assert.isTrue(manager.hasUploadQueue())
    })
})
