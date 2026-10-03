import { test } from '@japa/runner'
import Database from 'better-sqlite3'
import { KyselyDatabaseAdapter } from '@cepseudo/database'
import { AuthMiddleware, GatewayAuthProvider, UserService } from '@cepseudo/auth'
import type { AuthenticatedUser, DataResponse, StoreConfiguration, UserRecord, UserRepository } from '@cepseudo/shared'
import { CustomTableManager } from '../src/custom_table_manager.js'
import type { CustomTableRecord } from '../src/custom_table_manager.js'

/** In-memory UserRepository: ids are assigned in order of first appearance. */
function createMockUserRepository(): UserRepository {
    const users = new Map<string, UserRecord>()
    let nextId = 1
    return {
        async initializeTables() {},
        async findOrCreateUser(authUser: AuthenticatedUser) {
            const existing = users.get(authUser.subject)
            if (existing) return existing
            const record: UserRecord = { id: nextId++, subject: authUser.subject, roles: authUser.roles, created_at: new Date(), updated_at: new Date() }
            users.set(authUser.subject, record)
            return record
        },
        async getUserById(id: number) {
            return [...users.values()].find(u => u.id === id)
        },
        async getUserBySubject(subject: string) {
            return users.get(subject)
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

class CountedSensorsManager extends SensorsManager {
    override getConfiguration(): StoreConfiguration {
        return { ...super.getConfiguration(), endpoints: [{ path: '/count', method: 'get', handler: 'countSensors' }] }
    }

    async countSensors(): Promise<DataResponse> {
        return { status: 200, content: JSON.stringify({ count: (await this.findAll()).length }) }
    }
}

const asUser = (id: string, body?: unknown, params?: Record<string, string>) => ({
    headers: { 'x-user-id': id, 'x-user-roles': 'user' },
    body,
    params,
})

async function attachDatabase(manager: CustomTableManager): Promise<KyselyDatabaseAdapter> {
    const db = KyselyDatabaseAdapter.fromSQLiteDatabase(new Database(':memory:'), async () => Buffer.alloc(0), { enableForeignKeys: false })
    manager.setDependencies(db, new AuthMiddleware(new GatewayAuthProvider(), new UserService(createMockUserRepository())))
    await manager.initializeTable()
    return db
}

const labelsAndValues = (rows: CustomTableRecord[]) => rows.map(({ label, value }) => ({ label, value }))

test.group('CustomTableManager - request body sanitisation', group => {
    let db: KyselyDatabaseAdapter
    let manager: SensorsManager

    group.setup(async () => {
        process.env.AUTH_MODE = 'gateway'
        manager = new SensorsManager()
        db = await attachDatabase(manager)
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

test.group('CustomTableManager - queries', group => {
    let db: KyselyDatabaseAdapter
    let manager: SensorsManager

    group.each.setup(async () => {
        manager = new SensorsManager()
        db = await attachDatabase(manager)
        await manager.create({ label: 'north', value: 1 })
        await manager.create({ label: 'north', value: 2 })
        await manager.create({ label: 'south', value: 1 })
        await manager.create({ label: '', value: 9 })
    })

    group.each.teardown(async () => {
        await db.close()
    })

    test('findByColumn returns the rows matching one column', async ({ assert }) => {
        const rows = await manager.findByColumn('label', 'north')

        assert.sameDeepMembers(labelsAndValues(rows), [
            { label: 'north', value: 1 },
            { label: 'north', value: 2 },
        ])
    })

    test('findByColumn rejects an empty value for a required column', async ({ assert }) => {
        await assert.rejects(() => manager.findByColumn('label', ''), /is required and cannot be empty/)
    })

    test('findByColumn matches an empty value when the column is not required', async ({ assert }) => {
        const rows = await manager.findByColumn('label', '', false)

        assert.deepEqual(labelsAndValues(rows), [{ label: '', value: 9 }])
    })

    test('findByColumns returns only the rows matching every condition', async ({ assert }) => {
        const rows = await manager.findByColumns({ label: 'north', value: 2 })

        assert.deepEqual(labelsAndValues(rows), [{ label: 'north', value: 2 }])
    })

    test('findByColumns rejects a required field with an empty value', async ({ assert }) => {
        await assert.rejects(
            () => manager.findByColumns({ label: '' }, { required: ['label'] }),
            /Field 'label' must have a non-empty value/
        )
    })

    test('findByColumns reports a failing custom validation as "Validation failed"', async ({ assert }) => {
        const upperCaseLabels = (conditions: Record<string, unknown>) => {
            if (conditions.label !== String(conditions.label).toUpperCase()) throw new Error('label must be upper case')
        }

        await assert.rejects(
            () => manager.findByColumns({ label: 'north' }, { validate: upperCaseLabels }),
            /^Validation failed: label must be upper case$/
        )
    })

    test('deleteByColumn deletes the matching rows and returns how many it deleted', async ({ assert }) => {
        assert.equal(await manager.deleteByColumn('label', 'north'), 2)

        assert.sameDeepMembers(labelsAndValues(await manager.findAll()), [
            { label: 'south', value: 1 },
            { label: '', value: 9 },
        ])
    })

    test('deleteByCondition deletes only the rows matching every condition and returns the count', async ({ assert }) => {
        assert.equal(await manager.deleteByCondition({ label: 'north', value: 1 }), 1)

        assert.sameDeepMembers(labelsAndValues(await manager.findAll()), [
            { label: 'north', value: 2 },
            { label: 'south', value: 1 },
            { label: '', value: 9 },
        ])
    })
})

test.group('CustomTableManager - HTTP handlers', group => {
    let db: KyselyDatabaseAdapter
    let manager: CountedSensorsManager

    group.each.setup(async () => {
        manager = new CountedSensorsManager()
        db = await attachDatabase(manager)
    })

    group.each.teardown(async () => {
        await db.close()
    })

    test('getEndpoints serves a configured endpoint under the store name, bound to the named method', async ({ assert }) => {
        await manager.create({ label: 'a' })
        await manager.create({ label: 'b' })

        const count = manager.getEndpoints().find(ep => ep.path === '/sensors/count')

        assert.equal(count?.method, 'get')
        assert.deepEqual(await count!.handler({}), { status: 200, content: JSON.stringify({ count: 2 }) })
    })

    test('handleGetById without an id answers 422', async ({ assert }) => {
        const res = await manager.handleGetById({ params: {} })

        assert.equal(res.status, 422)
    })

    test('handleUpdate without an identity answers 401 and leaves the record unchanged', async ({ assert }) => {
        const id = await manager.create({ label: 'a', value: 1, owner_id: 1 })

        const res = await manager.handleUpdate({ headers: {}, params: { id: String(id) }, body: { value: 2 } })

        assert.equal(res.status, 401)
        assert.equal((await manager.findById(id))?.value, 1)
    })

    test('handleDelete without an identity answers 401 and keeps the record', async ({ assert }) => {
        const id = await manager.create({ label: 'a', value: 1, owner_id: 1 })

        const res = await manager.handleDelete({ headers: {}, params: { id: String(id) } })

        assert.equal(res.status, 401)
        assert.isNotNull(await manager.findById(id))
    })

    test('a record without an owner cannot be updated or deleted by an authenticated user', async ({ assert }) => {
        const id = await manager.create({ label: 'orphan', value: 1 })

        const update = await manager.handleUpdate(asUser('alice', { value: 2 }, { id: String(id) }))
        const remove = await manager.handleDelete(asUser('alice', undefined, { id: String(id) }))

        assert.equal(update.status, 403)
        assert.equal(remove.status, 403)
        assert.equal((await manager.findById(id))?.value, 1)
    })
})
