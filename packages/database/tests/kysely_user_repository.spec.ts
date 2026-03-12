import { test } from '@japa/runner'
import { KyselyUserRepository } from '../src/kysely_user_repository.js'
import { sqliteKyselyFactory, postgresKyselyFactory } from './helpers/factories.js'
import type { KyselyFactory } from './helpers/factories.js'
import type { AuthenticatedUser } from '@digitaltwin/shared'
import type { Kysely } from 'kysely'

function registerUserRepositoryTests(label: string, factory: KyselyFactory) {
    test.group(`KyselyUserRepository [${label}]`, group => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let db: Kysely<any>
        let dialect: 'postgres' | 'sqlite'
        let cleanup: () => Promise<void>

        group.each.setup(async () => {
            ({ db, dialect, cleanup } = await factory())
        })

        group.each.teardown(async () => {
            await cleanup()
        })

        test('initializeTables() creates users, roles, user_roles tables', async ({ assert }) => {
            const repo = new KyselyUserRepository(db, dialect)
            await repo.initializeTables()
            const tables = await db.introspection.getTables()
            const names = tables.map((t: { name: string }) => t.name)
            assert.include(names, 'users')
            assert.include(names, 'roles')
            assert.include(names, 'user_roles')
        })

        test('initializeTables() is idempotent', async ({ assert }) => {
            const repo = new KyselyUserRepository(db, dialect)
            await repo.initializeTables()
            await repo.initializeTables()
            const tables = await db.introspection.getTables()
            assert.isTrue(tables.some((t: { name: string }) => t.name === 'users'))
        })

        test('findOrCreateUser() creates a new user with ID', async ({ assert }) => {
            const repo = new KyselyUserRepository(db, dialect)
            await repo.initializeTables()
            const authUser: AuthenticatedUser = { id: 'keycloak-uuid-1', roles: ['user'] }
            const result = await repo.findOrCreateUser(authUser)
            assert.isDefined(result.id)
            assert.isNumber(result.id)
            assert.equal(result.keycloak_id, 'keycloak-uuid-1')
        })

        test('findOrCreateUser() returns existing user for same keycloak_id', async ({ assert }) => {
            const repo = new KyselyUserRepository(db, dialect)
            await repo.initializeTables()
            const authUser: AuthenticatedUser = { id: 'keycloak-uuid-2', roles: ['user'] }
            const first = await repo.findOrCreateUser(authUser)
            const second = await repo.findOrCreateUser(authUser)
            assert.equal(first.id, second.id)
        })

        test('findOrCreateUser() synchronizes roles (add + remove)', async ({ assert }) => {
            const repo = new KyselyUserRepository(db, dialect)
            await repo.initializeTables()
            const authUser: AuthenticatedUser = { id: 'keycloak-uuid-3', roles: ['user', 'editor'] }
            const first = await repo.findOrCreateUser(authUser)
            assert.includeMembers(first.roles, ['user', 'editor'])
            authUser.roles = ['user', 'admin']
            const second = await repo.findOrCreateUser(authUser)
            assert.includeMembers(second.roles, ['user', 'admin'])
            assert.notInclude(second.roles, 'editor')
        })

        test('findOrCreateUser() with empty roles clears all roles', async ({ assert }) => {
            const repo = new KyselyUserRepository(db, dialect)
            await repo.initializeTables()
            await repo.findOrCreateUser({ id: 'keycloak-uuid-4', roles: ['user', 'admin'] })
            const result = await repo.findOrCreateUser({ id: 'keycloak-uuid-4', roles: [] })
            assert.deepEqual(result.roles, [])
        })

        test('getUserById() returns user with roles', async ({ assert }) => {
            const repo = new KyselyUserRepository(db, dialect)
            await repo.initializeTables()
            const created = await repo.findOrCreateUser({ id: 'keycloak-uuid-5', roles: ['user', 'admin'] })
            const result = await repo.getUserById(created.id!)
            assert.isDefined(result)
            assert.equal(result!.id, created.id)
            assert.includeMembers(result!.roles, ['user', 'admin'])
        })

        test('getUserById() returns undefined when not found', async ({ assert }) => {
            const repo = new KyselyUserRepository(db, dialect)
            await repo.initializeTables()
            assert.isUndefined(await repo.getUserById(99999))
        })

        test('getUserByKeycloakId() returns user with roles', async ({ assert }) => {
            const repo = new KyselyUserRepository(db, dialect)
            await repo.initializeTables()
            await repo.findOrCreateUser({ id: 'keycloak-uuid-6', roles: ['editor'] })
            const result = await repo.getUserByKeycloakId('keycloak-uuid-6')
            assert.isDefined(result)
            assert.includeMembers(result!.roles, ['editor'])
        })

        test('getUserByKeycloakId() returns undefined when not found', async ({ assert }) => {
            const repo = new KyselyUserRepository(db, dialect)
            await repo.initializeTables()
            assert.isUndefined(await repo.getUserByKeycloakId('nonexistent'))
        })

        test('keycloak_id uniqueness constraint', async ({ assert }) => {
            const repo = new KyselyUserRepository(db, dialect)
            await repo.initializeTables()
            await db.insertInto('users').values({ keycloak_id: 'dup-id', created_at: new Date().toISOString(), updated_at: new Date().toISOString() }).execute()
            // Both SQLite ("UNIQUE constraint failed") and PG ("duplicate key") throw on duplicate
            await assert.rejects(
                () => db.insertInto('users').values({ keycloak_id: 'dup-id', created_at: new Date().toISOString(), updated_at: new Date().toISOString() }).execute(),
                /unique|duplicate/i
            )
        })

        test('timestamps are set on creation', async ({ assert }) => {
            const repo = new KyselyUserRepository(db, dialect)
            await repo.initializeTables()
            const result = await repo.findOrCreateUser({ id: 'keycloak-uuid-7', roles: ['user'] })
            assert.instanceOf(result.created_at, Date)
            assert.instanceOf(result.updated_at, Date)
            // Verify timestamps are recent (within 1 minute) — avoids clock skew issues between PG container and host
            const oneMinuteAgo = Date.now() - 60_000
            assert.isTrue(result.created_at!.getTime() > oneMinuteAgo)
            assert.isTrue(result.updated_at!.getTime() > oneMinuteAgo)
        })
    })
}

registerUserRepositoryTests('SQLite', sqliteKyselyFactory)

if (process.env.TEST_PG_HOST) {
    registerUserRepositoryTests('PostgreSQL', postgresKyselyFactory)
}
