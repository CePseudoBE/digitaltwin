import type { AuthResult } from '@digitaltwin/shared'
import { unauthorizedResponse, errorResponse } from '@digitaltwin/shared'
import { AuthConfig } from './auth_config.js'
import { ApisixAuthParser } from './apisix_parser.js'
import type { UserService } from './user_service.js'

/**
 * Centralized authentication middleware for all components.
 *
 * Replaces the duplicated authenticateRequest/authenticateUser methods
 * found in AssetsManager, TilesetManager, MapManager, and CustomTableManager.
 *
 * @example
 * ```typescript
 * const result = await authMiddleware.authenticate(req)
 * if (!result.success) {
 *     return result.response
 * }
 * const userRecord = result.userRecord
 * ```
 */
export class AuthMiddleware {
    readonly #userService: UserService

    constructor(userService: UserService) {
        this.#userService = userService
    }

    /**
     * Authenticate a request and return the user record.
     *
     * Handles all auth modes:
     * - Auth disabled → creates anonymous user via UserService
     * - Gateway mode → parses APISIX headers
     * - JWT mode → validates Bearer token
     */
    async authenticate(req: { headers?: Record<string, string | string[] | undefined> }): Promise<AuthResult> {
        // If auth is disabled, create an anonymous user
        if (AuthConfig.isAuthDisabled()) {
            const anonymousUser = AuthConfig.getAnonymousUser()
            const userRecord = await this.#userService.findOrCreateUser(anonymousUser)
            return { success: true, userRecord }
        }

        if (!ApisixAuthParser.hasValidAuth(req.headers || {})) {
            return { success: false, response: unauthorizedResponse() }
        }

        const authUser = ApisixAuthParser.parseAuthHeaders(req.headers || {})
        if (!authUser) {
            return { success: false, response: unauthorizedResponse('Invalid authentication headers') }
        }

        const userRecord = await this.#userService.findOrCreateUser(authUser)
        if (!userRecord.id) {
            return { success: false, response: errorResponse('Failed to retrieve user information') }
        }

        return { success: true, userRecord }
    }
}
