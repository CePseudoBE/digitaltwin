/**
 * @fileoverview OIDC resource-server provider.
 *
 * The client obtains a token from any OIDC issuer (Keycloak, Auth0, Entra, Zitadel, ...)
 * and sends it as `Authorization: Bearer <JWT>`. The framework validates the signature
 * against the issuer's JWKS and never performs a login itself.
 */

import { createPublicKey, type KeyObject } from 'node:crypto'
import { createRemoteJWKSet, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from 'jose'
import type { AuthenticatedUser } from '@cepseudo/shared'
import type { AuthProvider, AuthRequest } from '../auth_provider.js'

export interface OidcAuthProviderOptions {
    /** Issuer URL; the token's `iss` must match it exactly */
    issuer: string
    /** Audience the token must carry in `aud` */
    audience: string
    /** Dot path of the claim holding the roles (default: 'roles'; Keycloak: 'realm_access.roles') */
    rolesClaim?: string
    /** Accepted clock skew in seconds (default: 5) */
    clockTolerance?: number
    /** JWKS endpoint to use instead of discovery */
    jwksUri?: string
    /** PEM public key to use instead of any JWKS, for air-gapped setups */
    publicKey?: string
}

type Keys = KeyObject | JWTVerifyGetKey

/**
 * Validates Bearer JWTs against an OIDC issuer.
 *
 * Signing keys come, in order of preference, from `publicKey`, `jwksUri`, or the
 * issuer's `/.well-known/openid-configuration`. The remote JWKS is cached by jose and
 * refetched when a token carries an unknown `kid`, so key rotation needs no restart.
 *
 * @example
 * ```typescript
 * const provider = new OidcAuthProvider({ issuer: 'https://id.example.org/realms/city', audience: 'digitaltwin' })
 * await provider.ready() // fails fast when discovery is broken
 * ```
 */
export class OidcAuthProvider implements AuthProvider {
    readonly #options: Required<Pick<OidcAuthProviderOptions, 'rolesClaim' | 'clockTolerance'>> & OidcAuthProviderOptions
    #keys?: Promise<Keys>

    constructor(options: OidcAuthProviderOptions) {
        this.#options = { rolesClaim: 'roles', clockTolerance: 5, ...options }
    }

    /** Resolves the signing keys now instead of on the first request; rejects with a clear message when discovery fails. */
    async ready(): Promise<void> {
        await this.#getKeys()
    }

    async authenticate(req: AuthRequest): Promise<AuthenticatedUser | null> {
        const token = bearerToken(req.headers['authorization'])
        if (!token) return null

        try {
            const { payload } = await jwtVerify(token, await this.#getKeys(), {
                issuer: this.#options.issuer,
                audience: this.#options.audience,
                clockTolerance: this.#options.clockTolerance
            })
            if (!payload.sub) return null
            return { subject: payload.sub, roles: rolesOf(payload, this.#options.rolesClaim), claims: payload }
        } catch {
            return null
        }
    }

    #getKeys(): Promise<Keys> {
        // a failed discovery is not memoised, so a transient outage does not lock every later request out
        this.#keys ??= this.#resolveKeys().catch(error => {
            this.#keys = undefined
            throw error
        })
        return this.#keys
    }

    async #resolveKeys(): Promise<Keys> {
        const { publicKey, jwksUri, issuer } = this.#options
        if (publicKey) return createPublicKey(publicKey)
        if (jwksUri) return createRemoteJWKSet(new URL(jwksUri))

        const url = `${issuer.replace(/\/$/, '')}/.well-known/openid-configuration`
        let document: { jwks_uri?: unknown }
        try {
            const response = await fetch(url)
            if (!response.ok) throw new Error(`HTTP ${response.status}`)
            document = (await response.json()) as { jwks_uri?: unknown }
        } catch (error) {
            const reason = error instanceof Error ? error.message : String(error)
            throw new Error(`OIDC discovery failed for issuer ${issuer} (${url}): ${reason}`)
        }
        if (typeof document.jwks_uri !== 'string') {
            throw new Error(`OIDC discovery document at ${url} has no jwks_uri`)
        }
        return createRemoteJWKSet(new URL(document.jwks_uri))
    }
}

function bearerToken(header: string | string[] | undefined): string | null {
    const value = Array.isArray(header) ? header[0] : header
    if (!value) return null
    const [scheme, token, ...rest] = value.split(' ')
    if (scheme.toLowerCase() !== 'bearer' || !token || rest.length > 0) return null
    return token
}

function rolesOf(payload: JWTPayload, path: string): string[] {
    let current: unknown = payload
    for (const part of path.split('.')) {
        if (current === null || typeof current !== 'object') return []
        current = (current as Record<string, unknown>)[part]
    }
    return Array.isArray(current) ? current.filter((r): r is string => typeof r === 'string') : []
}
