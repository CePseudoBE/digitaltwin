import type { UserRecord } from './auth.js'
import type { DataResponse } from './http.js'

/**
 * Discriminated union for authentication results.
 *
 * Used by AuthMiddleware.authenticate() to return either
 * a successful result with the user record, or a failure
 * with a ready-to-send HTTP error response.
 *
 * @example
 * ```typescript
 * const result = await authMiddleware.authenticate(req)
 * if (!result.success) {
 *     return result.response
 * }
 * const user = result.userRecord
 * ```
 */
export type AuthResult =
    | { success: true; userRecord: UserRecord }
    | { success: false; response: DataResponse }
