export type { AuthProvider, AuthRequest, AuthMode, AuthProviderConfig, JwtConfig } from './auth_provider.js'
export { AuthProviderFactory } from './auth_provider_factory.js'
export { GatewayAuthProvider, JwtAuthProvider, NoAuthProvider } from './providers/index.js'
export { AuthMiddleware, type AuthMiddlewareOptions } from './auth_middleware.js'
export { UserService } from './user_service.js'
export { AuthConfig } from './auth_config.js'
export { ApisixAuthParser, type HeadersLike } from './apisix_parser.js'

// Types (re-exported from shared for convenience)
export type { AuthenticatedUser, UserRecord, AuthResult, UserRepository } from '@cepseudo/shared'
