import { test } from '@japa/runner'
import { AssetsManager } from '../src/assets_manager.js'
import { MockDatabaseAdapter } from './mocks/mock_database_adapter.js'
import { MockStorageService } from './mocks/mock_storage_service.js'
import { fakeAuth } from './mocks/fake_auth.js'
import type { AssetsConfiguration, DataResponse } from '@cepseudo/shared'

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

/** The caller is whoever the fake provider says; requests carry no identity headers. */
function createManager(subject: string | null = null, roles: string[] = ['user']) {
    const storage = new MockStorageService()
    const db = new MockDatabaseAdapter({ storage })
    const manager = new TestAssetsManager()
    const auth = fakeAuth(db)
    auth.actAs(subject, roles)
    manager.setDependencies(db, storage, auth.middleware)
    return { manager, db, storage, auth }
}

const someoneElsesAsset = {
    id: 1, name: 'test-assets', contentType: 'application/octet-stream',
    url: 'test/asset.bin', date: new Date(), owner_id: 999,
    description: 'Original', source: 'https://example.com',
    filename: 'asset.bin', data: async () => Buffer.from('test')
}

test.group('AssetsManager — authentication required', () => {
    test('handleUpload() rejects anonymous requests', async ({ assert }) => {
        const { manager } = createManager()

        const response: DataResponse = await manager.handleUpload({
            headers: {},
            body: { description: 'Test file', source: 'https://example.com' },
            file: { path: '/tmp/test.bin', originalname: 'test.bin' }
        })

        assert.equal(response.status, 401)
        assert.include(JSON.parse(response.content.toString()).error, 'Authentication required')
    })

    test('identity headers alone do not authenticate: the provider decides', async ({ assert }) => {
        const { manager } = createManager()

        const response: DataResponse = await manager.handleUpload({
            headers: { 'x-user-id': '12345-67890', 'x-user-roles': 'admin' },
            body: { description: 'Test file', source: 'https://example.com' },
            file: { path: '/tmp/test.bin', originalname: 'test.bin' }
        })

        assert.equal(response.status, 401)
    })

    test('handleUpdate() rejects anonymous requests', async ({ assert }) => {
        const { manager } = createManager()

        const response: DataResponse = await manager.handleUpdate({
            headers: {},
            params: { id: '1' },
            body: { description: 'Updated description' }
        })

        assert.equal(response.status, 401)
        assert.include(JSON.parse(response.content.toString()).error, 'Authentication required')
    })

    test('handleDelete() rejects anonymous requests', async ({ assert }) => {
        const { manager } = createManager()

        const response: DataResponse = await manager.handleDelete({
            headers: {},
            params: { id: '1' }
        })

        assert.equal(response.status, 401)
        assert.include(JSON.parse(response.content.toString()).error, 'Authentication required')
    })

    test('handleUpload() validates required fields even with valid auth', async ({ assert }) => {
        const { manager } = createManager('12345-67890')

        const response: DataResponse = await manager.handleUpload({
            headers: {},
            body: {},
            file: { path: '/tmp/test.bin', originalname: 'test.bin' }
        })

        assert.equal(response.status, 400)
        assert.include(JSON.parse(response.content.toString()).error, 'Missing required fields')
    })

    test('handleDeleteBatch() rejects anonymous requests', async ({ assert }) => {
        const { manager } = createManager()

        const response: DataResponse = await manager.handleDeleteBatch({
            headers: {},
            body: { ids: ['1', '2'] }
        })

        assert.equal(response.status, 401)
        assert.include(JSON.parse(response.content.toString()).error, 'Authentication required')
    })
})

test.group('AssetsManager — ownership enforcement', () => {
    test('handleUpdate() rejects when user tries to modify another users asset', async ({ assert }) => {
        const { manager, db } = createManager('12345-67890')

        db.getById = async () => someoneElsesAsset
        manager.getAssetById = async () => someoneElsesAsset

        const response: DataResponse = await manager.handleUpdate({
            headers: {},
            params: { id: '1' },
            body: { description: 'Trying to update someone elses asset' }
        })

        assert.equal(response.status, 403)
        assert.include(JSON.parse(response.content.toString()).error, 'You can only modify your own assets')
    })

    test('handleDelete() rejects when user tries to delete another users asset', async ({ assert }) => {
        const { manager } = createManager('12345-67890')

        manager.getAssetById = async () => someoneElsesAsset

        const response: DataResponse = await manager.handleDelete({
            headers: {},
            params: { id: '1' }
        })

        assert.equal(response.status, 403)
        assert.include(JSON.parse(response.content.toString()).error, 'You can only modify your own assets')
    })

    test('an admin role sent in headers grants nothing when the provider says otherwise', async ({ assert }) => {
        const { manager } = createManager('12345-67890')

        manager.getAssetById = async () => someoneElsesAsset

        const response: DataResponse = await manager.handleDelete({
            headers: { 'x-user-id': '12345-67890', 'x-user-roles': 'admin' },
            params: { id: '1' }
        })

        assert.equal(response.status, 403)
    })

    test('handleUpdate() returns 404 for non-existent assets', async ({ assert }) => {
        const { manager } = createManager('12345-67890')

        manager.getAssetById = async () => undefined

        const response: DataResponse = await manager.handleUpdate({
            headers: {},
            params: { id: '999' },
            body: { description: 'Updated description' }
        })

        assert.equal(response.status, 404)
        assert.include(JSON.parse(response.content.toString()).error, 'Asset not found')
    })
})

