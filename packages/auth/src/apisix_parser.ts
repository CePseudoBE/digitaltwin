import type { AuthenticatedUser } from '@cepseudo/shared'
import { readAuthEnv } from './create_auth_provider.js'
import { TrustedHeaderAuthProvider } from './providers/trusted_header_auth_provider.js'

/**
 * Headers type that accepts both Node IncomingHttpHeaders and Record<string, string>
 */
export type HeadersLike = Record<string, string | string[] | undefined>

/**
 * Synchronous reader of the gateway headers, honouring `AUTH_MODE` so that a client
 * cannot claim a role through headers when the identity comes from somewhere else.
 *
 * @deprecated Only the assets managers' direct admin checks still use it; they move
 * to `AuthResult.isAdmin` and this class is removed. New code goes through `AuthMiddleware`.
 */
export class ApisixAuthParser {
    static parseAuthHeaders(headers: HeadersLike): AuthenticatedUser | null {
        const settings = readAuthEnv()
        if (settings.mode !== 'gateway' && settings.mode !== 'trusted-headers') return null
        return new TrustedHeaderAuthProvider(settings.trustedHeaders).parse(headers)
    }

    static hasValidAuth(headers: HeadersLike): boolean {
        return this.parseAuthHeaders(headers) !== null
    }

    static isAdmin(headers: HeadersLike): boolean {
        return this.parseAuthHeaders(headers)?.roles.includes(readAuthEnv().adminRole) ?? false
    }
}
