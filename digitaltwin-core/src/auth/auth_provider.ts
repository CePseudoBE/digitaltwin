/**
 * @fileoverview Authentication provider interface and types for the Digital Twin framework.
 *
 * This module defines the contract for authentication providers, allowing the framework
 * to support multiple authentication mechanisms (gateway headers, JWT tokens, etc.).
 */

import type { AuthenticatedUser } from './types.js'

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
    /** Name of the admin role (default: 'admin') */
    adminRoleName?: string
    /** JWT-specific configuration (required when mode is 'jwt') */
    jwt?: JwtConfig
    /** Anonymous user ID for 'none' mode (default: 'anonymous') */
    anonymousUserId?: string
}

/**
 * Request-like object for authentication parsing.
 *
 * This interface allows the auth provider to work with any request object
 * that has headers, without requiring a full Express Request.
 */
export interface AuthRequest {
    /** Request headers */
    headers: Record<string, string | string[] | undefined>
}

/**
 * Authentication provider interface.
 *
 * Implement this interface to create custom authentication mechanisms.
 * The framework provides three built-in providers:
 * - GatewayAuthProvider: For API gateway authentication (Apache APISIX, KrakenD)
 * - JwtAuthProvider: For direct JWT token validation
 * - NoAuthProvider: For development/testing without authentication
 *
 * @example
 * ```typescript
 * // Using the factory (recommended)
 * const provider = AuthProviderFactory.fromEnv()
 *
 * // In a handler
 * const user = provider.parseRequest(req)
 * if (!user) {
 *     return { status: 401, content: 'Authentication required' }
 * }
 * ```
 */
export interface AuthProvider {
    /**
     * Parse the request and return the authenticated user.
     *
     * @param req - Request object with headers
     * @returns Authenticated user, or null if not authenticated or invalid
     */
    parseRequest(req: AuthRequest): AuthenticatedUser | null

    /**
     * Check if the request has valid authentication.
     *
     * This is a quick check that can be used before full parsing.
     *
     * @param req - Request object with headers
     * @returns true if the request has valid authentication credentials
     */
    hasValidAuth(req: AuthRequest): boolean

    /**
     * Check if the authenticated user has admin privileges.
     *
     * @param req - Request object with headers
     * @returns true if the user has the admin role
     */
    isAdmin(req: AuthRequest): boolean

    /**
     * Get the user ID from the request.
     *
     * @param req - Request object with headers
     * @returns User ID, or null if not authenticated
     */
    getUserId(req: AuthRequest): string | null

    /**
     * Get the user roles from the request.
     *
     * @param req - Request object with headers
     * @returns Array of role names, empty array if not authenticated
     */
    getUserRoles(req: AuthRequest): string[]
}
