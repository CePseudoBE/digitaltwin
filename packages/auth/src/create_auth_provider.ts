/**
 * @fileoverview The one place where authentication is read from the environment.
 *
 * `AUTH_MODE` selects the provider. It is required in production; in development
 * and test a missing value means `none`, with a warning, so a laptop still boots
 * while a deployment that forgot to configure auth refuses to start.
 */

import type { AuthProvider } from './auth_provider.js'
import { GatewayAuthProvider } from './providers/gateway_auth_provider.js'
import { NoAuthProvider } from './providers/no_auth_provider.js'
import { OidcAuthProvider } from './providers/oidc_auth_provider.js'
import { TrustedHeaderAuthProvider, type TrustedHeaderAuthProviderOptions } from './providers/trusted_header_auth_provider.js'

export const AUTH_MODES = ['oidc', 'trusted-headers', 'gateway', 'none'] as const

/**
 * - `oidc`: Validate Bearer JWTs against an OIDC issuer
 * - `trusted-headers`: Read the identity from headers set by a proxy the app sits behind
 * - `gateway`: Legacy alias of `trusted-headers` with fixed header names and no secret
 * - `none`: Disable authentication (development/testing only)
 */
export type AuthMode = (typeof AUTH_MODES)[number]

/** Environment as `process.env` exposes it: every value optional */
export type AuthEnv = Partial<Record<string, string>>

export interface AuthSettings {
    mode: AuthMode
    /** True when `AUTH_MODE` was absent and the development default applied */
    defaulted: boolean
    adminRole: string
    anonymousSubject: string
    trustedHeaders: TrustedHeaderAuthProviderOptions
}

function isAuthMode(value: string): value is AuthMode {
    return (AUTH_MODES as readonly string[]).includes(value)
}

/**
 * Parses the auth-related variables without instantiating anything.
 *
 * @throws Error when `AUTH_MODE` is unknown, or missing while `NODE_ENV=production`
 */
export function readAuthEnv(env: AuthEnv = process.env): AuthSettings {
    const valid = AUTH_MODES.join(', ')
    const raw = env.AUTH_MODE
    let mode: AuthMode
    if (!raw) {
        if (env.NODE_ENV === 'production') {
            throw new Error(`AUTH_MODE is required in production. Valid modes: ${valid}`)
        }
        mode = 'none'
    } else if (isAuthMode(raw)) {
        mode = raw
    } else {
        throw new Error(`Unknown AUTH_MODE "${raw}". Valid modes: ${valid}`)
    }

    return {
        mode,
        defaulted: !raw,
        adminRole: env.AUTH_ADMIN_ROLE || env.DIGITALTWIN_ADMIN_ROLE_NAME || 'admin',
        anonymousSubject: env.DIGITALTWIN_ANONYMOUS_USER_ID || 'anonymous',
        trustedHeaders:
            mode === 'trusted-headers'
                ? { subjectHeader: env.AUTH_HEADER_SUBJECT, rolesHeader: env.AUTH_HEADER_ROLES, secret: env.AUTH_HEADER_SECRET }
                : {}
    }
}

/** Role that grants access to every resource, read from `AUTH_ADMIN_ROLE` (default: 'admin'). */
export function adminRoleFromEnv(env: AuthEnv = process.env): string {
    return readAuthEnv(env).adminRole
}

/**
 * Builds the provider selected by `AUTH_MODE`.
 *
 * - `oidc`: `OIDC_ISSUER` and `OIDC_AUDIENCE` (required), `OIDC_ROLES_CLAIM`, `OIDC_CLOCK_TOLERANCE`, `OIDC_JWKS_URI`, `OIDC_PUBLIC_KEY`
 * - `trusted-headers`: `AUTH_HEADER_SUBJECT`, `AUTH_HEADER_ROLES`, `AUTH_HEADER_SECRET`
 * - `none`: `DIGITALTWIN_ANONYMOUS_USER_ID`
 *
 * Every mode: `AUTH_ADMIN_ROLE` names the admin role (see `adminRoleFromEnv`).
 *
 * @throws Error when the mode is unknown, missing in production, or its required variables are absent
 */
export function createAuthProvider(env: AuthEnv = process.env): AuthProvider {
    const settings = readAuthEnv(env)
    if (settings.defaulted && env.NODE_ENV !== 'test') {
        console.warn(
            `[DigitalTwin] AUTH_MODE is not set: authentication is disabled (none). Set it explicitly; production refuses to start without it. Valid modes: ${AUTH_MODES.join(', ')}`
        )
    }

    switch (settings.mode) {
        case 'none':
            return new NoAuthProvider(settings.anonymousSubject)
        case 'gateway':
            return new GatewayAuthProvider()
        case 'trusted-headers':
            return new TrustedHeaderAuthProvider(settings.trustedHeaders)
        case 'oidc':
            return createOidcProvider(env)
    }
}

function createOidcProvider(env: AuthEnv): OidcAuthProvider {
    const issuer = env.OIDC_ISSUER
    const audience = env.OIDC_AUDIENCE
    if (!issuer || !audience) {
        throw new Error('AUTH_MODE=oidc requires OIDC_ISSUER and OIDC_AUDIENCE')
    }
    const rawTolerance = env.OIDC_CLOCK_TOLERANCE
    const clockTolerance = rawTolerance ? Number(rawTolerance) : undefined
    if (clockTolerance !== undefined && !Number.isFinite(clockTolerance)) {
        throw new Error(`OIDC_CLOCK_TOLERANCE must be a number of seconds, got "${rawTolerance}"`)
    }
    return new OidcAuthProvider({
        issuer,
        audience,
        rolesClaim: env.OIDC_ROLES_CLAIM,
        clockTolerance,
        jwksUri: env.OIDC_JWKS_URI,
        publicKey: env.OIDC_PUBLIC_KEY
    })
}
