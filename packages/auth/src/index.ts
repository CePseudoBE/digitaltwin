export type { AuthProvider, AuthRequest } from './auth_provider.js'
export { createAuthProvider, adminRoleFromEnv, AUTH_MODES, type AuthMode, type AuthEnv } from './create_auth_provider.js'
export {
    GatewayAuthProvider,
    NoAuthProvider,
    OidcAuthProvider,
    TrustedHeaderAuthProvider,
    AUTH_SECRET_HEADER,
    type OidcAuthProviderOptions,
    type TrustedHeaderAuthProviderOptions
} from './providers/index.js'
export { AuthMiddleware, type AuthMiddlewareOptions } from './auth_middleware.js'
export { UserService } from './user_service.js'

// Types (re-exported from shared for convenience)
export type { AuthenticatedUser, UserRecord, AuthResult, UserRepository } from '@cepseudo/shared'
