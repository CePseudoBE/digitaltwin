import type { AuthenticatedUser } from '@cepseudo/shared'
import type { AuthRequest } from '../auth_provider.js'
import { TrustedHeaderAuthProvider } from './trusted_header_auth_provider.js'

/**
 * Trusted-headers provider with the historical defaults: `x-user-id`, `x-user-roles`, no shared secret.
 *
 * @deprecated Use `TrustedHeaderAuthProvider` (`AUTH_MODE=trusted-headers`). Removed with the legacy header parser.
 */
export class GatewayAuthProvider extends TrustedHeaderAuthProvider {
    static parseHeaders(headers: AuthRequest['headers']): AuthenticatedUser | null {
        return new GatewayAuthProvider().parse(headers)
    }
}
