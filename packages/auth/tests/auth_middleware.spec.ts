import { test } from '@japa/runner'
import { AuthMiddleware } from '../src/auth_middleware.js'
import { GatewayAuthProvider } from '../src/providers/gateway_auth_provider.js'
import { NoAuthProvider } from '../src/providers/no_auth_provider.js'
import { UserService } from '../src/user_service.js'
import type { AuthProvider } from '../src/auth_provider.js'
import type { AuthenticatedUser, UserRecord, UserRepository } from '@cepseudo/shared'

/** In-memory UserRepository for tests */
function createMockUserRepository(): UserRepository {
    const users = new Map<string, UserRecord>()
    let nextId = 1

    return {
        async initializeTables() {},
        async findOrCreateUser(authUser: AuthenticatedUser): Promise<UserRecord> {
            const existing = users.get(authUser.subject)
            if (existing) {
                existing.roles = authUser.roles
                return existing
            }
            const record: UserRecord = {
                id: nextId++,
                keycloak_id: authUser.subject,
                roles: authUser.roles,
                created_at: new Date(),
                updated_at: new Date()
            }
            users.set(authUser.subject, record)
            return record
        },
        async getUserById(id: number) {
            return [...users.values()].find(u => u.id === id)
        },
        async getUserByKeycloakId(keycloakId: string) {
            return users.get(keycloakId)
        }
    }
}

function gatewayMiddleware(repository = createMockUserRepository(), adminRole?: string) {
    return new AuthMiddleware(new GatewayAuthProvider(), new UserService(repository), { adminRole })
}

test.group('AuthMiddleware', (group) => {
    group.each.setup(() => {
        process.env.AUTH_MODE = 'gateway'
    })
    group.teardown(() => {
        process.env.AUTH_MODE = 'none'
    })

    test('the provider decides who the caller is', async ({ assert }) => {
        const middleware = new AuthMiddleware(new NoAuthProvider('dev'), new UserService(createMockUserRepository()))

        const result = await middleware.authenticate({ headers: {} })

        assert.isTrue(result.success)
        if (result.success) {
            assert.equal(result.user.keycloak_id, 'dev')
            assert.deepEqual(result.user.roles, ['anonymous'])
            assert.isFalse(result.isAdmin)
        }
    })

    test('valid headers return success with the persisted user', async ({ assert }) => {
        const middleware = gatewayMiddleware()

        const result = await middleware.authenticate({
            headers: { 'x-user-id': 'uuid-123', 'x-user-roles': 'user, admin' }
        })

        assert.isTrue(result.success)
        if (result.success) {
            assert.isDefined(result.user.id)
            assert.equal(result.user.keycloak_id, 'uuid-123')
            assert.includeMembers(result.user.roles, ['user', 'admin'])
        }
    })

    test('isAdmin is computed once from the configured role', async ({ assert }) => {
        const asAdmin = await gatewayMiddleware().authenticate({ headers: { 'x-user-id': 'u1', 'x-user-roles': 'user,admin' } })
        const asUser = await gatewayMiddleware().authenticate({ headers: { 'x-user-id': 'u1', 'x-user-roles': 'user' } })
        const customRole = await gatewayMiddleware(undefined, 'superadmin').authenticate({ headers: { 'x-user-id': 'u1', 'x-user-roles': 'admin' } })

        assert.isTrue(asAdmin.success && asAdmin.isAdmin)
        assert.isTrue(asUser.success && !asUser.isAdmin)
        assert.isTrue(customRole.success && !customRole.isAdmin)
    })

    test('a provider that returns null yields 401', async ({ assert }) => {
        const middleware = gatewayMiddleware()

        const missing = await middleware.authenticate({ headers: {} })
        const empty = await middleware.authenticate({ headers: { 'x-user-id': '', 'x-user-roles': 'user' } })
        const noHeaders = await middleware.authenticate({})

        for (const result of [missing, empty, noHeaders]) {
            assert.isFalse(result.success)
            if (!result.success) {
                assert.equal(result.response.status, 401)
            }
        }
    })

    test('the provider is awaited', async ({ assert }) => {
        const slow: AuthProvider = {
            authenticate: () => new Promise(resolve => setTimeout(() => resolve({ subject: 'late', roles: [] }), 5))
        }
        const middleware = new AuthMiddleware(slow, new UserService(createMockUserRepository()))

        const result = await middleware.authenticate({ headers: {} })

        assert.isTrue(result.success && result.user.keycloak_id === 'late')
    })

    test('UserService error propagates', async ({ assert }) => {
        const failingRepo: UserRepository = {
            async initializeTables() {},
            async findOrCreateUser() { throw new Error('DB connection failed') },
            async getUserById() { return undefined },
            async getUserByKeycloakId() { return undefined }
        }
        const middleware = gatewayMiddleware(failingRepo)

        await assert.rejects(
            () => middleware.authenticate({ headers: { 'x-user-id': 'uuid-123', 'x-user-roles': 'user' } }),
            /DB connection failed/
        )
    })

    test('x-user-id only (no roles) returns success with empty roles', async ({ assert }) => {
        const result = await gatewayMiddleware().authenticate({ headers: { 'x-user-id': 'uuid-456' } })

        assert.isTrue(result.success)
        if (result.success) {
            assert.equal(result.user.keycloak_id, 'uuid-456')
            assert.deepEqual(result.user.roles, [])
        }
    })

    test('repeated calls for same user return consistent id', async ({ assert }) => {
        const middleware = gatewayMiddleware()
        const headers = { 'x-user-id': 'uuid-789', 'x-user-roles': 'user' }

        const first = await middleware.authenticate({ headers })
        const second = await middleware.authenticate({ headers })

        assert.isTrue(first.success && second.success)
        if (first.success && second.success) {
            assert.equal(first.user.id, second.user.id)
        }
    })
})

test.group('AuthMiddleware.identify', () => {
    test('returns the caller resolved by the provider without touching the repository', async ({ assert }) => {
        const failingRepo: UserRepository = {
            async initializeTables() {},
            async findOrCreateUser() { throw new Error('must not be called') },
            async getUserById() { return undefined },
            async getUserByKeycloakId() { return undefined }
        }
        const middleware = gatewayMiddleware(failingRepo)

        const user = await middleware.identify({ 'x-user-id': 'uuid-1', 'x-user-roles': 'admin,user' })

        assert.deepEqual(user, { subject: 'uuid-1', roles: ['admin', 'user'] })
    })

    test('returns undefined without valid credentials', async ({ assert }) => {
        const middleware = gatewayMiddleware()

        assert.isUndefined(await middleware.identify({}))
        assert.isUndefined(await middleware.identify({ 'x-user-roles': 'admin' }))
    })
})
