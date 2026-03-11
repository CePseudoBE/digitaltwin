import { Kysely, sql } from 'kysely'
import type { AuthenticatedUser, UserRecord, UserRepository } from '@digitaltwin/shared'

/**
 * Kysely-based implementation of UserRepository.
 *
 * Manages a normalized user schema with three tables:
 * - `users`: Core user records linked to Keycloak IDs
 * - `roles`: Master list of available roles
 * - `user_roles`: Many-to-many relationship between users and roles
 */
export class KyselyUserRepository implements UserRepository {
    readonly #db: Kysely<any>
    readonly #dialect: 'postgres' | 'sqlite'

    constructor(db: Kysely<any>, dialect: 'postgres' | 'sqlite' = 'sqlite') {
        this.#db = db
        this.#dialect = dialect
    }

    async initializeTables(): Promise<void> {
        const tables = await this.#db.introspection.getTables()
        const tableNames = new Set(tables.map(t => t.name))
        const idCol = this.#dialect === 'postgres' ? 'serial' : 'integer'
        const withAutoInc = this.#dialect === 'postgres'
            ? (col: any) => col.primaryKey()
            : (col: any) => col.primaryKey().autoIncrement()

        // 1. Create roles table
        if (!tableNames.has('roles')) {
            await this.#db.schema
                .createTable('roles')
                .addColumn('id', idCol, withAutoInc)
                .addColumn('name', 'varchar(100)', col => col.notNull().unique())
                .addColumn('created_at', 'timestamp', col => col.defaultTo(sql`CURRENT_TIMESTAMP`))
                .execute()

            await this.#db.schema.createIndex('roles_idx_name').on('roles').column('name').execute()
        }

        // 2. Create users table
        if (!tableNames.has('users')) {
            await this.#db.schema
                .createTable('users')
                .addColumn('id', idCol, withAutoInc)
                .addColumn('keycloak_id', 'varchar(255)', col => col.notNull().unique())
                .addColumn('created_at', 'timestamp', col => col.defaultTo(sql`CURRENT_TIMESTAMP`))
                .addColumn('updated_at', 'timestamp', col => col.defaultTo(sql`CURRENT_TIMESTAMP`))
                .execute()

            await this.#db.schema.createIndex('users_idx_keycloak_id').on('users').column('keycloak_id').execute()
            await this.#db.schema.createIndex('users_idx_created_at').on('users').column('created_at').execute()
        }

        // 3. Create user_roles junction table
        if (!tableNames.has('user_roles')) {
            await this.#db.schema
                .createTable('user_roles')
                .addColumn('user_id', 'integer', col =>
                    col.notNull().references('users.id').onDelete('cascade')
                )
                .addColumn('role_id', 'integer', col =>
                    col.notNull().references('roles.id').onDelete('cascade')
                )
                .addColumn('created_at', 'timestamp', col => col.defaultTo(sql`CURRENT_TIMESTAMP`))
                .addPrimaryKeyConstraint('user_roles_pk', ['user_id', 'role_id'])
                .execute()

            await this.#db.schema.createIndex('user_roles_idx_role_id').on('user_roles').column('role_id').execute()
            await this.#db.schema.createIndex('user_roles_idx_user_id').on('user_roles').column('user_id').execute()
        }
    }

    async findOrCreateUser(authUser: AuthenticatedUser): Promise<UserRecord> {
        // 1. Find or create user
        let userRow = await this.#db
            .selectFrom('users')
            .selectAll()
            .where('keycloak_id', '=', authUser.id)
            .executeTakeFirst()

        if (!userRow) {
            const now = new Date()
            const nowStr = now.toISOString()
            const insertResult = await this.#db
                .insertInto('users')
                .values({ keycloak_id: authUser.id, created_at: nowStr, updated_at: nowStr })
                .returning('id')
                .executeTakeFirstOrThrow()

            userRow = {
                id: (insertResult as any).id,
                keycloak_id: authUser.id,
                created_at: nowStr,
                updated_at: nowStr
            }
        }

        const userId = userRow.id as number
        if (!userId) throw new Error('User record does not have an ID after creation/retrieval')

        // 2. Synchronize roles
        await this.#syncUserRoles(userId, authUser.roles)

        // 3. Return user with current roles
        return (await this.#getUserWithRoles(userId)) || {
            id: userId,
            keycloak_id: authUser.id,
            roles: authUser.roles,
            created_at: new Date(userRow.created_at as string),
            updated_at: new Date(userRow.updated_at as string)
        }
    }

    async getUserById(id: number): Promise<UserRecord | undefined> {
        return this.#getUserWithRoles(id)
    }

    async getUserByKeycloakId(keycloakId: string): Promise<UserRecord | undefined> {
        const userRow = await this.#db
            .selectFrom('users')
            .select('id')
            .where('keycloak_id', '=', keycloakId)
            .executeTakeFirst()

        if (!userRow) return undefined
        return this.#getUserWithRoles(userRow.id as number)
    }

    async #syncUserRoles(userId: number, newRoles: string[]): Promise<void> {
        await this.#db.transaction().execute(async (trx) => {
            // 1. Ensure all roles exist
            for (const roleName of newRoles) {
                // Use INSERT OR IGNORE for SQLite, ON CONFLICT for both
                await trx
                    .insertInto('roles')
                    .values({ name: roleName })
                    .onConflict(oc => oc.column('name').doNothing())
                    .execute()
            }

            // 2. Get role IDs
            let roleIds: number[] = []
            if (newRoles.length > 0) {
                const roleRows = await trx
                    .selectFrom('roles')
                    .select(['id', 'name'])
                    .where('name', 'in', newRoles)
                    .execute()
                roleIds = roleRows.map(r => r.id as number)
            }

            // 3. Remove old role associations
            await trx.deleteFrom('user_roles').where('user_id', '=', userId).execute()

            // 4. Add new role associations
            if (roleIds.length > 0) {
                await trx
                    .insertInto('user_roles')
                    .values(roleIds.map(roleId => ({ user_id: userId, role_id: roleId })))
                    .execute()
            }

            // 5. Update user's updated_at timestamp
            await trx.updateTable('users').set({ updated_at: new Date().toISOString() }).where('id', '=', userId).execute()
        })
    }

    async #getUserWithRoles(userId: number): Promise<UserRecord | undefined> {
        const rows = await this.#db
            .selectFrom('users')
            .leftJoin('user_roles', 'users.id', 'user_roles.user_id')
            .leftJoin('roles', 'user_roles.role_id', 'roles.id')
            .select([
                'users.id',
                'users.keycloak_id',
                'users.created_at',
                'users.updated_at',
                'roles.name as role_name'
            ])
            .where('users.id', '=', userId)
            .execute()

        if (rows.length === 0) return undefined

        const userRow = rows[0]
        const roles = rows
            .filter(row => row.role_name !== null)
            .map(row => row.role_name as string)

        return {
            id: userRow.id as number,
            keycloak_id: userRow.keycloak_id as string,
            roles,
            created_at: new Date(userRow.created_at as string),
            updated_at: new Date(userRow.updated_at as string)
        }
    }
}
