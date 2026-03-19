// Auth providers (new system)
export type { AuthProvider, AuthRequest, AuthMode, AuthProviderConfig, JwtConfig } from '@cepseudo/auth'
export { AuthProviderFactory } from '@cepseudo/auth'
export { GatewayAuthProvider, JwtAuthProvider, NoAuthProvider } from '@cepseudo/auth'

// Backward-compatible API
export { ApisixAuthParser, type HeadersLike } from '@cepseudo/auth'
export { UserService } from '@cepseudo/auth'
export { AuthConfig } from '@cepseudo/auth'
export { AuthMiddleware } from '@cepseudo/auth'

// Types
export type { AuthenticatedUser, UserRecord, AuthContext, AuthenticatedRequest, AuthResult, UserRepository } from '@cepseudo/auth'
