/**
 * @fileoverview Gateway authentication provider for API Gateway authentication.
 *
 * This provider parses authentication information from HTTP headers set by an API gateway
 * (such as Apache APISIX or KrakenD) after validating JWT tokens with an identity provider.
 *
 * Expected headers:
 * - `x-user-id`: User identifier (UUID from Keycloak)
 * - `x-user-roles`: Comma-separated list of user roles
 */

import type { AuthProvider, AuthRequest } from '../auth_provider.js'
import type { AuthenticatedUser } from '../types.js'

/**
 * Authentication provider for API Gateway authentication.
 *
 * This is the default authentication mode for Digital Twin applications deployed
 * behind an API gateway like Apache APISIX or KrakenD.
 *
 * @example
 * ```typescript
 * const provider = new GatewayAuthProvider('admin')
 *
 * // In a handler
 * const user = provider.parseRequest(req)
 * if (!user) {
 *     return { status: 401, content: 'Authentication required' }
 * }
 *
 * if (provider.isAdmin(req)) {
 *     // Admin-only logic
 * }
 * ```
 */
export class GatewayAuthProvider implements AuthProvider {
    readonly #adminRoleName: string

    /**
     * Creates a new GatewayAuthProvider.
     *
     * @param adminRoleName - Name of the admin role (default: 'admin')
     */
    constructor(adminRoleName = 'admin') {
        this.#adminRoleName = adminRoleName
    }

    /**
     * Parse the request headers and return the authenticated user.
     *
     * @param req - Request object with headers
     * @returns Authenticated user, or null if x-user-id header is missing
     */
    parseRequest(req: AuthRequest): AuthenticatedUser | null {
        const userId = this.#getHeader(req.headers, 'x-user-id')
        if (!userId) return null

        const roles = this.getUserRoles(req)

        return { id: userId, roles }
    }

    /**
     * Check if the request has the x-user-id header.
     *
     * @param req - Request object with headers
     * @returns true if x-user-id header is present
     */
    hasValidAuth(req: AuthRequest): boolean {
        return !!this.#getHeader(req.headers, 'x-user-id')
    }

    /**
     * Check if the user has the admin role.
     *
     * @param req - Request object with headers
     * @returns true if x-user-roles contains the admin role
     */
    isAdmin(req: AuthRequest): boolean {
        const roles = this.getUserRoles(req)
        return roles.includes(this.#adminRoleName)
    }

    /**
     * Get the user ID from the x-user-id header.
     *
     * @param req - Request object with headers
     * @returns User ID, or null if header is missing
     */
    getUserId(req: AuthRequest): string | null {
        return this.#getHeader(req.headers, 'x-user-id')
    }

    /**
     * Get the user roles from the x-user-roles header.
     *
     * @param req - Request object with headers
     * @returns Array of role names, empty array if header is missing
     */
    getUserRoles(req: AuthRequest): string[] {
        const rolesHeader = this.#getHeader(req.headers, 'x-user-roles')
        if (!rolesHeader) return []
        return rolesHeader
            .split(',')
            .map(r => r.trim())
            .filter(Boolean)
    }

    /**
     * Get a header value as a string.
     * Handles both string and string[] header values.
     */
    #getHeader(headers: Record<string, string | string[] | undefined>, name: string): string | null {
        const value = headers[name]
        if (!value) return null
        return Array.isArray(value) ? value[0] : value
    }
}
