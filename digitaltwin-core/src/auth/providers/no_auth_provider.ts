/**
 * @fileoverview No-authentication provider for development and testing.
 *
 * This provider bypasses all authentication checks and returns a configurable
 * anonymous user for all requests. Use only in development or testing environments.
 *
 * WARNING: Never use this provider in production!
 */

import type { AuthProvider, AuthRequest } from '../auth_provider.js'
import type { AuthenticatedUser } from '../types.js'

/**
 * Authentication provider that bypasses authentication.
 *
 * All requests are treated as authenticated with a configurable anonymous user.
 * This provider is useful for development and testing when you don't want to
 * set up authentication infrastructure.
 *
 * @example
 * ```typescript
 * // Development setup
 * const provider = new NoAuthProvider('dev-user-123')
 *
 * // All requests return the same user
 * const user = provider.parseRequest(req) // { id: 'dev-user-123', roles: ['user'] }
 * provider.hasValidAuth(req) // always true
 * provider.isAdmin(req) // always false
 * ```
 */
export class NoAuthProvider implements AuthProvider {
    readonly #anonymousUserId: string
    readonly #anonymousRoles: string[]

    /**
     * Creates a new NoAuthProvider.
     *
     * @param anonymousUserId - User ID for the anonymous user (default: 'anonymous')
     * @param anonymousRoles - Roles for the anonymous user (default: ['anonymous'])
     */
    constructor(anonymousUserId = 'anonymous', anonymousRoles: string[] = ['anonymous']) {
        this.#anonymousUserId = anonymousUserId
        this.#anonymousRoles = anonymousRoles
    }

    /**
     * Returns the anonymous user for all requests.
     *
     * @returns Anonymous user with configured ID and roles
     */
    parseRequest(_req: AuthRequest): AuthenticatedUser | null {
        return {
            id: this.#anonymousUserId,
            roles: this.#anonymousRoles
        }
    }

    /**
     * Always returns true (all requests are "authenticated").
     */
    hasValidAuth(_req: AuthRequest): boolean {
        return true
    }

    /**
     * Always returns false (anonymous user is never admin).
     */
    isAdmin(_req: AuthRequest): boolean {
        return false
    }

    /**
     * Returns the anonymous user ID.
     */
    getUserId(_req: AuthRequest): string | null {
        return this.#anonymousUserId
    }

    /**
     * Returns the anonymous user roles.
     */
    getUserRoles(_req: AuthRequest): string[] {
        return this.#anonymousRoles
    }
}
