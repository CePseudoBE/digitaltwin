import type { AuthenticatedUser, UserRecord, UserRepository } from '@cepseudo/shared'

/**
 * Service for managing users in the Digital Twin framework.
 *
 * Delegates all database operations to a UserRepository implementation,
 * removing the previous direct Knex dependency.
 *
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
     */
    async findOrCreateUser(authUser: AuthenticatedUser): Promise<UserRecord> {
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
