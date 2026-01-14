import type { DatabaseAdapter } from '../database/database_adapter.js'
import type { AuthenticatedUser, UserRecord } from './types.js'
import type { Knex } from 'knex'
import { AuthConfig } from './auth_config.js'

/**
 * Service for managing users in the Digital Twin framework.
 *
 * This service handles the complete user lifecycle in a Digital Twin application
 * with Keycloak authentication via Apache APISIX. It manages a normalized database
 * schema with three tables:
 *
 * - `users`: Core user records linked to Keycloak IDs
 * - `roles`: Master list of available roles
 * - `user_roles`: Many-to-many relationship between users and roles
 *
 * Key features:
 * - Automatic user creation on first authentication
 * - Role synchronization with Keycloak
 * - Optimized queries with proper indexing
 * - Transaction-safe role updates
 *
 * @example
 * ```typescript
 * // Initialize in your Digital Twin engine
 * const userService = new UserService(databaseAdapter)
 * await userService.initializeTables()
 *
 * // Use in AssetsManager handlers
 * const authUser = ApisixAuthParser.parseAuthHeaders(req.headers)
 * const userRecord = await userService.findOrCreateUser(authUser!)
 *
 * // Link assets to users
 * await this.uploadAsset({
 *   description: 'My file',
 *   source: 'upload',
 *   owner_id: userRecord.id!.toString(),
 *   filename: 'document.pdf',
 *   file: buffer
 * })
 * ```
 */
export class UserService {
    private db: DatabaseAdapter
    private readonly usersTable = 'users'
    private readonly rolesTable = 'roles'
    private readonly userRolesTable = 'user_roles'

    constructor(db: DatabaseAdapter) {
        this.db = db
    }

    /**
     * Ensures all user-related tables exist in the database
     */
    async initializeTables(): Promise<void> {
        const knex = this.getKnex()

        // 1. Create roles table
        if (!(await knex.schema.hasTable(this.rolesTable))) {
            await knex.schema.createTable(this.rolesTable, table => {
                table.increments('id').primary()
                table.string('name', 100).notNullable().unique()
                table.timestamp('created_at').defaultTo(knex.fn.now())

                // Index pour les recherches par nom de rôle
                table.index('name', 'roles_idx_name')
            })
        }

        // 2. Create users table
        if (!(await knex.schema.hasTable(this.usersTable))) {
            await knex.schema.createTable(this.usersTable, table => {
                table.increments('id').primary()
                table.string('keycloak_id', 255).notNullable().unique()
                table.timestamp('created_at').defaultTo(knex.fn.now())
                table.timestamp('updated_at').defaultTo(knex.fn.now())

                // Index principal pour les lookups par keycloak_id
                table.index('keycloak_id', 'users_idx_keycloak_id')
                table.index('created_at', 'users_idx_created_at')
            })
        }

        // 3. Create user_roles junction table
        if (!(await knex.schema.hasTable(this.userRolesTable))) {
            await knex.schema.createTable(this.userRolesTable, table => {
                table.integer('user_id').unsigned().notNullable()
                table.integer('role_id').unsigned().notNullable()
                table.timestamp('created_at').defaultTo(knex.fn.now())

                // Clé primaire composite
                table.primary(['user_id', 'role_id'])

                // Clés étrangères
                table.foreign('user_id').references('id').inTable(this.usersTable).onDelete('CASCADE')
                table.foreign('role_id').references('id').inTable(this.rolesTable).onDelete('CASCADE')

                // Index pour les requêtes inverses (quels utilisateurs ont ce rôle)
                table.index('role_id', 'user_roles_idx_role_id')
                table.index('user_id', 'user_roles_idx_user_id')
            })
        }
    }

    /**
     * Finds or creates a user and synchronizes their roles.
     *
     * When authentication is disabled, returns a mock user record
     * without touching the database.
     */
    async findOrCreateUser(authUser: AuthenticatedUser): Promise<UserRecord> {
        // If authentication is disabled, return a mock user record
        if (AuthConfig.isAuthDisabled()) {
            return {
                id: 1, // Use a consistent ID for anonymous user
                keycloak_id: authUser.id,
                roles: authUser.roles,
                created_at: new Date(),
                updated_at: new Date()
            }
        }

        // 1. Find or create user
        let userRecord = await this.findUserByKeycloakId(authUser.id)

        if (!userRecord) {
            userRecord = await this.createUser(authUser)
        }

        if (!userRecord.id) {
            throw new Error('User record does not have an ID after creation/retrieval')
        }

        // 2. Synchronize roles
        await this.syncUserRoles(userRecord.id, authUser.roles)

        // 3. Return user with current roles
        return (await this.getUserWithRoles(userRecord.id)) || userRecord
    }

