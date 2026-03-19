/**
 * Auth helpers for E2E tests.
 *
 * Builds fake TypedRequest objects with x-user-id / x-user-roles headers.
 * Uses db.getUserRepository().findOrCreateUser() to ensure user exists in the database.
 */
import type { DatabaseAdapter } from '@cepseudo/database'
import type { UserRecord } from '@cepseudo/shared'

interface FakeRequestOverrides {
    params?: Record<string, string>
    body?: Record<string, unknown>
    query?: Record<string, string>
    file?: {
        path?: string
        buffer?: Buffer
        originalname?: string
        mimetype?: string
        size?: number
    }
}

/**
 * Create a fake HTTP request that mimics an authenticated user.
 *
 * When DIGITALTWIN_DISABLE_AUTH=true (set by setup.ts), the AuthMiddleware
 * creates an anonymous user automatically. This helper is still useful for
 * testing ownership scenarios where we need specific user IDs.
 */
export async function makeAuthRequest(
    db: DatabaseAdapter,
    keycloakId: string,
    roles: string[] = ['user'],
    overrides: FakeRequestOverrides = {}
): Promise<{ headers: Record<string, string>; params: Record<string, string>; body: Record<string, unknown>; query: Record<string, string>; file?: FakeRequestOverrides['file']; userRecord: UserRecord }> {
    // Ensure user exists in the database
    const userRecord = await db.getUserRepository().findOrCreateUser({
        id: keycloakId,
        roles,
    })

    return {
        headers: {
            'x-user-id': keycloakId,
            'x-user-roles': roles.join(','),
        },
        params: overrides.params || {},
        body: overrides.body || {},
        query: overrides.query || {},
        file: overrides.file,
        userRecord,
    }
}
