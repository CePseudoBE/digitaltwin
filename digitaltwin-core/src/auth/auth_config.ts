import { Env } from '../env/env.js'

/**
 * Authentication configuration for Digital Twin framework.
 *
 * Controls whether authentication is required for components that support it.
 * When authentication is disabled, all requests are treated as authenticated
 * with a default anonymous user.
 *
 * Environment variables:
 * - DIGITALTWIN_DISABLE_AUTH: Set to "true" or "1" to disable authentication (default: false)
 * - DIGITALTWIN_ANONYMOUS_USER_ID: User ID to use when auth is disabled (default: "anonymous")
 * - DIGITALTWIN_ADMIN_ROLE_NAME: Name of the admin role in Keycloak (default: "admin")
 *
 * @example
 * ```bash
 * # Disable authentication for development
 * export DIGITALTWIN_DISABLE_AUTH=true
 * export DIGITALTWIN_ANONYMOUS_USER_ID=dev-user-123
 *
 * # Configure admin role name
 * export DIGITALTWIN_ADMIN_ROLE_NAME=administrator
 *
 * # Enable authentication (default)
 * export DIGITALTWIN_DISABLE_AUTH=false
 * ```
 *
 * @example
 * ```typescript
 * import { AuthConfig } from './auth_config.js'
 *
 * if (AuthConfig.isAuthDisabled()) {
 *   console.log('Authentication is disabled')
 *   const anonymousUser = AuthConfig.getAnonymousUser()
 *   console.log(`Using anonymous user: ${anonymousUser.id}`)
 * }
 *
 * const adminRole = AuthConfig.getAdminRoleName()
 * console.log(`Admin role is: ${adminRole}`)
 * ```
 */
export class AuthConfig {
    private static _config: {
        DIGITALTWIN_DISABLE_AUTH: boolean
        DIGITALTWIN_ANONYMOUS_USER_ID: string
        DIGITALTWIN_ADMIN_ROLE_NAME: string
    } | null = null

    /**
     * Loads and validates authentication configuration from environment variables.
     * This is called automatically the first time any method is used.
     */
    private static loadConfig() {
        if (this._config !== null) return

        const config = Env.validate({
            DIGITALTWIN_DISABLE_AUTH: Env.schema.boolean({
                optional: true,
                default: false
            }),
            DIGITALTWIN_ANONYMOUS_USER_ID: Env.schema.string({
                optional: true
            }),
            DIGITALTWIN_ADMIN_ROLE_NAME: Env.schema.string({
                optional: true
            })
        }) as {
            DIGITALTWIN_DISABLE_AUTH: boolean
            DIGITALTWIN_ANONYMOUS_USER_ID?: string
            DIGITALTWIN_ADMIN_ROLE_NAME?: string
        }

        // Set default anonymous user ID if not provided
        if (!config.DIGITALTWIN_ANONYMOUS_USER_ID) {
            config.DIGITALTWIN_ANONYMOUS_USER_ID = 'anonymous'
        }

        // Set default admin role name if not provided
        if (!config.DIGITALTWIN_ADMIN_ROLE_NAME) {
            config.DIGITALTWIN_ADMIN_ROLE_NAME = 'admin'
        }

        this._config = config as {
            DIGITALTWIN_DISABLE_AUTH: boolean
            DIGITALTWIN_ANONYMOUS_USER_ID: string
            DIGITALTWIN_ADMIN_ROLE_NAME: string
        }
    }

    /**
     * Gets the loaded configuration, ensuring it's initialized.
     * @private
     */
    private static getConfig() {
        this.loadConfig()
        if (this._config === null) {
            throw new Error('Failed to load authentication configuration')
        }
        return this._config
    }

    /**
     * Checks if authentication is disabled via environment variables.
     *
     * @returns true if DIGITALTWIN_DISABLE_AUTH is set to "true" or "1", false otherwise
     *
     * @example
     * ```typescript
     * if (AuthConfig.isAuthDisabled()) {
     *   console.log('Running in no-auth mode')
     * }
     * ```
     */
    static isAuthDisabled(): boolean {
        return this.getConfig().DIGITALTWIN_DISABLE_AUTH
    }

    /**
     * Checks if authentication is enabled (opposite of isAuthDisabled).
     *
     * @returns true if authentication should be enforced, false otherwise
     */
    static isAuthEnabled(): boolean {
        return !this.isAuthDisabled()
    }

    /**
     * Gets the anonymous user ID to use when authentication is disabled.
     *
     * @returns The user ID configured for anonymous access
     *
     * @example
     * ```typescript
     * const userId = AuthConfig.getAnonymousUserId()
     * console.log(`Anonymous user ID: ${userId}`) // "anonymous" by default
     * ```
     */
    static getAnonymousUserId(): string {
        return this.getConfig().DIGITALTWIN_ANONYMOUS_USER_ID
    }

    /**
     * Gets a fake authenticated user object for anonymous access.
     *
     * @returns An AuthenticatedUser object representing the anonymous user
     *
     * @example
     * ```typescript
     * import type { AuthenticatedUser } from './types.js'
     *
     * const anonymousUser: AuthenticatedUser = AuthConfig.getAnonymousUser()
     * console.log(anonymousUser) // { id: "anonymous", roles: ["anonymous"] }
     * ```
     */
    static getAnonymousUser() {
        return {
            id: this.getAnonymousUserId(),
            roles: ['anonymous']
        }
    }

    /**
     * Gets the name of the admin role configured for the system.
     *
     * This role name is used to determine if a user has full administrative
     * access to all resources, including private assets owned by other users.
     *
     * @returns The admin role name (default: "admin")
     *
     * @example
     * ```typescript
     * const adminRole = AuthConfig.getAdminRoleName()
     * console.log(`Admin role: ${adminRole}`) // "admin" by default
     *
     * // Check if user has admin role
     * const userRoles = ['user', 'admin', 'moderator']
     * const isAdmin = userRoles.includes(adminRole)
     * ```
     */
    static getAdminRoleName(): string {
        return this.getConfig().DIGITALTWIN_ADMIN_ROLE_NAME
    }

    /**
     * Resets the cached configuration (useful for testing).
     *
     * @private
     */
    static _resetConfig() {
        this._config = null
    }
}
