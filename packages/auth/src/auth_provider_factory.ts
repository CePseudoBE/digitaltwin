/**
 * @fileoverview Factory for creating authentication providers.
 *
 * This module provides a factory for creating the appropriate authentication
 * provider based on configuration or environment variables.
 */

import * as fs from 'fs'
import type { AuthProvider, AuthProviderConfig, AuthMode } from './auth_provider.js'
import { GatewayAuthProvider } from './providers/gateway_auth_provider.js'
import { JwtAuthProvider } from './providers/jwt_auth_provider.js'
import { NoAuthProvider } from './providers/no_auth_provider.js'

/**
 * Factory for creating authentication providers.
 *
 * Use this factory to create the appropriate authentication provider based on
 * configuration or environment variables.
 *
 * @example
 * ```typescript
 * // Create from environment variables (recommended)
 * const provider = AuthProviderFactory.fromEnv()
 *
 * // Create from explicit configuration
 * const provider = AuthProviderFactory.create({
 *     mode: 'jwt',
 *     jwt: { secret: 'your-secret' }
 * })
 * ```
 */
export class AuthProviderFactory {
    /**
     * Create an authentication provider from explicit configuration.
     *
     * @param config - Authentication configuration
     * @returns Configured authentication provider
     * @throws Error if configuration is invalid
     *
     * @example
     * ```typescript
     * // Gateway mode (default)
     * const provider = AuthProviderFactory.create({ mode: 'gateway' })
     *
     * // JWT mode
     * const provider = AuthProviderFactory.create({
     *     mode: 'jwt',
     *     jwt: { secret: 'your-secret', algorithm: 'HS256' }
     * })
     *
     * // No auth mode (development only)
     * const provider = AuthProviderFactory.create({ mode: 'none' })
     * ```
     */
    static create(config: AuthProviderConfig): AuthProvider {
        switch (config.mode) {
            case 'gateway':
                return new GatewayAuthProvider(config.adminRoleName)

            case 'jwt':
                return new JwtAuthProvider(config)

            case 'none':
                return new NoAuthProvider(config.anonymousUserId)

            default:
                throw new Error(`Unknown auth mode: ${config.mode}`)
        }
    }

    /**
     * Create an authentication provider from environment variables.
     *
     * Environment variables:
     * - `AUTH_MODE`: Authentication mode ('gateway', 'jwt', 'none'). Default: 'gateway'
     * - `AUTH_ADMIN_ROLE`: Name of admin role. Default: 'admin'
     *
     * For JWT mode:
     * - `JWT_SECRET`: Secret key for HMAC algorithms
     * - `JWT_PUBLIC_KEY`: Public key content for RSA/EC algorithms
     * - `JWT_PUBLIC_KEY_FILE`: Path to public key file
     * - `JWT_ALGORITHM`: Algorithm (default: 'HS256')
     * - `JWT_ISSUER`: Expected token issuer
     * - `JWT_AUDIENCE`: Expected token audience
     * - `JWT_USER_ID_CLAIM`: Claim for user ID (default: 'sub')
     * - `JWT_ROLES_CLAIM`: Claim for roles (default: 'roles')
     *
     * For no-auth mode:
     * - `DIGITALTWIN_DISABLE_AUTH`: Set to 'true' to disable auth
     * - `DIGITALTWIN_ANONYMOUS_USER_ID`: Anonymous user ID (default: 'anonymous')
     *
     * @returns Configured authentication provider
     *
     * @example
     * ```typescript
     * // Gateway mode (default, no env vars needed)
     * // AUTH_MODE=gateway or not set
     * const provider = AuthProviderFactory.fromEnv()
     *
     * // JWT mode
     * // AUTH_MODE=jwt
     * // JWT_SECRET=your-secret
     * const provider = AuthProviderFactory.fromEnv()
     *
     * // Disable auth for development
     * // DIGITALTWIN_DISABLE_AUTH=true
     * const provider = AuthProviderFactory.fromEnv()
     * ```
     */
    static fromEnv(): AuthProvider {
        const adminRoleName = process.env.AUTH_ADMIN_ROLE || process.env.DIGITALTWIN_ADMIN_ROLE_NAME || 'admin'

        // Check if auth is disabled (legacy env var)
        if (process.env.DIGITALTWIN_DISABLE_AUTH === 'true') {
            return new NoAuthProvider(process.env.DIGITALTWIN_ANONYMOUS_USER_ID || 'anonymous')
        }

        const mode = (process.env.AUTH_MODE || 'gateway') as AuthMode

        if (mode === 'none') {
            return new NoAuthProvider(process.env.DIGITALTWIN_ANONYMOUS_USER_ID || 'anonymous')
        }

        if (mode === 'gateway') {
            return new GatewayAuthProvider(adminRoleName)
        }

        if (mode === 'jwt') {
            // Load public key from file if specified
            let publicKey: string | undefined
            if (process.env.JWT_PUBLIC_KEY_FILE) {
                publicKey = fs.readFileSync(process.env.JWT_PUBLIC_KEY_FILE, 'utf-8')
            } else if (process.env.JWT_PUBLIC_KEY) {
                publicKey = process.env.JWT_PUBLIC_KEY
            }

            const secret = process.env.JWT_SECRET

            if (!secret && !publicKey) {
                throw new Error('JWT mode requires either JWT_SECRET or JWT_PUBLIC_KEY/JWT_PUBLIC_KEY_FILE')
            }

            return new JwtAuthProvider({
                mode: 'jwt',
                adminRoleName,
                jwt: {
                    secret,
                    publicKey,
                    algorithm: process.env.JWT_ALGORITHM || 'HS256',
                    issuer: process.env.JWT_ISSUER,
                    audience: process.env.JWT_AUDIENCE,
                    userIdClaim: process.env.JWT_USER_ID_CLAIM || 'sub',
                    rolesClaim: process.env.JWT_ROLES_CLAIM || 'roles'
                }
            })
        }

        throw new Error(`Unknown AUTH_MODE: ${mode}`)
    }
}
