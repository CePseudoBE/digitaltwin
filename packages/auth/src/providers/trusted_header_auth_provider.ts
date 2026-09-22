/**
 * @fileoverview Header-based identity for deployments behind a reverse proxy or API gateway.
 *
 * The proxy authenticates the client, strips any identity headers the client sent,
 * and forwards the subject and roles in headers of its own. This is only safe when
 * the application cannot be reached without going through that proxy.
 */

import { timingSafeEqual } from 'node:crypto'
import type { AuthenticatedUser } from '@cepseudo/shared'
import type { AuthProvider, AuthRequest } from '../auth_provider.js'

/** Header the proxy sends the shared secret in when one is configured */
export const AUTH_SECRET_HEADER = 'x-auth-secret'

export interface TrustedHeaderAuthProviderOptions {
    /** Header carrying the subject (default: 'x-user-id') */
    subjectHeader?: string
    /** Header carrying the comma-separated roles (default: 'x-user-roles') */
    rolesHeader?: string
    /** Shared secret the proxy must send in `x-auth-secret`; without it, anything that reaches the app can claim any identity */
    secret?: string
}

/**
 * Reads the caller from headers set by a trusted proxy.
 *
 * @example
 * ```typescript
 * const provider = new TrustedHeaderAuthProvider({ subjectHeader: 'x-forwarded-user', secret: process.env.AUTH_HEADER_SECRET })
 * await provider.ready() // prints the "behind a proxy only" warning
 * ```
 */
export class TrustedHeaderAuthProvider implements AuthProvider {
    readonly #subjectHeader: string
    readonly #rolesHeader: string
    readonly #secret?: string

    constructor(options: TrustedHeaderAuthProviderOptions = {}) {
        // Node lowercases incoming header names, so the configured names must match that
        this.#subjectHeader = (options.subjectHeader ?? 'x-user-id').toLowerCase()
        this.#rolesHeader = (options.rolesHeader ?? 'x-user-roles').toLowerCase()
        this.#secret = options.secret
    }

    async ready(): Promise<void> {
        const secretNote = this.#secret
            ? ''
            : ' No shared secret is configured, so nothing else stops a direct client from impersonating anyone.'
        console.warn(
            `[DigitalTwin] Trusted-headers auth: the caller identity is read from the "${this.#subjectHeader}" and "${this.#rolesHeader}" headers. ` +
                `The application must only be reachable through the proxy that sets them.${secretNote}`
        )
    }

    async authenticate(req: AuthRequest): Promise<AuthenticatedUser | null> {
        return this.parse(req.headers)
    }

    /** Synchronous read of the headers, shared with the legacy header parser. */
    parse(headers: AuthRequest['headers']): AuthenticatedUser | null {
        if (this.#secret !== undefined && !this.#secretMatches(firstValue(headers[AUTH_SECRET_HEADER]))) return null

        const subject = firstValue(headers[this.#subjectHeader])
        if (!subject) return null

        const roles = (firstValue(headers[this.#rolesHeader]) ?? '')
            .split(',')
            .map(r => r.trim())
            .filter(Boolean)

        return { subject, roles }
    }

    #secretMatches(sent: string | undefined): boolean {
        if (!sent || this.#secret === undefined) return false
        const expected = Buffer.from(this.#secret)
        const received = Buffer.from(sent)
        return received.length === expected.length && timingSafeEqual(received, expected)
    }
}

function firstValue(value: string | string[] | undefined): string | undefined {
    return Array.isArray(value) ? value[0] : value
}
