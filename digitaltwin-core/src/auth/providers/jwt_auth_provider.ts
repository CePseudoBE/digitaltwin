/**
 * @fileoverview JWT authentication provider for direct token validation.
 *
 * This provider validates JWT tokens from the Authorization header without
 * requiring an API gateway. Useful for standalone deployments or when you
 * want to handle authentication directly in the application.
 *
 * Supports:
 * - HMAC algorithms (HS256, HS384, HS512) with a secret key
 * - RSA algorithms (RS256, RS384, RS512) with a public key
 * - EC algorithms (ES256, ES384, ES512) with a public key
 * - Keycloak token format (realm_access.roles)
 * - Custom claim paths for user ID and roles
 */

import jwt from 'jsonwebtoken'
import type { AuthProvider, AuthRequest, AuthProviderConfig } from '../auth_provider.js'
import type { AuthenticatedUser } from '../types.js'

/**
 * Authentication provider for JWT token validation.
 *
 * This provider validates JWT tokens directly in the application, without
 * requiring an API gateway. It extracts user information from token claims.
 *
 * @example
 * ```typescript
 * // With HMAC secret
 * const provider = new JwtAuthProvider({
 *     mode: 'jwt',
 *     jwt: {
 *         secret: 'your-256-bit-secret',
 *         algorithm: 'HS256'
 *     }
 * })
 *
 * // With RSA public key (Keycloak)
 * const provider = new JwtAuthProvider({
 *     mode: 'jwt',
 *     jwt: {
 *         publicKey: fs.readFileSync('public.pem', 'utf-8'),
 *         algorithm: 'RS256',
 *         issuer: 'https://keycloak.example.com/realms/myrealm',
 *         rolesClaim: 'realm_access.roles'
 *     }
 * })
 * ```
 */
export class JwtAuthProvider implements AuthProvider {
    readonly #secret: string | Buffer
    readonly #algorithm: jwt.Algorithm
    readonly #issuer?: string
    readonly #audience?: string
    readonly #userIdClaim: string
    readonly #rolesClaim: string
    readonly #adminRoleName: string

    /**
     * Creates a new JwtAuthProvider.
     *
     * @param config - Authentication configuration with JWT settings
     * @throws Error if JWT configuration is missing or incomplete
     */
    constructor(config: AuthProviderConfig) {
        if (!config.jwt) {
            throw new Error('JWT configuration required for JWT auth mode')
        }

        const { jwt: jwtConfig } = config

        // Secret or public key
        if (jwtConfig.publicKey) {
            this.#secret = jwtConfig.publicKey
        } else if (jwtConfig.secret) {
            this.#secret = jwtConfig.secret
        } else {
            throw new Error('JWT secret or publicKey required')
        }

        this.#algorithm = (jwtConfig.algorithm as jwt.Algorithm) || 'HS256'
        this.#issuer = jwtConfig.issuer
        this.#audience = jwtConfig.audience
        this.#userIdClaim = jwtConfig.userIdClaim || 'sub'
        this.#rolesClaim = jwtConfig.rolesClaim || 'roles'
        this.#adminRoleName = config.adminRoleName || 'admin'
    }

    /**
     * Parse the request and validate the JWT token.
     *
     * @param req - Request object with headers
     * @returns Authenticated user, or null if token is missing/invalid
     */
    parseRequest(req: AuthRequest): AuthenticatedUser | null {
        const token = this.#extractToken(req)
        if (!token) return null

        try {
            const decoded = jwt.verify(token, this.#secret, {
                algorithms: [this.#algorithm],
                issuer: this.#issuer,
                audience: this.#audience
            }) as Record<string, unknown>

            const userId = this.#extractClaim(decoded, this.#userIdClaim)
            if (!userId || typeof userId !== 'string') return null

            const roles = this.#extractRoles(decoded)

            return { id: userId, roles }
        } catch {
            // Token invalid or expired
            return null
        }
    }

    /**
     * Check if the request has a valid Authorization header with Bearer token.
     *
     * @param req - Request object with headers
     * @returns true if Authorization header is present with Bearer scheme
     */
    hasValidAuth(req: AuthRequest): boolean {
        return !!this.#extractToken(req)
    }

    /**
     * Check if the authenticated user has admin privileges.
     *
     * @param req - Request object with headers
     * @returns true if the user has the admin role
     */
    isAdmin(req: AuthRequest): boolean {
        const user = this.parseRequest(req)
        return user?.roles.includes(this.#adminRoleName) ?? false
    }

    /**
     * Get the user ID from the JWT token.
     *
     * @param req - Request object with headers
     * @returns User ID, or null if not authenticated
     */
    getUserId(req: AuthRequest): string | null {
        const user = this.parseRequest(req)
        return user?.id ?? null
    }

    /**
     * Get the user roles from the JWT token.
     *
     * @param req - Request object with headers
     * @returns Array of role names, empty array if not authenticated
     */
    getUserRoles(req: AuthRequest): string[] {
        const user = this.parseRequest(req)
        return user?.roles ?? []
    }

    /**
     * Extract the Bearer token from the Authorization header.
     */
    #extractToken(req: AuthRequest): string | null {
        const authHeader = this.#getHeader(req.headers, 'authorization')
        if (!authHeader) return null

        // Format: "Bearer <token>"
        const parts = authHeader.split(' ')
        if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
            return null
        }

        return parts[1]
    }

    /**
     * Extract a claim value from the token payload.
     * Supports nested paths like "realm_access.roles".
     */
    #extractClaim(payload: Record<string, unknown>, path: string): unknown {
        const parts = path.split('.')
        let current: unknown = payload

        for (const part of parts) {
            if (current === null || current === undefined) return undefined
            if (typeof current !== 'object') return undefined
            current = (current as Record<string, unknown>)[part]
        }

        return current
    }

    /**
     * Extract roles from the token payload.
     * Supports standard array format and Keycloak's realm_access.roles.
     */
    #extractRoles(payload: Record<string, unknown>): string[] {
        // Try configured roles claim first
        const roles = this.#extractClaim(payload, this.#rolesClaim)
        if (Array.isArray(roles)) {
            return roles.filter((r): r is string => typeof r === 'string')
        }

        // Fallback to Keycloak format
        const realmAccess = payload.realm_access as { roles?: string[] } | undefined
        if (realmAccess?.roles && Array.isArray(realmAccess.roles)) {
            return realmAccess.roles
        }

        return []
    }

    /**
     * Get a header value as a string.
     */
    #getHeader(headers: Record<string, string | string[] | undefined>, name: string): string | null {
        const value = headers[name]
        if (!value) return null
        return Array.isArray(value) ? value[0] : value
    }
}
