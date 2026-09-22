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
import type { AuthenticatedUser } from '@cepseudo/shared'

/**
 * Authentication provider for JWT token validation.
 *
 * @example
 * ```typescript
 * // With HMAC secret
 * const provider = new JwtAuthProvider({
 *     mode: 'jwt',
 *     jwt: { secret: 'your-256-bit-secret', algorithm: 'HS256' }
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

    /**
     * @param config - Authentication configuration with JWT settings
     * @throws Error if JWT configuration is missing or incomplete
     */
    constructor(config: AuthProviderConfig) {
        if (!config.jwt) {
            throw new Error('JWT configuration required for JWT auth mode')
        }

        const { jwt: jwtConfig } = config

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
    }

    /**
     * Validate the Bearer token and read the caller from its claims.
     *
     * @returns The authenticated user, or null if the token is missing or invalid
     */
    async authenticate(req: AuthRequest): Promise<AuthenticatedUser | null> {
        const token = this.#extractToken(req)
        if (!token) return null

        try {
            const decoded = jwt.verify(token, this.#secret, {
                algorithms: [this.#algorithm],
                issuer: this.#issuer,
                audience: this.#audience
            }) as Record<string, unknown>

            const subject = this.#extractClaim(decoded, this.#userIdClaim)
            if (!subject || typeof subject !== 'string') return null

            return { subject, roles: this.#extractRoles(decoded), claims: decoded }
        } catch {
            return null
        }
    }

    #extractToken(req: AuthRequest): string | null {
        const value = req.headers['authorization']
        const authHeader = Array.isArray(value) ? value[0] : value
        if (!authHeader) return null

        const parts = authHeader.split(' ')
        if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
            return null
        }

        return parts[1]
    }

    /** Supports nested paths like "realm_access.roles". */
    #extractClaim(payload: Record<string, unknown>, path: string): unknown {
        let current: unknown = payload

        for (const part of path.split('.')) {
            if (current === null || current === undefined) return undefined
            if (typeof current !== 'object') return undefined
            current = (current as Record<string, unknown>)[part]
        }

        return current
    }

    #extractRoles(payload: Record<string, unknown>): string[] {
        const roles = this.#extractClaim(payload, this.#rolesClaim)
        if (Array.isArray(roles)) {
            return roles.filter((r): r is string => typeof r === 'string')
        }

        const realmAccess = payload.realm_access as { roles?: string[] } | undefined
        if (realmAccess?.roles && Array.isArray(realmAccess.roles)) {
            return realmAccess.roles
        }

        return []
    }
}
