import { test } from '@japa/runner'
import { UserService } from '../src/user_service.js'
import { AuthConfig } from '../src/auth_config.js'
import { ApisixAuthParser } from '../src/apisix_parser.js'
import type { AuthenticatedUser, UserRecord, UserRepository } from '@digitaltwin/shared'

/** In-memory UserRepository for testing UserService in isolation */
function createInMemoryUserRepository(): UserRepository {
    const users = new Map<string, UserRecord>()
    let nextId = 1

    return {
        async initializeTables() {},
        async findOrCreateUser(authUser: AuthenticatedUser): Promise<UserRecord> {
            const existing = users.get(authUser.id)
            if (existing) {
                existing.roles = authUser.roles
                existing.updated_at = new Date()
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

function ensureAuthEnabled() {
    delete process.env.DIGITALTWIN_DISABLE_AUTH
    delete process.env.DIGITALTWIN_ANONYMOUS_USER_ID
    AuthConfig._resetConfig()
    ApisixAuthParser._resetProvider()
}

function restoreTestEnv() {
    process.env.DIGITALTWIN_DISABLE_AUTH = 'true'
    AuthConfig._resetConfig()
    ApisixAuthParser._resetProvider()
}

test.group('UserService', (group) => {
    group.each.setup(() => ensureAuthEnabled())
    group.teardown(() => restoreTestEnv())

    test('initializeTables() delegates to repository without error', async ({ assert }) => {
        const userService = new UserService(createInMemoryUserRepository())
        await assert.doesNotThrow(() => userService.initializeTables())
    })

    test('findOrCreateUser() creates new user when not exists', async ({ assert }) => {
        const userService = new UserService(createInMemoryUserRepository())
        const authUser: AuthenticatedUser = { id: '12345-abcde', roles: ['user', 'admin'] }

        const result = await userService.findOrCreateUser(authUser)

        assert.equal(result.keycloak_id, '12345-abcde')
        assert.isDefined(result.id)
        assert.isNumber(result.id)
    })

    test('findOrCreateUser() returns existing user when found', async ({ assert }) => {
        const userService = new UserService(createInMemoryUserRepository())
        const authUser: AuthenticatedUser = { id: '12345-abcde', roles: ['user'] }

        const firstResult = await userService.findOrCreateUser(authUser)
        const secondResult = await userService.findOrCreateUser(authUser)

        assert.equal(secondResult.keycloak_id, '12345-abcde')
        assert.equal(secondResult.id, firstResult.id)
    })

    test('findOrCreateUser() syncs roles', async ({ assert }) => {
        const userService = new UserService(createInMemoryUserRepository())
        const authUser: AuthenticatedUser = { id: '12345-abcde', roles: ['user', 'admin'] }

        const result = await userService.findOrCreateUser(authUser)

        assert.equal(result.keycloak_id, '12345-abcde')
        assert.isArray(result.roles)
        assert.includeMembers(result.roles, ['user', 'admin'])
    })

    test('getUserById() returns user with roles', async ({ assert }) => {
        const userService = new UserService(createInMemoryUserRepository())
        const authUser: AuthenticatedUser = { id: '12345-abcde', roles: ['user', 'admin'] }
        const created = await userService.findOrCreateUser(authUser)

        const result = await userService.getUserById(created.id!)

        assert.isDefined(result)
        assert.equal(result!.id, created.id)
        assert.equal(result!.keycloak_id, '12345-abcde')
    })

    test('getUserById() returns undefined when not found', async ({ assert }) => {
        const userService = new UserService(createInMemoryUserRepository())

        const result = await userService.getUserById(999)

        assert.isUndefined(result)
    })

    test('getUserByKeycloakId() finds user by keycloak ID', async ({ assert }) => {
        const userService = new UserService(createInMemoryUserRepository())
        await userService.findOrCreateUser({ id: '12345-abcde', roles: ['user'] })

        const result = await userService.getUserByKeycloakId('12345-abcde')

        assert.isDefined(result)
        assert.equal(result!.keycloak_id, '12345-abcde')
    })
})
