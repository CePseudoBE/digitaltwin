/**
 * @fileoverview Authentication provider contract for the Digital Twin framework.
 *
 * A provider turns request headers into an authenticated caller. It is the single
 * place where credentials are read, so the middleware, the components and the
 * plugins never look at headers themselves.
 */

import type { AuthenticatedUser } from '@cepseudo/shared'
import type { OidcAuthProviderOptions } from './providers/oidc_auth_provider.js'
import type { TrustedHeaderAuthProviderOptions } from './providers/trusted_header_auth_provider.js'

/**
 * Authentication mode for the Digital Twin framework.
 *
 * - `oidc`: Validate Bearer JWTs against an OIDC issuer
 * - `trusted-headers`: Read the identity from headers set by a proxy the app sits behind
 * - `gateway`: Legacy alias of `trusted-headers` with fixed header names and no secret
 * - `none`: Disable authentication (development/testing only)
 */
export type AuthMode = 'gateway' | 'oidc' | 'trusted-headers' | 'none'

/**
 * Authentication configuration for the Digital Twin framework.
 */
export interface AuthProviderConfig {
    /** Authentication mode */
    mode: AuthMode
    /** OIDC configuration (required when mode is 'oidc') */
    oidc?: OidcAuthProviderOptions
    /** Header names and shared secret for 'trusted-headers' mode */
    trustedHeaders?: TrustedHeaderAuthProviderOptions
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

    /**
     * Optional start-up hook. The engine awaits it before listening so a provider
     * that needs remote material (discovery document, signing keys) fails fast
     * with a clear message instead of refusing every request later.
     */
    ready?(): Promise<void>
}
