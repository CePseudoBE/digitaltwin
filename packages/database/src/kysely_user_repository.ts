import type { ColumnDefinitionBuilder, Kysely } from 'kysely'
import { sql } from 'kysely'
import type { AuthenticatedUser, UserRecord, UserRepository } from '@cepseudo/shared'

/**
 * Kysely-based implementation of UserRepository.
 *
 * Manages a normalized user schema with three tables:
 * - `users`: Core user records keyed by the identity provider subject
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
        const usersTable = tables.find(t => t.name === 'users')
        const idType: 'serial' | 'integer' = this.#dialect === 'postgres' ? 'serial' : 'integer'
        const tsType: 'timestamptz' | 'timestamp' = this.#dialect === 'postgres' ? 'timestamptz' : 'timestamp'
        const idModifier = this.#dialect === 'postgres'
            ? (col: ColumnDefinitionBuilder) => col.primaryKey()
            : (col: ColumnDefinitionBuilder) => col.primaryKey().autoIncrement()

        // 1. Create roles table
        if (!tableNames.has('roles')) {
            await this.#db.schema
                .createTable('roles')
                .addColumn('id', idType, idModifier)
                .addColumn('name', 'varchar(100)', col => col.notNull().unique())
                .addColumn('created_at', tsType, col => col.defaultTo(sql`CURRENT_TIMESTAMP`))
                .execute()

            await this.#db.schema.createIndex('roles_idx_name').on('roles').column('name').execute()
        }

        // 2. Create users table, or migrate a 1.x one
        if (!usersTable) {
            await this.#db.schema
                .createTable('users')
                .addColumn('id', idType, idModifier)
                .addColumn('subject', 'varchar(255)', col => col.notNull().unique())
                .addColumn('created_at', tsType, col => col.defaultTo(sql`CURRENT_TIMESTAMP`))
                .addColumn('updated_at', tsType, col => col.defaultTo(sql`CURRENT_TIMESTAMP`))
                .execute()

            await this.#db.schema.createIndex('users_idx_subject').on('users').column('subject').execute()
            await this.#db.schema.createIndex('users_idx_created_at').on('users').column('created_at').execute()
        } else if (usersTable.columns.some(c => c.name === 'keycloak_id')) {
            await this.#renameKeycloakIdToSubject()
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
                .addColumn('created_at', tsType, col => col.defaultTo(sql`CURRENT_TIMESTAMP`))
                .addPrimaryKeyConstraint('user_roles_pk', ['user_id', 'role_id'])
                .execute()

            await this.#db.schema.createIndex('user_roles_idx_role_id').on('user_roles').column('role_id').execute()
            await this.#db.schema.createIndex('user_roles_idx_user_id').on('user_roles').column('user_id').execute()
        }
    }

    async findOrCreateUser(authUser: AuthenticatedUser): Promise<UserRecord> {
        const now = new Date().toISOString()
        const existing = await this.#db
            .selectFrom('users')
            .select('id')
            .where('subject', '=', authUser.subject)
            .executeTakeFirst()
        const { id } = existing ?? await this.#db
            .insertInto('users')
            .values({ subject: authUser.subject, created_at: now, updated_at: now })
            .returning('id')
            .executeTakeFirstOrThrow()

        await this.#syncUserRoles(id as number, authUser.roles)

        const user = await this.#getUserWithRoles(id as number)
        if (!user) throw new Error(`User ${authUser.subject} was deleted while its roles were synchronized`)
        return user
    }

    async getUserById(id: number): Promise<UserRecord | undefined> {
        return this.#getUserWithRoles(id)
    }

    async getUserBySubject(subject: string): Promise<UserRecord | undefined> {
        const userRow = await this.#db
            .selectFrom('users')
            .select('id')
            .where('subject', '=', subject)
            .executeTakeFirst()

        if (!userRow) return undefined
        return this.#getUserWithRoles(userRow.id as number)
    }

    // 1.x named the identity column after Keycloak; the rename keeps every row and its id
    async #renameKeycloakIdToSubject(): Promise<void> {
        await this.#db.transaction().execute(async trx => {
            await trx.schema.alterTable('users').renameColumn('keycloak_id', 'subject').execute()
            await trx.schema.dropIndex('users_idx_keycloak_id').ifExists().execute()
            await trx.schema.createIndex('users_idx_subject').on('users').column('subject').execute()
        })
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
                'users.subject',
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
            subject: userRow.subject as string,
            roles,
            created_at: new Date(userRow.created_at as string),
            updated_at: new Date(userRow.updated_at as string)
        }
    }
}
