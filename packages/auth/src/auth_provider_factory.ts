/**
 * @fileoverview Factory for creating authentication providers from configuration or environment.
 */

import type { AuthProvider, AuthProviderConfig, AuthMode } from './auth_provider.js'
import { GatewayAuthProvider } from './providers/gateway_auth_provider.js'
import { NoAuthProvider } from './providers/no_auth_provider.js'
import { OidcAuthProvider } from './providers/oidc_auth_provider.js'
import { TrustedHeaderAuthProvider } from './providers/trusted_header_auth_provider.js'

/**
 * @example
 * ```typescript
 * const provider = AuthProviderFactory.fromEnv()
 * await provider.ready?.()
 *
 * const explicit = AuthProviderFactory.create({
 *     mode: 'oidc',
 *     oidc: { issuer: 'https://id.example.org/realms/city', audience: 'digitaltwin' }
 * })
 * ```
 */
export class AuthProviderFactory {
    /**
     * Create an authentication provider from explicit configuration.
     *
     * @throws Error if the configuration is incomplete for the mode
     */
    static create(config: AuthProviderConfig): AuthProvider {
        switch (config.mode) {
            case 'gateway':
                return new GatewayAuthProvider()

            case 'trusted-headers':
                return new TrustedHeaderAuthProvider(config.trustedHeaders)

            case 'oidc':
                if (!config.oidc) {
                    throw new Error('OIDC configuration required for oidc auth mode')
                }
                return new OidcAuthProvider(config.oidc)

            case 'none':
                return new NoAuthProvider(config.anonymousUserId)

            default:
                throw new Error(`Unknown auth mode: ${config.mode}`)
        }
    }

    /**
     * Create an authentication provider from environment variables.
     *
     * - `AUTH_MODE`: 'gateway' (default), 'oidc', 'trusted-headers' or 'none'
     * - `DIGITALTWIN_DISABLE_AUTH=true`: same as `AUTH_MODE=none`
     * - `DIGITALTWIN_ANONYMOUS_USER_ID`: subject of the anonymous user (default: 'anonymous')
     *
     * For `oidc`:
     * - `OIDC_ISSUER` (required), `OIDC_AUDIENCE` (required)
     * - `OIDC_ROLES_CLAIM`: dot path to the roles (default: 'roles'; Keycloak: 'realm_access.roles')
     * - `OIDC_CLOCK_TOLERANCE`: accepted clock skew in seconds (default: 5)
     * - `OIDC_JWKS_URI`: JWKS endpoint used instead of discovery
     * - `OIDC_PUBLIC_KEY`: PEM public key used instead of any JWKS (air-gapped setups)
     *
     * For `trusted-headers`:
     * - `AUTH_HEADER_SUBJECT`: header carrying the subject (default: 'x-user-id')
     * - `AUTH_HEADER_ROLES`: header carrying the comma-separated roles (default: 'x-user-roles')
     * - `AUTH_HEADER_SECRET`: shared secret the proxy must send in `x-auth-secret` (optional, strongly advised)
     *
     * @throws Error when `AUTH_MODE` is unknown or the mode's required variables are missing
     */
    static fromEnv(): AuthProvider {
        if (process.env.DIGITALTWIN_DISABLE_AUTH === 'true') {
            return new NoAuthProvider(process.env.DIGITALTWIN_ANONYMOUS_USER_ID || 'anonymous')
        }

        const mode = (process.env.AUTH_MODE || 'gateway') as AuthMode

        if (mode === 'oidc') {
            const issuer = process.env.OIDC_ISSUER
            const audience = process.env.OIDC_AUDIENCE
            if (!issuer || !audience) {
                throw new Error('AUTH_MODE=oidc requires OIDC_ISSUER and OIDC_AUDIENCE')
            }
            const rawTolerance = process.env.OIDC_CLOCK_TOLERANCE
            const clockTolerance = rawTolerance ? Number(rawTolerance) : undefined
            if (clockTolerance !== undefined && !Number.isFinite(clockTolerance)) {
                throw new Error(`OIDC_CLOCK_TOLERANCE must be a number of seconds, got "${rawTolerance}"`)
            }
            return new OidcAuthProvider({
                issuer,
                audience,
                rolesClaim: process.env.OIDC_ROLES_CLAIM,
                clockTolerance,
                jwksUri: process.env.OIDC_JWKS_URI,
                publicKey: process.env.OIDC_PUBLIC_KEY
            })
        }

        if (mode === 'trusted-headers') {
            return new TrustedHeaderAuthProvider({
                subjectHeader: process.env.AUTH_HEADER_SUBJECT,
                rolesHeader: process.env.AUTH_HEADER_ROLES,
                secret: process.env.AUTH_HEADER_SECRET
            })
        }

        return this.create({ mode, anonymousUserId: process.env.DIGITALTWIN_ANONYMOUS_USER_ID })
    }
}
