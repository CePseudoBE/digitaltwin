import { test } from '@japa/runner'
import Database from 'better-sqlite3'
import { Kysely, SqliteDialect } from 'kysely'
import { KyselyUserRepository } from '../src/kysely_user_repository.js'
import type { AuthenticatedUser } from '@digitaltwin/shared'

function createDb() {
    const sqliteDb = new Database(':memory:')
    const db = new Kysely<any>({
        dialect: new SqliteDialect({ database: sqliteDb })
    })
    return { db, sqliteDb }
}

test.group('KyselyUserRepository', (group) => {
    let db: Kysely<any>
    let sqliteDb: InstanceType<typeof Database>

    group.each.setup(() => {
        const result = createDb()
        db = result.db
        sqliteDb = result.sqliteDb
    })

    group.each.teardown(async () => {
        await db.destroy()
    })

    test('initializeTables() creates users, roles, user_roles tables', async ({ assert }) => {
        const repo = new KyselyUserRepository(db)
        await repo.initializeTables()

        const tables = await db.introspection.getTables()
        const names = tables.map(t => t.name)
        assert.include(names, 'users')
        assert.include(names, 'roles')
        assert.include(names, 'user_roles')
    })

    test('initializeTables() is idempotent', async ({ assert }) => {
        const repo = new KyselyUserRepository(db)

        await repo.initializeTables()
        await repo.initializeTables()

        const tables = await db.introspection.getTables()
        assert.isTrue(tables.some(t => t.name === 'users'))
    })

    test('findOrCreateUser() creates a new user with ID', async ({ assert }) => {
        const repo = new KyselyUserRepository(db)
        await repo.initializeTables()

        const authUser: AuthenticatedUser = { id: 'keycloak-uuid-1', roles: ['user'] }
        const result = await repo.findOrCreateUser(authUser)

        assert.isDefined(result.id)
        assert.isNumber(result.id)
        assert.equal(result.keycloak_id, 'keycloak-uuid-1')
    })

    test('findOrCreateUser() returns existing user for same keycloak_id', async ({ assert }) => {
        const repo = new KyselyUserRepository(db)
        await repo.initializeTables()

        const authUser: AuthenticatedUser = { id: 'keycloak-uuid-2', roles: ['user'] }
        const first = await repo.findOrCreateUser(authUser)
        const second = await repo.findOrCreateUser(authUser)

        assert.equal(first.id, second.id)
        assert.equal(second.keycloak_id, 'keycloak-uuid-2')
    })

    test('findOrCreateUser() synchronizes roles (add + remove)', async ({ assert }) => {
        const repo = new KyselyUserRepository(db)
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
        const repo = new KyselyUserRepository(db)
        await repo.initializeTables()

        await repo.findOrCreateUser({ id: 'keycloak-uuid-4', roles: ['user', 'admin'] })
        const result = await repo.findOrCreateUser({ id: 'keycloak-uuid-4', roles: [] })

        assert.deepEqual(result.roles, [])
    })

    test('getUserById() returns user with roles', async ({ assert }) => {
        const repo = new KyselyUserRepository(db)
        await repo.initializeTables()

        const created = await repo.findOrCreateUser({ id: 'keycloak-uuid-5', roles: ['user', 'admin'] })
        const result = await repo.getUserById(created.id!)

        assert.isDefined(result)
        assert.equal(result!.id, created.id)
        assert.equal(result!.keycloak_id, 'keycloak-uuid-5')
        assert.includeMembers(result!.roles, ['user', 'admin'])
    })

    test('getUserById() returns undefined when not found', async ({ assert }) => {
        const repo = new KyselyUserRepository(db)
        await repo.initializeTables()

        const result = await repo.getUserById(99999)
        assert.isUndefined(result)
    })

    test('getUserByKeycloakId() returns user with roles', async ({ assert }) => {
        const repo = new KyselyUserRepository(db)
        await repo.initializeTables()

        await repo.findOrCreateUser({ id: 'keycloak-uuid-6', roles: ['editor'] })
        const result = await repo.getUserByKeycloakId('keycloak-uuid-6')

        assert.isDefined(result)
        assert.equal(result!.keycloak_id, 'keycloak-uuid-6')
        assert.includeMembers(result!.roles, ['editor'])
    })

    test('getUserByKeycloakId() returns undefined when not found', async ({ assert }) => {
        const repo = new KyselyUserRepository(db)
        await repo.initializeTables()

        const result = await repo.getUserByKeycloakId('nonexistent')
        assert.isUndefined(result)
    })

    test('keycloak_id uniqueness constraint', async ({ assert }) => {
        const repo = new KyselyUserRepository(db)
        await repo.initializeTables()

        await db.insertInto('users').values({ keycloak_id: 'dup-id', created_at: new Date().toISOString(), updated_at: new Date().toISOString() }).execute()

        await assert.rejects(
            () => db.insertInto('users').values({ keycloak_id: 'dup-id', created_at: new Date().toISOString(), updated_at: new Date().toISOString() }).execute(),
            /UNIQUE constraint failed/
        )
    })

    test('timestamps are set on creation', async ({ assert }) => {
        const repo = new KyselyUserRepository(db)
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
