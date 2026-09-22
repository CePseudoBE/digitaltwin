/**
 * @fileoverview Gateway authentication provider for API Gateway authentication.
 *
 * This provider parses authentication information from HTTP headers set by an API gateway
 * after validating tokens with an identity provider.
 *
 * Expected headers:
 * - `x-user-id`: User identifier
 * - `x-user-roles`: Comma-separated list of user roles
 */

import type { AuthProvider, AuthRequest } from '../auth_provider.js'
import type { AuthenticatedUser } from '@cepseudo/shared'

/**
 * Authentication provider for API Gateway authentication.
 *
 * @example
 * ```typescript
 * const provider = new GatewayAuthProvider()
 * const user = await provider.authenticate(req)
 * if (!user) {
 *     return { status: 401, content: 'Authentication required' }
 * }
 * ```
 */
export class GatewayAuthProvider implements AuthProvider {
    /**
     * Read the caller from the gateway headers.
     *
     * @returns The authenticated user, or null if x-user-id is missing
     */
    static parseHeaders(headers: AuthRequest['headers']): AuthenticatedUser | null {
        const subject = firstValue(headers['x-user-id'])
        if (!subject) return null

        const roles = (firstValue(headers['x-user-roles']) ?? '')
            .split(',')
            .map(r => r.trim())
            .filter(Boolean)

        return { subject, roles }
    }

    async authenticate(req: AuthRequest): Promise<AuthenticatedUser | null> {
        return GatewayAuthProvider.parseHeaders(req.headers)
    }
}

function firstValue(value: string | string[] | undefined): string | undefined {
    return Array.isArray(value) ? value[0] : value
}
