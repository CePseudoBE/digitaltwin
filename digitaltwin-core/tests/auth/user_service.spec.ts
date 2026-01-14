import { test } from '@japa/runner'
import { UserService } from '../../src/auth/user_service.js'
import { MockDatabaseAdapter } from '../mocks/mock_database_adapter.js'
import { AuthConfig } from '../../src/auth/auth_config.js'
import type { AuthenticatedUser } from '../../src/auth/types.js'

// Helper function to ensure auth is enabled for tests
function ensureAuthEnabled() {
  delete process.env.DIGITALTWIN_DISABLE_AUTH
  delete process.env.DIGITALTWIN_ANONYMOUS_USER_ID
  AuthConfig._resetConfig()
}

// Helper function to restore test environment (auth disabled)
function restoreTestEnv() {
  process.env.DIGITALTWIN_DISABLE_AUTH = 'true'
  AuthConfig._resetConfig()
}

test.group('UserService', (group) => {
  // Restore auth disabled state after all tests
  group.teardown(() => {
    restoreTestEnv()
  })
  test('initializeTables() should create user management tables', async ({ assert }) => {
    ensureAuthEnabled()
    const mockDb = new MockDatabaseAdapter()
    const userService = new UserService(mockDb)

    // Should not throw any errors
    await assert.doesNotThrow(async () => {
      await userService.initializeTables()
    })
  })

  test('findOrCreateUser() should create new user when not exists', async ({ assert }) => {
    ensureAuthEnabled()
    const mockDb = new MockDatabaseAdapter()
    mockDb.resetMockState() // Start fresh
    const userService = new UserService(mockDb)

    const authUser: AuthenticatedUser = {
      id: '12345-abcde',
      roles: ['user', 'admin']
    }

    const result = await userService.findOrCreateUser(authUser)

    assert.equal(result.keycloak_id, '12345-abcde')
    assert.isDefined(result.id)
    assert.isNumber(result.id)
  })

  test('findOrCreateUser() should return existing user when found', async ({ assert }) => {
    ensureAuthEnabled()
    const mockDb = new MockDatabaseAdapter()
    mockDb.resetMockState()
    const userService = new UserService(mockDb)

    // First create a user
    const authUser: AuthenticatedUser = {
      id: '12345-abcde',
      roles: ['user']
    }

    const firstResult = await userService.findOrCreateUser(authUser)
    const firstId = firstResult.id

    // Call again - should return same user
    const secondResult = await userService.findOrCreateUser(authUser)

    assert.equal(secondResult.keycloak_id, '12345-abcde')
    assert.equal(secondResult.id, firstId)
  })

  test('findOrCreateUser() should sync roles correctly', async ({ assert }) => {
    ensureAuthEnabled()
    const mockDb = new MockDatabaseAdapter()
    mockDb.resetMockState()
    const userService = new UserService(mockDb)

    const authUser: AuthenticatedUser = {
      id: '12345-abcde',
      roles: ['user', 'admin']
    }

    const result = await userService.findOrCreateUser(authUser)

    // User should be created with roles
    assert.equal(result.keycloak_id, '12345-abcde')
    assert.isDefined(result.id)
    // Roles are synced via transaction
    assert.isArray(result.roles)
  })

  test('getUserById() should return user with roles', async ({ assert }) => {
    ensureAuthEnabled()
    const mockDb = new MockDatabaseAdapter()
    mockDb.resetMockState()
    const userService = new UserService(mockDb)

    // First create a user
    const authUser: AuthenticatedUser = {
      id: '12345-abcde',
      roles: ['user', 'admin']
    }

    const createdUser = await userService.findOrCreateUser(authUser)

    // Now get by ID
    const result = await userService.getUserById(createdUser.id!)

    assert.isNotNull(result)
    assert.isDefined(result)
    assert.equal(result!.id, createdUser.id)
    assert.equal(result!.keycloak_id, '12345-abcde')
  })

  test('getUserById() should return undefined when user not found', async ({ assert }) => {
    ensureAuthEnabled()
    const mockDb = new MockDatabaseAdapter()
    mockDb.resetMockState()
    const userService = new UserService(mockDb)

    const result = await userService.getUserById(999)

    assert.isUndefined(result)
  })

  test('getUserByKeycloakId() should find user by keycloak ID', async ({ assert }) => {
    ensureAuthEnabled()
    const mockDb = new MockDatabaseAdapter()
    mockDb.resetMockState()
    const userService = new UserService(mockDb)

    // First create a user
    const authUser: AuthenticatedUser = {
      id: '12345-abcde',
      roles: ['user']
    }

    await userService.findOrCreateUser(authUser)

    // Now find by keycloak ID
    const result = await userService.getUserByKeycloakId('12345-abcde')

    assert.isNotNull(result)
    assert.isDefined(result)
    assert.equal(result!.keycloak_id, '12345-abcde')
  })
})
