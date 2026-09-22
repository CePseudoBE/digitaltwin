/**
 * @fileoverview Authentication provider contract for the Digital Twin framework.
 *
 * A provider turns request headers into an authenticated caller. It is the single
 * place where credentials are read, so the middleware, the components and the
 * plugins never look at headers themselves.
 */

import type { AuthenticatedUser } from '@cepseudo/shared'

/**
 * Authentication mode for the Digital Twin framework.
 *
 * - `gateway`: Parse authentication from gateway headers (x-user-id, x-user-roles)
 * - `jwt`: Validate JWT tokens from Authorization header
 * - `none`: Disable authentication (development/testing only)
 */
export type AuthMode = 'gateway' | 'jwt' | 'none'

/**
 * JWT-specific configuration options.
 */
export interface JwtConfig {
    /** Secret key for HMAC algorithms (HS256, HS384, HS512) */
    secret?: string
    /** Public key for RSA/EC algorithms (RS256, RS384, RS512, ES256, ES384, ES512) */
    publicKey?: string
    /** JWT algorithm (default: 'HS256') */
    algorithm?: string
    /** Expected token issuer for validation */
    issuer?: string
    /** Expected token audience for validation */
    audience?: string
    /** Claim name for user ID (default: 'sub') */
    userIdClaim?: string
    /** Claim name for roles (default: 'roles', supports nested paths like 'realm_access.roles') */
    rolesClaim?: string
}

/**
 * Authentication configuration for the Digital Twin framework.
 */
export interface AuthProviderConfig {
    /** Authentication mode */
    mode: AuthMode
    /** JWT-specific configuration (required when mode is 'jwt') */
    jwt?: JwtConfig
    /** Anonymous user ID for 'none' mode (default: 'anonymous') */
    anonymousUserId?: string
}

/**
 * Request-like object for authentication parsing.
 *
 * This interface allows the auth provider to work with any request object
 * that has headers, without requiring a full HTTP request.
 */
export interface AuthRequest {
    /** Request headers */
    headers: Record<string, string | string[] | undefined>
}

/**
 * Authentication provider interface.
 *
 * Implement it to plug a custom authentication mechanism into the framework.
 * The result is asynchronous so a provider can fetch signing keys or call an
 * identity service while validating credentials.
 *
 * @example
 * ```typescript
 * class HeaderProvider implements AuthProvider {
 *     async authenticate(req: AuthRequest) {
 *         const subject = req.headers['x-subject']
 *         return typeof subject === 'string' ? { subject, roles: [] } : null
 *     }
 * }
 * ```
 */
export interface AuthProvider {
    /**
     * Resolve the caller from the request.
     *
     * @param req - Request object with headers
     * @returns The authenticated user, or null when the request carries no valid credentials
     */
    authenticate(req: AuthRequest): Promise<AuthenticatedUser | null>
}
