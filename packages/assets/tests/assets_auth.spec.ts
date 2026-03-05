import { test } from '@japa/runner'
import { AssetsManager } from '../src/assets_manager.js'
import { MockDatabaseAdapter } from './mocks/mock_database_adapter.js'
import { MockStorageService } from './mocks/mock_storage_service.js'
import { AuthConfig, ApisixAuthParser } from '@digitaltwin/auth'
import type { AssetsConfiguration, DataResponse } from '@digitaltwin/shared'

class TestAssetsManager extends AssetsManager {
    getConfiguration(): AssetsConfiguration {
        return {
            name: 'test-assets',
            description: 'Test assets manager',
            contentType: 'application/octet-stream',
            extension: '.bin',
            endpoint: 'test-assets'
        }
    }
}

function enableAuth() {
    delete process.env.DIGITALTWIN_DISABLE_AUTH
    delete process.env.DIGITALTWIN_ANONYMOUS_USER_ID
    AuthConfig._resetConfig()
    ApisixAuthParser._resetProvider()
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

test.group('AssetsManager — authentication required', (group) => {
    group.setup(() => enableAuth())
    group.teardown(() => disableAuth())

    test('handleUpload() rejects requests without auth headers', async ({ assert }) => {
        const { manager } = createManager()

        const response: DataResponse = await manager.handleUpload({
            headers: {},
            body: { description: 'Test file', source: 'https://example.com' },
            file: { path: '/tmp/test.bin', originalname: 'test.bin' }
        })

        assert.equal(response.status, 401)
        assert.include(JSON.parse(response.content.toString()).error, 'Authentication required')
    })

    test('handleUpload() rejects requests with incomplete auth headers (missing x-user-id)', async ({ assert }) => {
        const { manager } = createManager()

        const response: DataResponse = await manager.handleUpload({
            headers: { 'x-user-roles': 'user' },
            body: { description: 'Test file', source: 'https://example.com' },
            file: { path: '/tmp/test.bin', originalname: 'test.bin' }
        })

        assert.equal(response.status, 401)
        assert.include(JSON.parse(response.content.toString()).error, 'Authentication required')
    })

    test('handleUpload() rejects requests with malformed auth headers (null x-user-id)', async ({ assert }) => {
        const { manager } = createManager()

        const response: DataResponse = await manager.handleUpload({
            headers: {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                'x-user-id': null as any,
                'x-user-roles': 'user'
            },
            body: { description: 'Test file', source: 'https://example.com' },
            file: { path: '/tmp/test.bin', originalname: 'test.bin' }
        })

        assert.equal(response.status, 401)
        assert.include(JSON.parse(response.content.toString()).error, 'Authentication required')
    })

    test('handleUpdate() rejects requests without auth headers', async ({ assert }) => {
        const { manager } = createManager()

        const response: DataResponse = await manager.handleUpdate({
            headers: {},
            params: { id: '1' },
            body: { description: 'Updated description' }
        })

        assert.equal(response.status, 401)
        assert.include(JSON.parse(response.content.toString()).error, 'Authentication required')
    })

    test('handleDelete() rejects requests without auth headers', async ({ assert }) => {
        const { manager } = createManager()

        const response: DataResponse = await manager.handleDelete({
            headers: {},
            params: { id: '1' }
        })

        assert.equal(response.status, 401)
        assert.include(JSON.parse(response.content.toString()).error, 'Authentication required')
    })

    test('handleUpload() validates required fields even with valid auth', async ({ assert }) => {
        const { manager } = createManager()

        const response: DataResponse = await manager.handleUpload({
            headers: { 'x-user-id': '12345-67890', 'x-user-roles': 'user' },
            body: {},
            file: { path: '/tmp/test.bin', originalname: 'test.bin' }
        })

        assert.equal(response.status, 400)
        assert.include(JSON.parse(response.content.toString()).error, 'Missing required fields')
    })

    test('handleDeleteBatch() rejects requests without auth headers', async ({ assert }) => {
        const { manager } = createManager()

        const response: DataResponse = await manager.handleDeleteBatch({
            headers: {},
            body: { ids: ['1', '2'] }
        })

        assert.equal(response.status, 401)
        assert.include(JSON.parse(response.content.toString()).error, 'Authentication required')
    })
})

test.group('AssetsManager — ownership enforcement', (group) => {
    group.setup(() => enableAuth())
    group.teardown(() => disableAuth())

    test('handleUpdate() rejects when user tries to modify another users asset', async ({ assert }) => {
        const { manager, db } = createManager()

        const existingAsset = {
            id: 1, name: 'test-assets', contentType: 'application/octet-stream',
            url: 'test/asset.bin', date: new Date(), owner_id: 999,
            description: 'Original', source: 'https://example.com',
            filename: 'asset.bin', data: async () => Buffer.from('test')
        }

        db.getById = async () => existingAsset
        manager.getAssetById = async () => existingAsset

        const response: DataResponse = await manager.handleUpdate({
            headers: { 'x-user-id': '12345-67890', 'x-user-roles': 'user' },
            params: { id: '1' },
            body: { description: 'Trying to update someone elses asset' }
        })

        assert.equal(response.status, 403)
        assert.include(JSON.parse(response.content.toString()).error, 'You can only modify your own assets')
    })

    test('handleDelete() rejects when user tries to delete another users asset', async ({ assert }) => {
        const { manager } = createManager()

        const existingAsset = {
            id: 1, name: 'test-assets', contentType: 'application/octet-stream',
            url: 'test/asset.bin', date: new Date(), owner_id: 999,
            description: 'Test asset', source: 'https://example.com',
            filename: 'asset.bin', data: async () => Buffer.from('test')
        }

        manager.getAssetById = async () => existingAsset

        const response: DataResponse = await manager.handleDelete({
            headers: { 'x-user-id': '12345-67890', 'x-user-roles': 'user' },
            params: { id: '1' }
        })

        assert.equal(response.status, 403)
        assert.include(JSON.parse(response.content.toString()).error, 'You can only modify your own assets')
    })

    test('handleUpdate() returns 404 for non-existent assets', async ({ assert }) => {
        const { manager } = createManager()

        manager.getAssetById = async () => undefined

        const response: DataResponse = await manager.handleUpdate({
            headers: { 'x-user-id': '12345-67890', 'x-user-roles': 'user' },
            params: { id: '999' },
            body: { description: 'Updated description' }
        })

        assert.equal(response.status, 404)
        assert.include(JSON.parse(response.content.toString()).error, 'Asset not found')
    })
})

test.group('AssetsManager — owner happy path', (group) => {
    group.setup(() => enableAuth())
    group.teardown(() => disableAuth())

    test('handleUpdate() allows owner to modify their own asset', async ({ assert }) => {
        const { manager, db } = createManager()

        // Create owner user in DB
        await db.getKnex()('users').insert({ keycloak_id: 'owner-user-id' })
        const owner = await db.getKnex()('users').where('keycloak_id', 'owner-user-id').first()

        const existingAsset = {
            id: 1, name: 'test-assets', contentType: 'application/octet-stream',
            url: 'test/asset.bin', date: new Date(), owner_id: owner.id,
            description: 'Original', source: 'https://example.com',
            filename: 'asset.bin', data: async () => Buffer.from('test')
        }

        manager.getAssetById = async () => existingAsset

        let updateWasCalled = false
        manager.updateAssetMetadata = async () => { updateWasCalled = true }

        const response: DataResponse = await manager.handleUpdate({
            headers: { 'x-user-id': 'owner-user-id', 'x-user-roles': 'user' },
            params: { id: '1' },
            body: { description: 'Updated by owner' }
        })

        assert.equal(response.status, 200)
        assert.isTrue(updateWasCalled)
    })

    test('handleDelete() allows owner to delete their own asset', async ({ assert }) => {
        const { manager, db } = createManager()

        await db.getKnex()('users').insert({ keycloak_id: 'owner-user-id' })
        const owner = await db.getKnex()('users').where('keycloak_id', 'owner-user-id').first()

        const existingAsset = {
            id: 1, name: 'test-assets', contentType: 'application/octet-stream',
            url: 'test/asset.bin', date: new Date(), owner_id: owner.id,
            description: 'Test asset', source: 'https://example.com',
            filename: 'asset.bin', data: async () => Buffer.from('test')
        }

        manager.getAssetById = async () => existingAsset

        let deleteWasCalled = false
        manager.deleteAssetById = async () => { deleteWasCalled = true }

        const response: DataResponse = await manager.handleDelete({
            headers: { 'x-user-id': 'owner-user-id', 'x-user-roles': 'user' },
            params: { id: '1' }
        })

        assert.equal(response.status, 200)
        assert.isTrue(deleteWasCalled)
    })
})

test.group('AssetsManager — admin override', (group) => {
    group.setup(() => enableAuth())
    group.teardown(() => disableAuth())

    test('handleDelete() allows admin to delete any asset', async ({ assert }) => {
        const { manager } = createManager()

        const existingAsset = {
            id: 1, name: 'test-assets', contentType: 'application/octet-stream',
            url: 'test/asset.bin', date: new Date(), owner_id: 999,
            description: 'Test asset', source: 'https://example.com',
            filename: 'asset.bin', data: async () => Buffer.from('test')
        }

        manager.getAssetById = async () => existingAsset

        let deleteWasCalled = false
        manager.deleteAssetById = async () => { deleteWasCalled = true }

        const response: DataResponse = await manager.handleDelete({
            headers: { 'x-user-id': 'admin-user-id', 'x-user-roles': 'admin' },
            params: { id: '1' }
        })

        assert.equal(response.status, 200)
        assert.isTrue(deleteWasCalled)
    })

    test('handleUpdate() allows admin to modify any asset', async ({ assert }) => {
        const { manager } = createManager()

        const existingAsset = {
            id: 1, name: 'test-assets', contentType: 'application/octet-stream',
            url: 'test/asset.bin', date: new Date(), owner_id: 999,
            description: 'Original', source: 'https://example.com',
            filename: 'asset.bin', data: async () => Buffer.from('test')
        }

        manager.getAssetById = async () => existingAsset

        let updateWasCalled = false
        manager.updateAssetMetadata = async () => { updateWasCalled = true }

        const response: DataResponse = await manager.handleUpdate({
            headers: { 'x-user-id': 'admin-user-id', 'x-user-roles': 'admin' },
            params: { id: '1' },
            body: { description: 'Admin updated description' }
        })

        assert.equal(response.status, 200)
        assert.isTrue(updateWasCalled)
    })

    test('handleDeleteBatch() allows admin to delete assets from different owners', async ({ assert }) => {
        const { manager } = createManager()

        const assets = new Map([
            ['1', { id: 1, name: 'test-assets', owner_id: 100, url: 'test/1.bin', date: new Date(), contentType: 'application/octet-stream', data: async () => Buffer.from('') }],
            ['2', { id: 2, name: 'test-assets', owner_id: 200, url: 'test/2.bin', date: new Date(), contentType: 'application/octet-stream', data: async () => Buffer.from('') }],
            ['3', { id: 3, name: 'test-assets', owner_id: 300, url: 'test/3.bin', date: new Date(), contentType: 'application/octet-stream', data: async () => Buffer.from('') }]
        ])

        manager.getAssetById = async (id: string) => assets.get(id)

        const deletedIds: string[] = []
        manager.deleteAssetById = async (id: string) => { deletedIds.push(id) }

        const response: DataResponse = await manager.handleDeleteBatch({
            headers: { 'x-user-id': 'admin-user-id', 'x-user-roles': 'admin' },
            body: { ids: ['1', '2', '3'] }
        })

        assert.equal(response.status, 200)
        const result = JSON.parse(response.content.toString())
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        assert.equal(result.results.filter((r: any) => r.success).length, 3)
        assert.deepEqual(deletedIds.sort(), ['1', '2', '3'])
    })
})

test.group('AssetsManager — auth error handling', (group) => {
    group.setup(() => enableAuth())
    group.teardown(() => disableAuth())

    test('handleUpload() returns 500 when auth middleware throws', async ({ assert }) => {
        const { manager } = createManager()

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(manager as any).authMiddleware = {
            authenticate: async () => { throw new Error('Database connection failed') }
        }

        const response: DataResponse = await manager.handleUpload({
            headers: { 'x-user-id': '12345-67890', 'x-user-roles': 'user' },
            body: { description: 'Test file', source: 'https://example.com' },
            file: { path: '/tmp/test.bin', originalname: 'test.bin' }
        })

        assert.equal(response.status, 500)
        assert.include(JSON.parse(response.content.toString()).error, 'Database connection failed')
    })
})
