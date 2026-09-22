/**
 * The caller as resolved by an `AuthProvider`.
 *
 * Providers read credentials (gateway headers, a Bearer token, nothing at all)
 * and normalise them into this shape. The middleware then persists the user
 * and decides whether the caller is an admin.
 */
export interface AuthenticatedUser {
    /** Stable identifier of the caller at the identity provider (`sub` in OIDC) */
    subject: string
    /** Roles granted to the caller */
    roles: string[]
    /** Raw claims the provider had access to, for components that need more than roles */
    claims?: Record<string, unknown>
}

/**
 * User record stored in the database.
 *
 * Users are created automatically the first time an authenticated caller
 * reaches a component; their roles are synchronised on every request.
 */
export interface UserRecord {
    /** Primary key (auto-increment) */
    id?: number
    /** Subject of the caller at the identity provider (unique across system) */
    keycloak_id: string
    /** User roles (populated from user_roles junction table) */
    roles: string[]
    /** First time the user was seen in the system */
    created_at: Date
    /** Last time the user's roles were updated */
    updated_at: Date
}
