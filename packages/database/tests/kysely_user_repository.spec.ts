import { test } from '@japa/runner'
import { KyselyUserRepository } from '../src/kysely_user_repository.js'
import { sqliteKyselyFactory, postgresKyselyFactory } from './helpers/factories.js'
import type { KyselyFactory } from './helpers/factories.js'
import type { AuthenticatedUser } from '@cepseudo/shared'
import type { Kysely } from 'kysely'
import { sql } from 'kysely'

/** The users/roles/user_roles tables as 1.x created them, identity column included. */
async function createV1UserTables(db: Kysely<any>, dialect: 'postgres' | 'sqlite'): Promise<void> {
    // Test tables from other specs reference users.id on PostgreSQL
    const cascade = dialect === 'postgres' ? sql` CASCADE` : sql``
    await sql`DROP TABLE IF EXISTS user_roles${cascade}`.execute(db)
    await sql`DROP TABLE IF EXISTS users${cascade}`.execute(db)
    await sql`DROP TABLE IF EXISTS roles${cascade}`.execute(db)
    const id = dialect === 'postgres' ? sql`SERIAL PRIMARY KEY` : sql`INTEGER PRIMARY KEY AUTOINCREMENT`
    const ts = dialect === 'postgres' ? sql`TIMESTAMPTZ` : sql`TIMESTAMP`
    await sql`CREATE TABLE roles (id ${id}, name VARCHAR(100) NOT NULL UNIQUE, created_at ${ts} DEFAULT CURRENT_TIMESTAMP)`.execute(db)
    await sql`CREATE TABLE users (id ${id}, keycloak_id VARCHAR(255) NOT NULL UNIQUE, created_at ${ts} DEFAULT CURRENT_TIMESTAMP, updated_at ${ts} DEFAULT CURRENT_TIMESTAMP)`.execute(db)
    await sql`CREATE INDEX users_idx_keycloak_id ON users (keycloak_id)`.execute(db)
    await sql`CREATE TABLE user_roles (user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE, created_at ${ts} DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (user_id, role_id))`.execute(db)
}

async function userIndexNames(db: Kysely<any>, dialect: 'postgres' | 'sqlite'): Promise<string[]> {
    const query = dialect === 'postgres'
        ? sql<{ name: string }>`SELECT indexname AS name FROM pg_indexes WHERE tablename = 'users'`
        : sql<{ name: string }>`SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'users'`
    return (await query.execute(db)).rows.map(row => row.name)
}

function registerUserRepositoryTests(label: string, factory: KyselyFactory) {
    test.group(`KyselyUserRepository [${label}]`, group => {
         
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
            const authUser: AuthenticatedUser = { subject: 'keycloak-uuid-1', roles: ['user'] }
            const result = await repo.findOrCreateUser(authUser)
            assert.isDefined(result.id)
            assert.isNumber(result.id)
            assert.equal(result.subject, 'keycloak-uuid-1')
        })

        test('findOrCreateUser() returns existing user for same subject', async ({ assert }) => {
            const repo = new KyselyUserRepository(db, dialect)
            await repo.initializeTables()
            const authUser: AuthenticatedUser = { subject: 'keycloak-uuid-2', roles: ['user'] }
            const first = await repo.findOrCreateUser(authUser)
            const second = await repo.findOrCreateUser(authUser)
            assert.equal(first.id, second.id)
        })

        test('findOrCreateUser() synchronizes roles (add + remove)', async ({ assert }) => {
            const repo = new KyselyUserRepository(db, dialect)
            await repo.initializeTables()
            const authUser: AuthenticatedUser = { subject: 'keycloak-uuid-3', roles: ['user', 'editor'] }
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
            await repo.findOrCreateUser({ subject: 'keycloak-uuid-4', roles: ['user', 'admin'] })
            const result = await repo.findOrCreateUser({ subject: 'keycloak-uuid-4', roles: [] })
            assert.deepEqual(result.roles, [])
        })

        test('getUserById() returns user with roles', async ({ assert }) => {
            const repo = new KyselyUserRepository(db, dialect)
            await repo.initializeTables()
            const created = await repo.findOrCreateUser({ subject: 'keycloak-uuid-5', roles: ['user', 'admin'] })
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

        test('getUserBySubject() returns user with roles', async ({ assert }) => {
            const repo = new KyselyUserRepository(db, dialect)
            await repo.initializeTables()
            await repo.findOrCreateUser({ subject: 'keycloak-uuid-6', roles: ['editor'] })
            const result = await repo.getUserBySubject('keycloak-uuid-6')
            assert.isDefined(result)
            assert.includeMembers(result!.roles, ['editor'])
        })

        test('getUserBySubject() returns undefined when not found', async ({ assert }) => {
            const repo = new KyselyUserRepository(db, dialect)
            await repo.initializeTables()
            assert.isUndefined(await repo.getUserBySubject('nonexistent'))
        })

        test('subject uniqueness constraint', async ({ assert }) => {
            const repo = new KyselyUserRepository(db, dialect)
            await repo.initializeTables()
            await db.insertInto('users').values({ subject: 'dup-id', created_at: new Date().toISOString(), updated_at: new Date().toISOString() }).execute()
            // Both SQLite ("UNIQUE constraint failed") and PG ("duplicate key") throw on duplicate
            await assert.rejects(
                () => db.insertInto('users').values({ subject: 'dup-id', created_at: new Date().toISOString(), updated_at: new Date().toISOString() }).execute(),
                /unique|duplicate/i
            )
        })

        test('initializeTables() migrates a 1.x users table without losing users or roles', async ({ assert }) => {
            await createV1UserTables(db, dialect)
            const now = new Date().toISOString()
            const { id: aliceId } = await db.insertInto('users').values({ keycloak_id: 'alice', created_at: now, updated_at: now }).returning('id').executeTakeFirstOrThrow()
            const { id: adminId } = await db.insertInto('roles').values({ name: 'admin' }).returning('id').executeTakeFirstOrThrow()
            await db.insertInto('user_roles').values({ user_id: aliceId, role_id: adminId }).execute()

            const repo = new KyselyUserRepository(db, dialect)
            await repo.initializeTables()
            await repo.initializeTables()

            const users = (await db.introspection.getTables()).find(t => t.name === 'users')
            assert.sameMembers(users!.columns.map(c => c.name), ['id', 'subject', 'created_at', 'updated_at'])
            const indexes = await userIndexNames(db, dialect)
            assert.include(indexes, 'users_idx_subject')
            assert.notInclude(indexes, 'users_idx_keycloak_id')

            const alice = await repo.getUserBySubject('alice')
            assert.equal(alice?.id, aliceId)
            assert.deepEqual(alice?.roles, ['admin'])
            assert.equal((await repo.findOrCreateUser({ subject: 'alice', roles: ['admin'] })).id, aliceId)
        })

        test('timestamps are set on creation', async ({ assert }) => {
            const repo = new KyselyUserRepository(db, dialect)
            await repo.initializeTables()
            const result = await repo.findOrCreateUser({ subject: 'keycloak-uuid-7', roles: ['user'] })
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
