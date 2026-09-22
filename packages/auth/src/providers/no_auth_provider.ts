/**
 * @fileoverview No-authentication provider for development and testing.
 *
 * This provider bypasses all authentication checks and returns a configurable
 * anonymous user for all requests. Use only in development or testing environments.
 *
 * WARNING: Never use this provider in production!
 */

import type { AuthProvider, AuthRequest } from '../auth_provider.js'
import type { AuthenticatedUser } from '@cepseudo/shared'

/**
 * Authentication provider that bypasses authentication.
 *
 * All requests are treated as authenticated with a configurable anonymous user.
 *
 * @example
 * ```typescript
 * const provider = new NoAuthProvider('dev-user-123')
 * await provider.authenticate(req) // { subject: 'dev-user-123', roles: ['anonymous'] }
 * ```
 */
export class NoAuthProvider implements AuthProvider {
    readonly #anonymousUserId: string
    readonly #anonymousRoles: string[]

    /**
     * @param anonymousUserId - Subject of the anonymous user (default: 'anonymous')
     * @param anonymousRoles - Roles of the anonymous user (default: ['anonymous'])
     */
    constructor(anonymousUserId = 'anonymous', anonymousRoles: string[] = ['anonymous']) {
        this.#anonymousUserId = anonymousUserId
        this.#anonymousRoles = anonymousRoles
    }

    async authenticate(_req: AuthRequest): Promise<AuthenticatedUser | null> {
        return { subject: this.#anonymousUserId, roles: this.#anonymousRoles }
    }
}
