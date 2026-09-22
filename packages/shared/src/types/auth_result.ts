import type { UserRecord } from './auth.js'
import type { DataResponse } from './http.js'

/**
 * Discriminated union for authentication results.
 *
 * Returned by AuthMiddleware.authenticate(): either the persisted user with the
 * admin decision already taken, or a ready-to-send HTTP error response.
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
export type AuthResult =
    | { success: true; user: UserRecord; isAdmin: boolean }
    | { success: false; response: DataResponse }
