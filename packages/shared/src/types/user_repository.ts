import type { AuthenticatedUser, UserRecord } from './auth.js'

/**
 * Repository interface for user persistence operations.
 *
 * Abstracts database access for user management, allowing
 * different implementations (Knex, in-memory for testing, etc.)
 * without coupling the auth layer to a specific database adapter.
 *
 * @example
 * ```typescript
 * // Production: KnexUserRepository from @digitaltwin/database
 * const repo = new KnexUserRepository(knex)
 *
 * // Testing: in-memory implementation
 * const repo: UserRepository = {
 *   initializeTables: async () => {},
 *   findOrCreateUser: async (user) => ({ ...user, id: 1, created_at: new Date(), updated_at: new Date() }),
 *   getUserById: async () => undefined,
 *   getUserByKeycloakId: async () => undefined
 * }
 * ```
 */
export interface UserRepository {
    /** Ensure all user-related tables exist in the database */
    initializeTables(): Promise<void>

    /** Find or create a user and synchronize their roles */
    findOrCreateUser(authUser: AuthenticatedUser): Promise<UserRecord>

    /** Get a user by their database ID */
    getUserById(id: number): Promise<UserRecord | undefined>

    /** Get a user by their Keycloak ID with roles */
    getUserByKeycloakId(keycloakId: string): Promise<UserRecord | undefined>
}
