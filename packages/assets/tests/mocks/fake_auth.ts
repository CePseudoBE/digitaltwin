import { AuthMiddleware, UserService, type AuthProvider } from '@cepseudo/auth'
import type { DatabaseAdapter } from '@cepseudo/database'
import type { AuthenticatedUser } from '@cepseudo/shared'

export interface FakeAuth {
    middleware: AuthMiddleware
    /** Who the next requests come from; `null` makes them anonymous */
    actAs(subject: string | null, roles?: string[]): void
}

/** An AuthMiddleware whose caller is chosen by the test instead of read from headers. */
export function fakeAuth(db: DatabaseAdapter): FakeAuth {
    let caller: AuthenticatedUser | null = null
    const provider: AuthProvider = { authenticate: async () => caller }
    return {
        middleware: new AuthMiddleware(provider, new UserService(db.getUserRepository())),
        actAs(subject, roles = ['user']) {
            caller = subject ? { subject, roles } : null
        }
    }
}
