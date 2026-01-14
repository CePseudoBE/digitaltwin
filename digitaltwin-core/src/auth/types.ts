/**
 * User information extracted from Keycloak JWT via Apache APISIX headers.
 *
 * This interface represents the authenticated user data parsed from APISIX
 * headers after Keycloak authentication. APISIX forwards these headers:
 * - `x-user-id`: The Keycloak user UUID
 * - `x-user-roles`: Comma-separated list of user roles
 *
 * @example
 * ```typescript
 * const authUser = ApisixAuthParser.parseAuthHeaders(req.headers)
 * if (authUser) {
 *   console.log(`User ${authUser.id} has roles: ${authUser.roles.join(', ')}`)
 * }
 * ```
 */
export interface AuthenticatedUser {
    /** User ID from Keycloak (x-user-id header) - UUID format */
    id: string
    /** User roles from Keycloak (x-user-roles header, parsed from comma-separated string) */
    roles: string[]
}

/**
 * User record stored in the database.
 *
 * Represents a user stored in the normalized user management system.
 * Users are created automatically when they first access the system
 * after being authenticated by Keycloak via APISIX.
 *
 * @example
 * ```typescript
 * const userService = new UserService(database)
 * const userRecord = await userService.findOrCreateUser(authenticatedUser)
 * console.log(`User ${userRecord.keycloak_id} has ${userRecord.roles.length} roles`)
 * ```
 */
export interface UserRecord {
    /** Primary key (auto-increment) */
    id?: number
    /** Keycloak user ID (UUID, unique across system) */
    keycloak_id: string
    /** User roles (populated from user_roles junction table) */
    roles: string[]
    /** First time the user was seen in the system */
    created_at: Date
    /** Last time the user's roles were updated */
    updated_at: Date
}

/**
 * Authentication context passed to handlers.
 *
 * Contains both the raw authentication data from APISIX headers
 * and the corresponding database user record. Used internally
 * by components that need full user context.
 *
 * @example
 * ```typescript
 * const authContext: AuthContext = {
 *   user: authUser,
 *   userRecord: await userService.findOrCreateUser(authUser)
 * }
 * ```
 */
export interface AuthContext {
    /** Authenticated user information from APISIX headers */
    user: AuthenticatedUser
    /** Database user record with full role information */
    userRecord: UserRecord
}

/**
 * Request object extended with authentication context.
 *
 * Represents an HTTP request that has been augmented with
 * authentication information. Used by handlers that need
 * access to both request data and user context.
 *
 * @example
 * ```typescript
 * async function handleRequest(req: AuthenticatedRequest) {
 *   if (req.auth) {
 *     console.log(`Request from user: ${req.auth.user.id}`)
 *   }
 * }
 * ```
 */
export interface AuthenticatedRequest {
    /** Original Express request object */
    originalRequest: any
    /** Authentication context (undefined if not authenticated) */
    auth?: AuthContext
    /** Request headers (including APISIX authentication headers) */
    headers: Record<string, string>
    /** URL parameters */
    params?: Record<string, string>
    /** Request body */
    body?: any
    /** File upload (for multipart requests with assets) */
    file?: any
}
