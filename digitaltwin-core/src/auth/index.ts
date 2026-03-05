// Auth providers (new system)
export type { AuthProvider, AuthRequest, AuthMode, AuthProviderConfig, JwtConfig } from '@digitaltwin/auth'
export { AuthProviderFactory } from '@digitaltwin/auth'
export { GatewayAuthProvider, JwtAuthProvider, NoAuthProvider } from '@digitaltwin/auth'

// Backward-compatible API
export { ApisixAuthParser, type HeadersLike } from '@digitaltwin/auth'
export { UserService } from '@digitaltwin/auth'
export { AuthConfig } from '@digitaltwin/auth'
export { AuthMiddleware } from '@digitaltwin/auth'

// Types
export type { AuthenticatedUser, UserRecord, AuthContext, AuthenticatedRequest, AuthResult, UserRepository } from '@digitaltwin/auth'
