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
