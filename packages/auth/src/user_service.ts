import type { AuthenticatedUser, UserRecord, UserRepository } from '@digitaltwin/shared'
import { AuthConfig } from './auth_config.js'

/**
 * Service for managing users in the Digital Twin framework.
 *
 * Delegates all database operations to a UserRepository implementation,
 * removing the previous direct Knex dependency.
 *
 * When authentication is disabled, returns mock user records without
 * touching the database.
 */
export class UserService {
    readonly #userRepository: UserRepository

    constructor(userRepository: UserRepository) {
        this.#userRepository = userRepository
    }

    /** Ensures all user-related tables exist in the database */
    async initializeTables(): Promise<void> {
        await this.#userRepository.initializeTables()
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
                id: 1,
                keycloak_id: authUser.id,
                roles: authUser.roles,
                created_at: new Date(),
                updated_at: new Date()
            }
        }

        return this.#userRepository.findOrCreateUser(authUser)
    }

    /** Gets a user by their database ID */
    async getUserById(id: number): Promise<UserRecord | undefined> {
        return await this.#userRepository.getUserById(id)
    }

    /** Gets a user by their Keycloak ID with roles */
    async getUserByKeycloakId(keycloakId: string): Promise<UserRecord | undefined> {
        return await this.#userRepository.getUserByKeycloakId(keycloakId)
    }
}
