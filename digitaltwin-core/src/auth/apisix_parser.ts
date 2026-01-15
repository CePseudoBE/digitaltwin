import type { AuthenticatedUser } from './types.js'
import type { AuthProvider, AuthRequest } from './auth_provider.js'
import { AuthProviderFactory } from './auth_provider_factory.js'

/**
 * Parses authentication information from Apache APISIX headers set after Keycloak authentication.
 *
 * This class provides a static API for backward compatibility while internally using
 * the AuthProvider system. It automatically handles:
 * - Gateway mode (x-user-id, x-user-roles headers)
 * - JWT mode (Authorization: Bearer token)
 * - No-auth mode (DIGITALTWIN_DISABLE_AUTH=true)
 *
 * For new code, consider using AuthProviderFactory directly:
 * ```typescript
 * const authProvider = AuthProviderFactory.fromEnv()
 * const user = authProvider.parseRequest(req)
 * ```
 *
 * @example
 * ```typescript
 * // In an AssetsManager handler
 * if (!ApisixAuthParser.hasValidAuth(req.headers)) {
 *   return { status: 401, content: 'Authentication required' }
 * }
 *
 * const authUser = ApisixAuthParser.parseAuthHeaders(req.headers)
 * const userRecord = await this.userService.findOrCreateUser(authUser!)
 * ```
 */
export class ApisixAuthParser {
    private static _provider: AuthProvider | null = null

    /**
     * Get the authentication provider instance.
     * Creates it on first use based on environment configuration.
     */
    private static getProvider(): AuthProvider {
        if (!this._provider) {
            this._provider = AuthProviderFactory.fromEnv()
        }
        return this._provider
    }

    /**
     * Reset the provider instance (useful for testing).
     * @internal
     */
    static _resetProvider(): void {
        this._provider = null
    }

    /**
     * Set a custom provider (useful for testing).
     * @internal
     */
    static _setProvider(provider: AuthProvider): void {
        this._provider = provider
    }

    /**
     * Create a request-like object from headers for the AuthProvider.
     */
    private static toAuthRequest(headers: Record<string, string>): AuthRequest {
        return { headers }
    }

    /**
     * Extracts user information from authentication headers.
     *
     * Parses the authentication headers (gateway mode) or JWT token (jwt mode):
     * - Gateway: `x-user-id` and `x-user-roles` headers
     * - JWT: `Authorization: Bearer <token>` header
     *
     * When authentication is disabled (DIGITALTWIN_DISABLE_AUTH=true),
     * returns a default anonymous user.
     *
     * @param headers - HTTP request headers
     * @returns Parsed user authentication data, or null if not authenticated
     *
     * @example
     * ```typescript
     * const headers = {
     *   'x-user-id': '6e06a527-a89d-4390-95cd-10ae63cfc939',
     *   'x-user-roles': 'default-roles-master,offline_access'
     * }
     *
     * const authUser = ApisixAuthParser.parseAuthHeaders(headers)
     * // Returns: { id: '6e06a527...', roles: ['default-roles-master', 'offline_access'] }
     * ```
     */
    static parseAuthHeaders(headers: Record<string, string>): AuthenticatedUser | null {
        return this.getProvider().parseRequest(this.toAuthRequest(headers))
    }

    /**
     * Checks if a request has valid authentication.
     *
     * Performs a quick validation to determine if the request contains
     * valid authentication credentials (gateway headers or JWT token).
     *
     * When authentication is disabled, this always returns true.
     *
     * @param headers - HTTP request headers
     * @returns true if authentication is valid or disabled, false otherwise
     *
     * @example
     * ```typescript
     * if (!ApisixAuthParser.hasValidAuth(req.headers)) {
     *   return { status: 401, content: 'Authentication required' }
     * }
     * ```
     */
    static hasValidAuth(headers: Record<string, string>): boolean {
        return this.getProvider().hasValidAuth(this.toAuthRequest(headers))
    }

    /**
     * Extracts just the user ID from headers.
     *
     * Convenience method for cases where you only need the user ID.
     *
     * @param headers - HTTP request headers
     * @returns User ID, or null if not authenticated
     *
     * @example
     * ```typescript
     * const userId = ApisixAuthParser.getUserId(req.headers)
     * if (userId) {
     *   console.log(`Request from user: ${userId}`)
     * }
     * ```
     */
    static getUserId(headers: Record<string, string>): string | null {
        return this.getProvider().getUserId(this.toAuthRequest(headers))
    }

    /**
     * Extracts just the user roles from headers.
     *
     * @param headers - HTTP request headers
     * @returns Array of role names, empty array if not authenticated
     *
     * @example
     * ```typescript
     * const roles = ApisixAuthParser.getUserRoles(req.headers)
     * if (roles.includes('admin')) {
     *   console.log('User has admin privileges')
     * }
     * ```
     */
    static getUserRoles(headers: Record<string, string>): string[] {
        return this.getProvider().getUserRoles(this.toAuthRequest(headers))
    }

    /**
     * Checks if a user has the admin role.
     *
     * @param headers - HTTP request headers
     * @returns true if user has admin role, false otherwise
     *
     * @example
     * ```typescript
     * if (ApisixAuthParser.isAdmin(req.headers)) {
     *   // Admin-only logic
     * }
     * ```
     */
    static isAdmin(headers: Record<string, string>): boolean {
        return this.getProvider().isAdmin(this.toAuthRequest(headers))
    }
}
