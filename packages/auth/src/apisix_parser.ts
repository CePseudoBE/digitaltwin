import type { AuthenticatedUser } from '@cepseudo/shared'
import { AuthConfig } from './auth_config.js'
import { GatewayAuthProvider } from './providers/gateway_auth_provider.js'

/**
 * Headers type that accepts both Node IncomingHttpHeaders and Record<string, string>
 */
export type HeadersLike = Record<string, string | string[] | undefined>

/**
 * Synchronous reader of the gateway headers.
 *
 * @deprecated Only the assets managers' direct admin checks still use it; they move
 * to `AuthResult.isAdmin` and this class is removed. New code goes through `AuthMiddleware`.
 */
export class ApisixAuthParser {
    static parseAuthHeaders(headers: HeadersLike): AuthenticatedUser | null {
        if (AuthConfig.isAuthDisabled()) {
            return AuthConfig.getAnonymousUser()
        }
        return GatewayAuthProvider.parseHeaders(headers)
    }

    static hasValidAuth(headers: HeadersLike): boolean {
        return this.parseAuthHeaders(headers) !== null
    }

    static isAdmin(headers: HeadersLike): boolean {
        return this.parseAuthHeaders(headers)?.roles.includes(AuthConfig.getAdminRoleName()) ?? false
    }
}