    /**
     * Gets a user by their database ID
     */
    async getUserById(id: number): Promise<UserRecord | undefined> {
        return await this.getUserWithRoles(id)
    }

    /**
     * Gets a user by their Keycloak ID with roles
     */
    async getUserByKeycloakId(keycloakId: string): Promise<UserRecord | undefined> {
        const knex = this.getKnex()

        const userRow = (await knex(this.usersTable).where('keycloak_id', keycloakId).first()) as
            | { id: number }
            | undefined

        if (!userRow) return undefined

        return await this.getUserWithRoles(userRow.id)
    }

    /**
     * Gets the underlying Knex instance from the database adapter
     */
    private getKnex(): Knex {
        if ('getKnex' in this.db && typeof this.db.getKnex === 'function') {
            return (this.db as any).getKnex()
        }
        throw new Error('Cannot access Knex instance from DatabaseAdapter')
    }

    /**
     * Finds a user by their Keycloak ID
     */
    private async findUserByKeycloakId(keycloakId: string): Promise<UserRecord | undefined> {
        const knex = this.getKnex()

        const row = await knex(this.usersTable).where('keycloak_id', keycloakId).first()

        if (!row) return undefined

        return {
            id: row.id,
            keycloak_id: row.keycloak_id,
            roles: [], // Will be populated by getUserWithRoles
            created_at: new Date(row.created_at),
            updated_at: new Date(row.updated_at)
        }
    }

    /**
     * Creates a new user record
     */
    private async createUser(authUser: AuthenticatedUser): Promise<UserRecord> {
        const knex = this.getKnex()
        const now = new Date()

        const userData = {
            keycloak_id: authUser.id,
            created_at: now,
            updated_at: now
        }

        const insertResult = await knex(this.usersTable).insert(userData).returning('id')
        const insertedId = insertResult[0]
        const id = typeof insertedId === 'object' ? (insertedId as { id: number }).id : insertedId

        return {
            id,
            keycloak_id: authUser.id,
            roles: [],
            created_at: now,
            updated_at: now
        }
    }

    /**
     * Synchronizes user roles with what's provided by Keycloak
     */
    private async syncUserRoles(userId: number, newRoles: string[]): Promise<void> {
        const knex = this.getKnex()

        // Transaction pour assurer la cohérence
        await knex.transaction(async trx => {
            // 1. Ensure all roles exist in roles table
            for (const roleName of newRoles) {
                await trx(this.rolesTable).insert({ name: roleName }).onConflict('name').ignore() // Si le rôle existe déjà, on l'ignore
            }

            // 2. Get role IDs
            const roleRows = (await trx(this.rolesTable).select('id', 'name').whereIn('name', newRoles)) as {
                id: number
                name: string
            }[]

            const roleIds = roleRows.map(r => r.id)

            // 3. Remove old role associations
            await trx(this.userRolesTable).where('user_id', userId).delete()

            // 4. Add new role associations
            if (roleIds.length > 0) {
                const userRoleData = roleIds.map((roleId: number) => ({
                    user_id: userId,
                    role_id: roleId
                }))

                await trx(this.userRolesTable).insert(userRoleData)
            }

            // 5. Update user's updated_at timestamp
            await trx(this.usersTable).where('id', userId).update({ updated_at: new Date() })
        })
    }

    /**
     * Gets a user with their roles populated
     */
    private async getUserWithRoles(userId: number): Promise<UserRecord | undefined> {
        const knex = this.getKnex()

        // Join query to get user + roles
        const result = (await knex(this.usersTable)
            .leftJoin(this.userRolesTable, `${this.usersTable}.id`, `${this.userRolesTable}.user_id`)
            .leftJoin(this.rolesTable, `${this.userRolesTable}.role_id`, `${this.rolesTable}.id`)
            .select(
                `${this.usersTable}.id`,
                `${this.usersTable}.keycloak_id`,
                `${this.usersTable}.created_at`,
                `${this.usersTable}.updated_at`,
                `${this.rolesTable}.name as role_name`
            )
            .where(`${this.usersTable}.id`, userId)) as {
            id: number
            keycloak_id: string
            created_at: string
            updated_at: string
            role_name: string | null
        }[]

        if (result.length === 0) return undefined

        const userRow = result[0]
        const roles = result
            .filter((row): row is typeof row & { role_name: string } => row.role_name !== null)
            .map(row => row.role_name)

        return {
            id: userRow.id,
            keycloak_id: userRow.keycloak_id,
            roles: roles,
            created_at: new Date(userRow.created_at),
            updated_at: new Date(userRow.updated_at)
        }
    }
}
