import { test } from '@japa/runner'
import Database from 'better-sqlite3'
import { KyselyDatabaseAdapter } from '@cepseudo/database'
import { AuthMiddleware, GatewayAuthProvider, UserService } from '@cepseudo/auth'
import type { AuthenticatedUser, StoreConfiguration, UserRecord, UserRepository } from '@cepseudo/shared'
import { CustomTableManager } from '../src/custom_table_manager.js'

/** In-memory UserRepository: ids are assigned in order of first appearance. */
function createMockUserRepository(): UserRepository {
    const users = new Map<string, UserRecord>()
    let nextId = 1
    return {
        async initializeTables() {},
        async findOrCreateUser(authUser: AuthenticatedUser) {
            const existing = users.get(authUser.subject)
            if (existing) return existing
            const record: UserRecord = { id: nextId++, keycloak_id: authUser.subject, roles: authUser.roles, created_at: new Date(), updated_at: new Date() }
            users.set(authUser.subject, record)
            return record
        },
        async getUserById(id: number) {
            return [...users.values()].find(u => u.id === id)
        },
        async getUserByKeycloakId(keycloakId: string) {
            return users.get(keycloakId)
        },
    }
}

class SensorsManager extends CustomTableManager {
    getConfiguration(): StoreConfiguration {
        return {
            name: 'sensors',
            description: 'Sensors under test',
            columns: { label: 'text not null', value: 'real' },
        }
    }
}

const asUser = (id: string, body?: unknown, params?: Record<string, string>) => ({
    headers: { 'x-user-id': id, 'x-user-roles': 'user' },
    body,
    params,
})

test.group('CustomTableManager - request body sanitisation', group => {
    let db: KyselyDatabaseAdapter
    let manager: SensorsManager

    group.setup(async () => {
        process.env.AUTH_MODE = 'gateway'
        db = KyselyDatabaseAdapter.fromSQLiteDatabase(new Database(':memory:'), async () => Buffer.alloc(0), { enableForeignKeys: false })
        manager = new SensorsManager()
        manager.setDependencies(db, new AuthMiddleware(new GatewayAuthProvider(), new UserService(createMockUserRepository())))
        await manager.initializeTable()
    })

    group.teardown(async () => {
        await db.close()
    })

    test('create ignores a client-supplied id and owner_id', async ({ assert }) => {
        const res = await manager.handleCreate(asUser('alice', { id: 999, owner_id: 42, label: 'a', value: 1 }))
        assert.equal(res.status, 201)

        const { id } = JSON.parse(res.content as string)
        assert.notEqual(id, 999)
        const record = await manager.findById(id)
        assert.equal(record?.owner_id, 1)
        assert.equal(record?.label, 'a')
    })

    test('create rejects undeclared columns with a validation error, not a SQL error', async ({ assert }) => {
        const res = await manager.handleCreate(asUser('alice', { label: 'b', colour: 'red' }))
        assert.equal(res.status, 422)
        assert.include(res.content as string, 'colour')
    })

    test('update cannot transfer or clear ownership', async ({ assert }) => {
        const created = await manager.handleCreate(asUser('alice', { label: 'c', value: 3 }))
        const { id } = JSON.parse(created.content as string)

        const transfer = await manager.handleUpdate(asUser('alice', { owner_id: 2, value: 4 }, { id: String(id) }))
        assert.equal(transfer.status, 200)
        let record = await manager.findById(id)
        assert.equal(record?.owner_id, 1)
        assert.equal(record?.value, 4)

        const clear = await manager.handleUpdate(asUser('alice', { owner_id: null }, { id: String(id) }))
        assert.equal(clear.status, 200)
        record = await manager.findById(id)
        assert.equal(record?.owner_id, 1)

        // Alice still owns it, so Bob is still refused
        const bob = await manager.handleUpdate(asUser('bob', { value: 5 }, { id: String(id) }))
        assert.equal(bob.status, 403)
    })

    test('update rejects undeclared columns', async ({ assert }) => {
        const created = await manager.handleCreate(asUser('alice', { label: 'd' }))
        const { id } = JSON.parse(created.content as string)

        const res = await manager.handleUpdate(asUser('alice', { nope: 1 }, { id: String(id) }))
        assert.equal(res.status, 422)
        assert.include(res.content as string, 'nope')
    })

    test('update accepts a record echoed back from a read', async ({ assert }) => {
        const created = await manager.handleCreate(asUser('alice', { label: 'e', value: 1 }))
        const { id } = JSON.parse(created.content as string)
        const record = await manager.findById(id)

        const res = await manager.handleUpdate(asUser('alice', { ...record, value: 2 }, { id: String(id) }))
        assert.equal(res.status, 200)
        assert.equal((await manager.findById(id))?.value, 2)
    })
})
