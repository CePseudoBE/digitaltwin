// Auth providers (new system)
export type { AuthProvider, AuthRequest, AuthMode, AuthProviderConfig, JwtConfig } from './auth_provider.js'
export { AuthProviderFactory } from './auth_provider_factory.js'
export { GatewayAuthProvider, JwtAuthProvider, NoAuthProvider } from './providers/index.js'

// Backward-compatible API
export { ApisixAuthParser } from './apisix_parser.js'
export { UserService } from './user_service.js'
export { AuthConfig } from './auth_config.js'

// Types
export type { AuthenticatedUser, UserRecord, AuthContext, AuthenticatedRequest } from './types.js'
