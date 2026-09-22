import type { AuthenticatedUser, AuthResult } from '@cepseudo/shared'
import { unauthorizedResponse, errorResponse } from '@cepseudo/shared'
import type { AuthProvider, AuthRequest } from './auth_provider.js'
import type { UserService } from './user_service.js'

export interface AuthMiddlewareOptions {
    /** Role that grants access to every resource (default: 'admin') */
    adminRole?: string
}

/**
 * Centralized authentication middleware for all components.
 *
 * The provider reads the credentials, the user service persists the caller.
 * Components never touch headers themselves.
 *
 * @example
 * ```typescript
 * const result = await authMiddleware.authenticate(req)
 * if (!result.success) {
 *     return result.response
 * }
 * const owner = result.user
 * if (result.isAdmin) { ... }
 * ```
 */
export class AuthMiddleware {
    readonly #provider: AuthProvider
    readonly #users: UserService
    readonly #adminRole: string

    constructor(provider: AuthProvider, users: UserService, options: AuthMiddlewareOptions = {}) {
        this.#provider = provider
        this.#users = users
        this.#adminRole = options.adminRole ?? 'admin'
    }

    /**
     * Reads the caller's identity from the request headers without touching the database.
     * Returns undefined when the request carries no valid credentials; components that
     * need the database record keep calling `authenticate()`.
     */
    async identify(headers: AuthRequest['headers']): Promise<AuthenticatedUser | undefined> {
        return (await this.#provider.authenticate({ headers })) ?? undefined
    }

    /** Authenticates the request and returns the persisted user, or a ready-to-send error response. */
    async authenticate(req: { headers?: AuthRequest['headers'] }): Promise<AuthResult> {
        const authUser = await this.#provider.authenticate({ headers: req.headers ?? {} })
        if (!authUser) {
            return { success: false, response: unauthorizedResponse() }
        }

        const user = await this.#users.findOrCreateUser(authUser)
        if (!user.id) {
            return { success: false, response: errorResponse('Failed to retrieve user information') }
        }

        return { success: true, user, isAdmin: authUser.roles.includes(this.#adminRole) }
    }
}
