// Auth providers (new system)
export type { AuthProvider, AuthRequest, AuthMode } from '@cepseudo/auth'
export { createAuthProvider, adminRoleFromEnv } from '@cepseudo/auth'
export { GatewayAuthProvider, NoAuthProvider, OidcAuthProvider, TrustedHeaderAuthProvider } from '@cepseudo/auth'

// Backward-compatible API
export { ApisixAuthParser, type HeadersLike } from '@cepseudo/auth'
export { UserService } from '@cepseudo/auth'
export { AuthMiddleware } from '@cepseudo/auth'

// Types
export type { AuthenticatedUser, UserRecord, AuthResult, UserRepository } from '@cepseudo/auth'