test.group('AssetsManager — owner happy path', () => {
    test('handleUpdate() allows owner to modify their own asset', async ({ assert }) => {
        const { manager, db } = createManager('owner-user-id')

        const owner = await db.getUserRepository().findOrCreateUser({ subject: 'owner-user-id', roles: ['user'] })
        manager.getAssetById = async () => ({ ...someoneElsesAsset, owner_id: owner.id })

        let updateWasCalled = false
        manager.updateAssetMetadata = async () => { updateWasCalled = true }

        const response: DataResponse = await manager.handleUpdate({
            headers: {},
            params: { id: '1' },
            body: { description: 'Updated by owner' }
        })

        assert.equal(response.status, 200)
        assert.isTrue(updateWasCalled)
    })

    test('handleDelete() allows owner to delete their own asset', async ({ assert }) => {
        const { manager, db } = createManager('owner-user-id')

        const owner = await db.getUserRepository().findOrCreateUser({ subject: 'owner-user-id', roles: ['user'] })
        manager.getAssetById = async () => ({ ...someoneElsesAsset, owner_id: owner.id })

        let deleteWasCalled = false
        manager.deleteAssetById = async () => { deleteWasCalled = true }

        const response: DataResponse = await manager.handleDelete({
            headers: {},
            params: { id: '1' }
        })

        assert.equal(response.status, 200)
        assert.isTrue(deleteWasCalled)
    })
})

test.group('AssetsManager — admin override', () => {
    test('handleDelete() allows admin to delete any asset', async ({ assert }) => {
        const { manager } = createManager('admin-user-id', ['admin'])

        manager.getAssetById = async () => someoneElsesAsset

        let deleteWasCalled = false
        manager.deleteAssetById = async () => { deleteWasCalled = true }

        const response: DataResponse = await manager.handleDelete({
            headers: {},
            params: { id: '1' }
        })

        assert.equal(response.status, 200)
        assert.isTrue(deleteWasCalled)
    })

    test('handleUpdate() allows admin to modify any asset', async ({ assert }) => {
        const { manager } = createManager('admin-user-id', ['admin'])

        manager.getAssetById = async () => someoneElsesAsset

        let updateWasCalled = false
        manager.updateAssetMetadata = async () => { updateWasCalled = true }

        const response: DataResponse = await manager.handleUpdate({
            headers: {},
            params: { id: '1' },
            body: { description: 'Admin updated description' }
        })

        assert.equal(response.status, 200)
        assert.isTrue(updateWasCalled)
    })

    test('handleDeleteBatch() allows admin to delete assets from different owners', async ({ assert }) => {
        const { manager } = createManager('admin-user-id', ['admin'])

        const assets = new Map([
            ['1', { id: 1, name: 'test-assets', owner_id: 100, url: 'test/1.bin', date: new Date(), contentType: 'application/octet-stream', data: async () => Buffer.from('') }],
            ['2', { id: 2, name: 'test-assets', owner_id: 200, url: 'test/2.bin', date: new Date(), contentType: 'application/octet-stream', data: async () => Buffer.from('') }],
            ['3', { id: 3, name: 'test-assets', owner_id: 300, url: 'test/3.bin', date: new Date(), contentType: 'application/octet-stream', data: async () => Buffer.from('') }]
        ])

        manager.getAssetById = async (id: string) => assets.get(id)

        const deletedIds: string[] = []
        manager.deleteAssetById = async (id: string) => { deletedIds.push(id) }

        const response: DataResponse = await manager.handleDeleteBatch({
            headers: {},
            body: { ids: ['1', '2', '3'] }
        })

        assert.equal(response.status, 200)
        const result = JSON.parse(response.content.toString()) as { results: Array<{ success: boolean }> }
        assert.equal(result.results.filter(r => r.success).length, 3)
        assert.deepEqual(deletedIds.sort(), ['1', '2', '3'])
    })

    test('retrieve() lists private assets of others only for admins', async ({ assert }) => {
        const { manager, db, auth } = createManager('admin-user-id', ['admin'])

        await db.save({ name: 'test-assets', type: 'application/octet-stream', url: 'test/1.bin', date: new Date(), owner_id: 999, is_public: false })
        await db.save({ name: 'test-assets', type: 'application/octet-stream', url: 'test/2.bin', date: new Date(), owner_id: 999, is_public: true })

        const asAdmin = await manager.retrieve({ headers: {} })
        assert.equal(asAdmin.status, 200)
        assert.lengthOf(JSON.parse(asAdmin.content.toString()), 2)

        auth.actAs('someone-else')
        const asUser = await manager.retrieve({ headers: {} })
        assert.lengthOf(JSON.parse(asUser.content.toString()), 1)

        auth.actAs(null)
        const anonymous = await manager.retrieve({ headers: {} })
        assert.lengthOf(JSON.parse(anonymous.content.toString()), 1)
    })
})

test.group('AssetsManager — auth error handling', () => {
    test('handleUpload() returns 500 when auth middleware throws', async ({ assert }) => {
        const { manager } = createManager('12345-67890')

        ;(manager as unknown as { authMiddleware: unknown }).authMiddleware = {
            authenticate: async () => { throw new Error('Database connection failed') }
        }

        const response: DataResponse = await manager.handleUpload({
            headers: {},
            body: { description: 'Test file', source: 'https://example.com' },
            file: { path: '/tmp/test.bin', originalname: 'test.bin' }
        })

        assert.equal(response.status, 500)
        assert.include(JSON.parse(response.content.toString()).error, 'Database connection failed')
    })
})
