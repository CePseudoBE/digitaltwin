import { test } from '@japa/runner'
import knex, { type Knex } from 'knex'
import { KnexUserRepository } from '../src/knex_user_repository.js'
import type { AuthenticatedUser } from '@digitaltwin/shared'

let db: Knex

function createDb(): Knex {
    return knex({
        client: 'better-sqlite3',
        connection: { filename: ':memory:' },
        useNullAsDefault: true,
        pool: { min: 1, max: 1 }
    })
}

test.group('KnexUserRepository', (group) => {
    group.each.setup(async () => {
        db = createDb()
        // Enable foreign keys for SQLite
        await db.raw('PRAGMA foreign_keys = ON')
    })

    group.each.teardown(async () => {
        await db.destroy()
    })

    test('initializeTables() creates users, roles, user_roles tables', async ({ assert }) => {
        const repo = new KnexUserRepository(db)
        await repo.initializeTables()

        assert.isTrue(await db.schema.hasTable('users'))
        assert.isTrue(await db.schema.hasTable('roles'))
        assert.isTrue(await db.schema.hasTable('user_roles'))
    })

    test('initializeTables() is idempotent', async ({ assert }) => {
        const repo = new KnexUserRepository(db)

        await repo.initializeTables()
        await assert.doesNotThrow(() => repo.initializeTables())

        assert.isTrue(await db.schema.hasTable('users'))
    })

    test('findOrCreateUser() creates a new user with ID', async ({ assert }) => {
        const repo = new KnexUserRepository(db)
        await repo.initializeTables()

        const authUser: AuthenticatedUser = { id: 'keycloak-uuid-1', roles: ['user'] }
        const result = await repo.findOrCreateUser(authUser)

        assert.isDefined(result.id)
        assert.isNumber(result.id)
        assert.equal(result.keycloak_id, 'keycloak-uuid-1')
    })

    test('findOrCreateUser() returns existing user for same keycloak_id', async ({ assert }) => {
        const repo = new KnexUserRepository(db)
        await repo.initializeTables()

        const authUser: AuthenticatedUser = { id: 'keycloak-uuid-2', roles: ['user'] }
        const first = await repo.findOrCreateUser(authUser)
        const second = await repo.findOrCreateUser(authUser)

        assert.equal(first.id, second.id)
        assert.equal(second.keycloak_id, 'keycloak-uuid-2')
    })

    test('findOrCreateUser() synchronizes roles (add + remove)', async ({ assert }) => {
        const repo = new KnexUserRepository(db)
        await repo.initializeTables()

        const authUser: AuthenticatedUser = { id: 'keycloak-uuid-3', roles: ['user', 'editor'] }
        const first = await repo.findOrCreateUser(authUser)
        assert.includeMembers(first.roles, ['user', 'editor'])

        // Update roles: remove editor, add admin
        authUser.roles = ['user', 'admin']
        const second = await repo.findOrCreateUser(authUser)
        assert.includeMembers(second.roles, ['user', 'admin'])
        assert.notInclude(second.roles, 'editor')
    })

    test('findOrCreateUser() with empty roles clears all roles', async ({ assert }) => {
        const repo = new KnexUserRepository(db)
        await repo.initializeTables()

        await repo.findOrCreateUser({ id: 'keycloak-uuid-4', roles: ['user', 'admin'] })
        const result = await repo.findOrCreateUser({ id: 'keycloak-uuid-4', roles: [] })

        assert.deepEqual(result.roles, [])
    })

    test('getUserById() returns user with roles', async ({ assert }) => {
        const repo = new KnexUserRepository(db)
        await repo.initializeTables()

        const created = await repo.findOrCreateUser({ id: 'keycloak-uuid-5', roles: ['user', 'admin'] })
        const result = await repo.getUserById(created.id!)

        assert.isDefined(result)
        assert.equal(result!.id, created.id)
        assert.equal(result!.keycloak_id, 'keycloak-uuid-5')
        assert.includeMembers(result!.roles, ['user', 'admin'])
    })

    test('getUserById() returns undefined when not found', async ({ assert }) => {
        const repo = new KnexUserRepository(db)
        await repo.initializeTables()

        const result = await repo.getUserById(99999)

        assert.isUndefined(result)
    })

    test('getUserByKeycloakId() returns user with roles', async ({ assert }) => {
        const repo = new KnexUserRepository(db)
        await repo.initializeTables()

        await repo.findOrCreateUser({ id: 'keycloak-uuid-6', roles: ['editor'] })
        const result = await repo.getUserByKeycloakId('keycloak-uuid-6')

        assert.isDefined(result)
        assert.equal(result!.keycloak_id, 'keycloak-uuid-6')
        assert.includeMembers(result!.roles, ['editor'])
    })

    test('getUserByKeycloakId() returns undefined when not found', async ({ assert }) => {
        const repo = new KnexUserRepository(db)
        await repo.initializeTables()

        const result = await repo.getUserByKeycloakId('nonexistent')

        assert.isUndefined(result)
    })

    test('keycloak_id uniqueness constraint', async ({ assert }) => {
        const repo = new KnexUserRepository(db)
        await repo.initializeTables()

        await db('users').insert({ keycloak_id: 'dup-id', created_at: new Date(), updated_at: new Date() })

        await assert.rejects(
            () => db('users').insert({ keycloak_id: 'dup-id', created_at: new Date(), updated_at: new Date() }),
            /UNIQUE constraint failed/
        )
    })

    test('timestamps are set on creation', async ({ assert }) => {
        const repo = new KnexUserRepository(db)
        await repo.initializeTables()

        const before = new Date()
        const result = await repo.findOrCreateUser({ id: 'keycloak-uuid-7', roles: ['user'] })
        const after = new Date()

        assert.instanceOf(result.created_at, Date)
        assert.instanceOf(result.updated_at, Date)
        assert.isTrue(result.created_at! >= before)
        assert.isTrue(result.updated_at! <= after)
    })
})
