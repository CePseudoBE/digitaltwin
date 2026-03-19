import { test } from '@japa/runner'
import { AuthMiddleware } from '../src/auth_middleware.js'
import { AuthConfig } from '../src/auth_config.js'
import { ApisixAuthParser } from '../src/apisix_parser.js'
import { UserService } from '../src/user_service.js'
import type { AuthenticatedUser, UserRecord, UserRepository } from '@cepseudo/shared'

/** In-memory UserRepository for tests */
function createMockUserRepository(): UserRepository {
    const users = new Map<string, UserRecord>()
    let nextId = 1

    return {
        async initializeTables() {},
        async findOrCreateUser(authUser: AuthenticatedUser): Promise<UserRecord> {
            const existing = users.get(authUser.id)
            if (existing) {
                existing.roles = authUser.roles
                return existing
            }
            const record: UserRecord = {
                id: nextId++,
                keycloak_id: authUser.id,
                roles: authUser.roles,
                created_at: new Date(),
                updated_at: new Date()
            }
            users.set(authUser.id, record)
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

function enableAuth() {
    delete process.env.DIGITALTWIN_DISABLE_AUTH
    AuthConfig._resetConfig()
    ApisixAuthParser._resetProvider()
}

function disableAuth() {
    process.env.DIGITALTWIN_DISABLE_AUTH = 'true'
    AuthConfig._resetConfig()
    ApisixAuthParser._resetProvider()
}

test.group('AuthMiddleware', (group) => {
    group.teardown(() => {
        disableAuth()
    })

    test('auth disabled returns success with anonymous user', async ({ assert }) => {
        disableAuth()
        const middleware = new AuthMiddleware(new UserService(createMockUserRepository()))

        const result = await middleware.authenticate({ headers: {} })

        assert.isTrue(result.success)
        if (result.success) {
            assert.isDefined(result.userRecord)
            assert.equal(result.userRecord.keycloak_id, 'anonymous')
            assert.deepEqual(result.userRecord.roles, ['anonymous'])
        }
    })

    test('valid headers return success with userRecord', async ({ assert }) => {
        enableAuth()
        const middleware = new AuthMiddleware(new UserService(createMockUserRepository()))

        const result = await middleware.authenticate({
            headers: {
                'x-user-id': 'uuid-123',
                'x-user-roles': 'user, admin'
            }
        })

        assert.isTrue(result.success)
        if (result.success) {
            assert.isDefined(result.userRecord.id)
            assert.equal(result.userRecord.keycloak_id, 'uuid-123')
            assert.includeMembers(result.userRecord.roles, ['user', 'admin'])
        }
    })

    test('missing headers return 401', async ({ assert }) => {
        enableAuth()
        const middleware = new AuthMiddleware(new UserService(createMockUserRepository()))

        const result = await middleware.authenticate({ headers: {} })

        assert.isFalse(result.success)
        if (!result.success) {
            assert.equal(result.response.status, 401)
        }
    })

    test('empty x-user-id returns 401', async ({ assert }) => {
        enableAuth()
        const middleware = new AuthMiddleware(new UserService(createMockUserRepository()))

        const result = await middleware.authenticate({
            headers: { 'x-user-id': '', 'x-user-roles': 'user' }
        })

        assert.isFalse(result.success)
        if (!result.success) {
            assert.equal(result.response.status, 401)
        }
    })

    test('UserService error propagates', async ({ assert }) => {
        enableAuth()
        const failingRepo: UserRepository = {
            async initializeTables() {},
            async findOrCreateUser() { throw new Error('DB connection failed') },
            async getUserById() { return undefined },
            async getUserByKeycloakId() { return undefined }
        }
        const middleware = new AuthMiddleware(new UserService(failingRepo))

        await assert.rejects(
            () => middleware.authenticate({
                headers: { 'x-user-id': 'uuid-123', 'x-user-roles': 'user' }
            }),
            /DB connection failed/
        )
    })

    test('request without headers property returns 401', async ({ assert }) => {
        enableAuth()
        const middleware = new AuthMiddleware(new UserService(createMockUserRepository()))

        const result = await middleware.authenticate({} as any)

        assert.isFalse(result.success)
        if (!result.success) {
            assert.equal(result.response.status, 401)
        }
    })

    test('x-user-id only (no roles) returns success with empty roles', async ({ assert }) => {
        enableAuth()
        const middleware = new AuthMiddleware(new UserService(createMockUserRepository()))

        const result = await middleware.authenticate({
            headers: { 'x-user-id': 'uuid-456' }
        })

        assert.isTrue(result.success)
        if (result.success) {
            assert.equal(result.userRecord.keycloak_id, 'uuid-456')
            assert.deepEqual(result.userRecord.roles, [])
        }
    })

    test('repeated calls for same user return consistent id', async ({ assert }) => {
        enableAuth()
        const middleware = new AuthMiddleware(new UserService(createMockUserRepository()))
        const headers = { 'x-user-id': 'uuid-789', 'x-user-roles': 'user' }

        const first = await middleware.authenticate({ headers })
        const second = await middleware.authenticate({ headers })

        assert.isTrue(first.success && second.success)
        if (first.success && second.success) {
            assert.equal(first.userRecord.id, second.userRecord.id)
        }
    })
})
