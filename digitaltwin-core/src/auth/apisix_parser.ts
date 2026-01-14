import type { AuthenticatedUser } from './types.js'
import { AuthConfig } from './auth_config.js'

/**
 * Parses authentication information from Apache APISIX headers set after Keycloak authentication.
 *
 * This class handles the parsing of authentication headers forwarded by Apache APISIX
 * after successful Keycloak authentication. APISIX acts as a gateway that:
 * 1. Validates JWT tokens with Keycloak
 * 2. Extracts user information from the token
 * 3. Forwards user data as HTTP headers to downstream services
 *
 * Authentication can be disabled via environment variables for development/testing:
 * - Set DIGITALTWIN_DISABLE_AUTH=true to bypass authentication checks
 * - Set DIGITALTWIN_ANONYMOUS_USER_ID=custom-id to use a custom anonymous user ID
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
    /**
     * Extracts user information from APISIX headers.
     *
     * Parses the authentication headers forwarded by APISIX:
     * - `x-user-id`: Keycloak user UUID (required)
     * - `x-user-roles`: Comma-separated list of user roles (optional)
     *
     * When authentication is disabled (DIGITALTWIN_DISABLE_AUTH=true),
     * returns a default anonymous user instead of requiring headers.
     *
     * @param headers - HTTP request headers from APISIX
     * @returns Parsed user authentication data, or null if x-user-id is missing and auth is enabled
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
     *
     * // With DIGITALTWIN_DISABLE_AUTH=true
     * const authUser = ApisixAuthParser.parseAuthHeaders({})
     * // Returns: { id: 'anonymous', roles: ['anonymous'] }
     * ```
     */
    static parseAuthHeaders(headers: Record<string, string>): AuthenticatedUser | null {
        // If authentication is disabled, return anonymous user
        if (AuthConfig.isAuthDisabled()) {
            return AuthConfig.getAnonymousUser()
        }

        const userId = headers['x-user-id']
        if (!userId) {
            return null
        }

        // Parse roles from comma-separated string
        const rolesString = headers['x-user-roles'] || ''
        const roles = rolesString ? rolesString.split(',').map(role => role.trim()) : []

        return {
            id: userId,
            roles: roles
        }
    }

    /**
     * Checks if a request has valid authentication headers.
     *
     * Performs a quick validation to determine if the request contains
     * the minimum required authentication information (x-user-id header).
     * Use this for early authentication checks before parsing.
     *
     * When authentication is disabled (DIGITALTWIN_DISABLE_AUTH=true),
     * this always returns true to allow all requests through.
     *
     * @param headers - HTTP request headers
     * @returns true if x-user-id header is present or auth is disabled, false otherwise
     *
     * @example
     * ```typescript
     * // Early authentication check in handler
     * if (!ApisixAuthParser.hasValidAuth(req.headers)) {
     *   return { status: 401, content: 'Authentication required' }
     * }
     *
     * // Now safe to proceed with parsing
     * const authUser = ApisixAuthParser.parseAuthHeaders(req.headers)
     * ```
     */
    static hasValidAuth(headers: Record<string, string>): boolean {
        // If authentication is disabled, all requests are valid
        if (AuthConfig.isAuthDisabled()) {
            return true
        }

        return !!headers['x-user-id']
    }

    /**
     * Extracts just the user ID from headers.
     *
     * Convenience method for cases where you only need the user ID
     * without parsing the full authentication context.
     *
     * When authentication is disabled, returns the configured anonymous user ID.
     *
     * @param headers - HTTP request headers
     * @returns Keycloak user ID, anonymous user ID if auth disabled, or null if not present
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
        // If authentication is disabled, return anonymous user ID
        if (AuthConfig.isAuthDisabled()) {
            return AuthConfig.getAnonymousUserId()
        }

        return headers['x-user-id'] || null
    }

    /**
     * Extracts just the user roles from headers.
     *
     * Convenience method for cases where you only need the user roles
     * without parsing the full authentication context.
     *
     * When authentication is disabled, returns the anonymous user roles.
     *
     * @param headers - HTTP request headers
     * @returns Array of role names, anonymous roles if auth disabled, empty array if no roles header present
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
        // If authentication is disabled, return anonymous user roles
        if (AuthConfig.isAuthDisabled()) {
            return AuthConfig.getAnonymousUser().roles
        }

        const rolesString = headers['x-user-roles'] || ''
        return rolesString ? rolesString.split(',').map(role => role.trim()) : []
    }

    /**
     * Checks if a user has the admin role.
     *
     * Determines if the authenticated user has administrative privileges by checking
     * if their roles include the configured admin role name (default: "admin").
     *
     * The admin role name can be configured via DIGITALTWIN_ADMIN_ROLE_NAME environment variable.
     *
     * @param headers - HTTP request headers
     * @returns true if user has admin role, false otherwise
     *
     * @example
     * ```typescript
     * if (ApisixAuthParser.isAdmin(req.headers)) {
     *   // User has full administrative access
     *   // Can view all assets including private assets owned by others
     *   console.log('Admin user detected')
     * }
     *
     * // With custom admin role name (DIGITALTWIN_ADMIN_ROLE_NAME=administrator)
     * const isAdmin = ApisixAuthParser.isAdmin(req.headers)
     * ```
     */
    static isAdmin(headers: Record<string, string>): boolean {
        const roles = this.getUserRoles(headers)
        const adminRoleName = AuthConfig.getAdminRoleName()
        return roles.includes(adminRoleName)
    }
}
