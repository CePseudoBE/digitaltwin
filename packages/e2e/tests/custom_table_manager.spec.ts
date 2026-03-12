import { test } from '@japa/runner'
import { setupInfrastructure, type E2EInfrastructure } from './helpers/setup.js'
import { makeAuthRequest } from './helpers/auth_helpers.js'
import { E2ECustomTableManager } from './helpers/test_components.js'
import { AuthConfig } from '@digitaltwin/auth'

test.group('CustomTableManager E2E', (group) => {
    let infra: E2EInfrastructure
    let manager: E2ECustomTableManager

    group.setup(async () => {
        infra = await setupInfrastructure()
        manager = new E2ECustomTableManager()
        manager.setDependencies(infra.db, infra.authMiddleware)
        await manager.initializeTable()
    })

    group.teardown(async () => {
        process.env.DIGITALTWIN_DISABLE_AUTH = 'true'
        AuthConfig._resetConfig()
        await infra.cleanup()
    })

    test('handleCreate sets owner_id from authenticated user', async ({ assert }) => {
        const req = await makeAuthRequest(infra.db, 'user-ctm-1', ['user'], {
            body: { title: 'Test Record', value: 42, active: true },
        })

        const response = await manager.handleCreate(req)
        assert.equal(response.status, 201)

        const parsed = JSON.parse(response.content as string)
        assert.property(parsed, 'id')
        assert.isAbove(parsed.id, 0)

        // Verify owner_id was set
        const record = await manager.findById(parsed.id)
        assert.isDefined(record)
        assert.isDefined(record!.owner_id)
    })

    test('handleGetAll returns all records', async ({ assert }) => {
        const response = await manager.handleGetAll({})
        assert.equal(response.status, 200)

        const records = JSON.parse(response.content as string)
        assert.isArray(records)
        assert.isAbove(records.length, 0)
    })

    test('handleGetById returns specific record', async ({ assert }) => {
        const createReq = await makeAuthRequest(infra.db, 'user-ctm-2', ['user'], {
            body: { title: 'Specific Record', value: 100 },
        })
        const createResp = await manager.handleCreate(createReq)
        const { id } = JSON.parse(createResp.content as string)

        const response = await manager.handleGetById({ params: { id: String(id) } })
        assert.equal(response.status, 200)

        const record = JSON.parse(response.content as string)
        assert.equal(record.title, 'Specific Record')
        assert.equal(record.value, 100)
    })

    test('handleUpdate allows owner to update', async ({ assert }) => {
        const createReq = await makeAuthRequest(infra.db, 'user-ctm-3', ['user'], {
            body: { title: 'Updatable Record', value: 10 },
        })
        const createResp = await manager.handleCreate(createReq)
        const { id } = JSON.parse(createResp.content as string)

        // Update as same user (anonymous, same owner_id)
        const updateReq = await makeAuthRequest(infra.db, 'user-ctm-3', ['user'], {
            params: { id: String(id) },
            body: { title: 'Updated Record', value: 20 },
        })
        const updateResp = await manager.handleUpdate(updateReq)
        assert.equal(updateResp.status, 200)

        const record = await manager.findById(id)
        assert.equal(record!.title, 'Updated Record')
        assert.equal(record!.value, 20)
    })

    test('handleUpdate returns 403 for non-owner', async ({ assert }) => {
        // Create a record — with auth disabled, it gets the anonymous user's owner_id
        const createReq = await makeAuthRequest(infra.db, 'user-ctm-4', ['user'], {
            body: { title: 'Owned Record', value: 50 },
        })
        const createResp = await manager.handleCreate(createReq)
        const { id } = JSON.parse(createResp.content as string)

        // Manually change owner_id to a different user to simulate different ownership
        const otherUser = await infra.db.getUserRepository().findOrCreateUser({ id: 'user-ctm-other-owner', roles: ['user'] })
        await infra.db.updateById('e2e_custom_records', id, { owner_id: otherUser.id })

        // Now try to update — the anonymous user (from auth disabled) has a different ID
        const updateReq = await makeAuthRequest(infra.db, 'user-ctm-5', ['user'], {
            params: { id: String(id) },
            body: { title: 'Hacked Record' },
        })
        const updateResp = await manager.handleUpdate(updateReq)
        assert.equal(updateResp.status, 403)
    })

    test('handleDelete allows owner to delete', async ({ assert }) => {
        const createReq = await makeAuthRequest(infra.db, 'user-ctm-6', ['user'], {
            body: { title: 'Deletable Record', value: 999 },
        })
        const createResp = await manager.handleCreate(createReq)
        const { id } = JSON.parse(createResp.content as string)

        const deleteReq = await makeAuthRequest(infra.db, 'user-ctm-6', ['user'], {
            params: { id: String(id) },
        })
        const deleteResp = await manager.handleDelete(deleteReq)
        assert.equal(deleteResp.status, 200)

        const record = await manager.findById(id)
        assert.isNull(record)
    })

    test('handleDelete returns 403 for non-owner', async ({ assert }) => {
        const createReq = await makeAuthRequest(infra.db, 'user-ctm-7', ['user'], {
            body: { title: 'Protected Record', value: 777 },
        })
        const createResp = await manager.handleCreate(createReq)
        const { id } = JSON.parse(createResp.content as string)

        // Change owner to a different user
        const otherUser = await infra.db.getUserRepository().findOrCreateUser({ id: 'user-ctm-other-owner-2', roles: ['user'] })
        await infra.db.updateById('e2e_custom_records', id, { owner_id: otherUser.id })

        // Try to delete — should fail because anonymous user doesn't own it
        const deleteReq = await makeAuthRequest(infra.db, 'user-ctm-8', ['user'], {
            params: { id: String(id) },
        })
        const deleteResp = await manager.handleDelete(deleteReq)
        assert.equal(deleteResp.status, 403)

        const record = await manager.findById(id)
        assert.isDefined(record)
    })

    test('handleGetById returns 404 for non-existent record', async ({ assert }) => {
        const response = await manager.handleGetById({ params: { id: '99999' } })
        assert.equal(response.status, 404)
    })

    test('handleCreate returns 401 without auth', async ({ assert }) => {
        // Enable auth and reset ALL cached configs (AuthConfig + ApisixAuthParser provider)
        delete process.env.DIGITALTWIN_DISABLE_AUTH
        AuthConfig._resetConfig()
        const { ApisixAuthParser, UserService, AuthMiddleware: AM } = await import('@digitaltwin/auth')
        ApisixAuthParser._resetProvider()

        // Create a fresh AuthMiddleware so it picks up the new config
        const freshAuth = new AM(new UserService(infra.db.getUserRepository()))
        const freshManager = new E2ECustomTableManager()
        freshManager.setDependencies(infra.db, freshAuth)
        await freshManager.initializeTable()

        const response = await freshManager.handleCreate({
            headers: {},
            body: { title: 'No Auth', value: 0 },
        })
        assert.equal(response.status, 401)

        // Restore disabled auth
        process.env.DIGITALTWIN_DISABLE_AUTH = 'true'
        AuthConfig._resetConfig()
        ApisixAuthParser._resetProvider()
    })
})
