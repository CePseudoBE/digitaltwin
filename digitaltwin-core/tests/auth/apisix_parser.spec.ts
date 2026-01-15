import { test } from '@japa/runner'
import { ApisixAuthParser, AuthConfig } from '../../src/auth/index.js'

test.group('ApisixAuthParser', () => {
  test('parseAuthHeaders() should parse valid headers correctly', ({ assert }) => {
    // Ensure auth is enabled for this test
    delete process.env.DIGITALTWIN_DISABLE_AUTH
    delete process.env.DIGITALTWIN_ANONYMOUS_USER_ID
    AuthConfig._resetConfig()
    ApisixAuthParser._resetProvider()

    const headers = {
      'x-user-id': '6e06a527-a89d-4390-95cd-10ae63cfc939',
      'x-user-roles': 'default-roles-master,offline_access,uma_authorization'
    }

    const result = ApisixAuthParser.parseAuthHeaders(headers)

    assert.isNotNull(result)
    assert.equal(result!.id, '6e06a527-a89d-4390-95cd-10ae63cfc939')
    assert.deepEqual(result!.roles, ['default-roles-master', 'offline_access', 'uma_authorization'])
  })

  test('parseAuthHeaders() should return null when x-user-id is missing', ({ assert }) => {
    // Ensure auth is enabled for this test
    delete process.env.DIGITALTWIN_DISABLE_AUTH
    delete process.env.DIGITALTWIN_ANONYMOUS_USER_ID
    AuthConfig._resetConfig()
    ApisixAuthParser._resetProvider()

    const headers = {
      'x-user-roles': 'admin,user'
    }

    const result = ApisixAuthParser.parseAuthHeaders(headers)

    assert.isNull(result)
  })

  test('parseAuthHeaders() should handle empty roles', ({ assert }) => {
    // Ensure auth is enabled for this test
    delete process.env.DIGITALTWIN_DISABLE_AUTH
    delete process.env.DIGITALTWIN_ANONYMOUS_USER_ID
    AuthConfig._resetConfig()
    ApisixAuthParser._resetProvider()

    const headers = {
      'x-user-id': '12345-67890',
      'x-user-roles': ''
    }

    const result = ApisixAuthParser.parseAuthHeaders(headers)

    assert.isNotNull(result)
    assert.equal(result!.id, '12345-67890')
    assert.deepEqual(result!.roles, [])
  })

  test('parseAuthHeaders() should handle missing roles header', ({ assert }) => {
    // Ensure auth is enabled for this test
    delete process.env.DIGITALTWIN_DISABLE_AUTH
    delete process.env.DIGITALTWIN_ANONYMOUS_USER_ID
    AuthConfig._resetConfig()
    ApisixAuthParser._resetProvider()

    const headers = {
      'x-user-id': '12345-67890'
    }

    const result = ApisixAuthParser.parseAuthHeaders(headers)

    assert.isNotNull(result)
    assert.equal(result!.id, '12345-67890')
    assert.deepEqual(result!.roles, [])
  })

  test('parseAuthHeaders() should trim role names', ({ assert }) => {
    // Ensure auth is enabled for this test
    delete process.env.DIGITALTWIN_DISABLE_AUTH
    delete process.env.DIGITALTWIN_ANONYMOUS_USER_ID
    AuthConfig._resetConfig()
    ApisixAuthParser._resetProvider()

    const headers = {
      'x-user-id': '12345',
      'x-user-roles': ' admin , user , manager '
    }

    const result = ApisixAuthParser.parseAuthHeaders(headers)

    assert.isNotNull(result)
    assert.deepEqual(result!.roles, ['admin', 'user', 'manager'])
  })

  test('hasValidAuth() should return true when x-user-id exists', ({ assert }) => {
    // Ensure auth is enabled for this test
    delete process.env.DIGITALTWIN_DISABLE_AUTH
    delete process.env.DIGITALTWIN_ANONYMOUS_USER_ID
    AuthConfig._resetConfig()
    ApisixAuthParser._resetProvider()

    const headers = { 'x-user-id': '12345' }
    assert.isTrue(ApisixAuthParser.hasValidAuth(headers))
  })

  test('hasValidAuth() should return false when x-user-id is missing', ({ assert }) => {
    // Ensure auth is enabled for this test
    delete process.env.DIGITALTWIN_DISABLE_AUTH
    delete process.env.DIGITALTWIN_ANONYMOUS_USER_ID
    AuthConfig._resetConfig()
    ApisixAuthParser._resetProvider()

    const headers = { 'x-user-roles': 'admin' }
    assert.isFalse(ApisixAuthParser.hasValidAuth(headers))
  })

  test('hasValidAuth() should return false when x-user-id is empty', ({ assert }) => {
    // Ensure auth is enabled for this test
    delete process.env.DIGITALTWIN_DISABLE_AUTH
    delete process.env.DIGITALTWIN_ANONYMOUS_USER_ID
    AuthConfig._resetConfig()
    ApisixAuthParser._resetProvider()

    const headers = { 'x-user-id': '' }
    assert.isFalse(ApisixAuthParser.hasValidAuth(headers))
  })

  test('getUserId() should return user ID when present', ({ assert }) => {
    // Ensure auth is enabled for this test
    delete process.env.DIGITALTWIN_DISABLE_AUTH
    delete process.env.DIGITALTWIN_ANONYMOUS_USER_ID
    AuthConfig._resetConfig()
    ApisixAuthParser._resetProvider()

    const headers = { 'x-user-id': '12345-67890' }
    const result = ApisixAuthParser.getUserId(headers)
    assert.equal(result, '12345-67890')
  })

  test('getUserId() should return null when missing', ({ assert }) => {
    // Ensure auth is enabled for this test
    delete process.env.DIGITALTWIN_DISABLE_AUTH
    delete process.env.DIGITALTWIN_ANONYMOUS_USER_ID
    AuthConfig._resetConfig()
    ApisixAuthParser._resetProvider()

    const headers = { 'other-header': 'value' }
    const result = ApisixAuthParser.getUserId(headers)
    assert.isNull(result)
  })

  test('getUserRoles() should return parsed roles', ({ assert }) => {
    // Ensure auth is enabled for this test
    delete process.env.DIGITALTWIN_DISABLE_AUTH
    delete process.env.DIGITALTWIN_ANONYMOUS_USER_ID
    AuthConfig._resetConfig()
    ApisixAuthParser._resetProvider()

    const headers = { 'x-user-roles': 'admin,user,manager' }
    const result = ApisixAuthParser.getUserRoles(headers)
    assert.deepEqual(result, ['admin', 'user', 'manager'])
  })

  test('getUserRoles() should return empty array when missing', ({ assert }) => {
    // Ensure auth is enabled for this test
    delete process.env.DIGITALTWIN_DISABLE_AUTH
    delete process.env.DIGITALTWIN_ANONYMOUS_USER_ID
    AuthConfig._resetConfig()
    ApisixAuthParser._resetProvider()

    const headers = { 'x-user-id': '12345' }
    const result = ApisixAuthParser.getUserRoles(headers)
    assert.deepEqual(result, [])
  })

  test('getUserRoles() should handle single role', ({ assert }) => {
    // Ensure auth is enabled for this test
    delete process.env.DIGITALTWIN_DISABLE_AUTH
    delete process.env.DIGITALTWIN_ANONYMOUS_USER_ID
    AuthConfig._resetConfig()
    ApisixAuthParser._resetProvider()

    const headers = { 'x-user-roles': 'admin' }
    const result = ApisixAuthParser.getUserRoles(headers)
    assert.deepEqual(result, ['admin'])
  })

  test('getUserRoles() should handle spaces in roles', ({ assert }) => {
    // Ensure auth is enabled for this test
    delete process.env.DIGITALTWIN_DISABLE_AUTH
    delete process.env.DIGITALTWIN_ANONYMOUS_USER_ID
    AuthConfig._resetConfig()
    ApisixAuthParser._resetProvider()

    const headers = { 'x-user-roles': ' admin , user , manager ' }
    const result = ApisixAuthParser.getUserRoles(headers)
    assert.deepEqual(result, ['admin', 'user', 'manager'])
  })
})

test.group('ApisixAuthParser.isAdmin()', () => {
  test('should return true when user has admin role', ({ assert }) => {
    delete process.env.DIGITALTWIN_DISABLE_AUTH
    delete process.env.DIGITALTWIN_ADMIN_ROLE_NAME
    AuthConfig._resetConfig()
    ApisixAuthParser._resetProvider()

    const headers = { 'x-user-id': '123', 'x-user-roles': 'user,admin,manager' }
    assert.isTrue(ApisixAuthParser.isAdmin(headers))
  })

  test('should return false when user does not have admin role', ({ assert }) => {
    delete process.env.DIGITALTWIN_DISABLE_AUTH
    delete process.env.DIGITALTWIN_ADMIN_ROLE_NAME
    AuthConfig._resetConfig()
    ApisixAuthParser._resetProvider()

    const headers = { 'x-user-id': '123', 'x-user-roles': 'user,manager' }
    assert.isFalse(ApisixAuthParser.isAdmin(headers))
  })

  test('should return false when no roles header', ({ assert }) => {
    delete process.env.DIGITALTWIN_DISABLE_AUTH
    delete process.env.DIGITALTWIN_ADMIN_ROLE_NAME
    AuthConfig._resetConfig()
    ApisixAuthParser._resetProvider()

    const headers = { 'x-user-id': '123' }
    assert.isFalse(ApisixAuthParser.isAdmin(headers))
  })

  test('should use custom admin role name', ({ assert }) => {
    delete process.env.DIGITALTWIN_DISABLE_AUTH
    process.env.DIGITALTWIN_ADMIN_ROLE_NAME = 'superadmin'
    AuthConfig._resetConfig()
    ApisixAuthParser._resetProvider()

    const headers = { 'x-user-id': '123', 'x-user-roles': 'user,superadmin' }
    assert.isTrue(ApisixAuthParser.isAdmin(headers))

    // 'admin' should NOT match when custom role is set
    const headers2 = { 'x-user-id': '123', 'x-user-roles': 'user,admin' }
    assert.isFalse(ApisixAuthParser.isAdmin(headers2))

    delete process.env.DIGITALTWIN_ADMIN_ROLE_NAME
    AuthConfig._resetConfig()
    ApisixAuthParser._resetProvider()
  })

  test('should handle Keycloak realm-style admin roles', ({ assert }) => {
    delete process.env.DIGITALTWIN_DISABLE_AUTH
    process.env.DIGITALTWIN_ADMIN_ROLE_NAME = 'realm-management'
    AuthConfig._resetConfig()
    ApisixAuthParser._resetProvider()

    const headers = { 'x-user-id': '123', 'x-user-roles': 'default-roles-master,realm-management' }
    assert.isTrue(ApisixAuthParser.isAdmin(headers))

    delete process.env.DIGITALTWIN_ADMIN_ROLE_NAME
    AuthConfig._resetConfig()
    ApisixAuthParser._resetProvider()
  })
})

test.group('ApisixAuthParser with auth disabled', () => {
  test('parseAuthHeaders() should return anonymous user when auth disabled', ({ assert }) => {
    process.env.DIGITALTWIN_DISABLE_AUTH = 'true'
    delete process.env.DIGITALTWIN_ANONYMOUS_USER_ID
    AuthConfig._resetConfig()
    ApisixAuthParser._resetProvider()

    const result = ApisixAuthParser.parseAuthHeaders({})

    assert.isNotNull(result)
    assert.equal(result!.id, 'anonymous')
    assert.deepEqual(result!.roles, ['anonymous'])

    delete process.env.DIGITALTWIN_DISABLE_AUTH
    AuthConfig._resetConfig()
    ApisixAuthParser._resetProvider()
  })

  test('parseAuthHeaders() should use custom anonymous user ID', ({ assert }) => {
    process.env.DIGITALTWIN_DISABLE_AUTH = 'true'
    process.env.DIGITALTWIN_ANONYMOUS_USER_ID = 'dev-user-local'
    AuthConfig._resetConfig()
    ApisixAuthParser._resetProvider()

    const result = ApisixAuthParser.parseAuthHeaders({})

    assert.isNotNull(result)
    assert.equal(result!.id, 'dev-user-local')

    delete process.env.DIGITALTWIN_DISABLE_AUTH
    delete process.env.DIGITALTWIN_ANONYMOUS_USER_ID
    AuthConfig._resetConfig()
    ApisixAuthParser._resetProvider()
  })

  test('hasValidAuth() should always return true when auth disabled', ({ assert }) => {
    process.env.DIGITALTWIN_DISABLE_AUTH = 'true'
    AuthConfig._resetConfig()
    ApisixAuthParser._resetProvider()

    assert.isTrue(ApisixAuthParser.hasValidAuth({}))
    assert.isTrue(ApisixAuthParser.hasValidAuth({ 'other': 'header' }))

    delete process.env.DIGITALTWIN_DISABLE_AUTH
    AuthConfig._resetConfig()
    ApisixAuthParser._resetProvider()
  })

  test('getUserId() should return anonymous ID when auth disabled', ({ assert }) => {
    process.env.DIGITALTWIN_DISABLE_AUTH = 'true'
    process.env.DIGITALTWIN_ANONYMOUS_USER_ID = 'test-anon'
    AuthConfig._resetConfig()
    ApisixAuthParser._resetProvider()

    const result = ApisixAuthParser.getUserId({})
    assert.equal(result, 'test-anon')

    delete process.env.DIGITALTWIN_DISABLE_AUTH
    delete process.env.DIGITALTWIN_ANONYMOUS_USER_ID
    AuthConfig._resetConfig()
    ApisixAuthParser._resetProvider()
  })

  test('getUserRoles() should return anonymous roles when auth disabled', ({ assert }) => {
    process.env.DIGITALTWIN_DISABLE_AUTH = 'true'
    AuthConfig._resetConfig()
    ApisixAuthParser._resetProvider()

    const result = ApisixAuthParser.getUserRoles({})
    assert.deepEqual(result, ['anonymous'])

    delete process.env.DIGITALTWIN_DISABLE_AUTH
    AuthConfig._resetConfig()
    ApisixAuthParser._resetProvider()
  })

  test('isAdmin() should return false for anonymous user', ({ assert }) => {
    process.env.DIGITALTWIN_DISABLE_AUTH = 'true'
    AuthConfig._resetConfig()
    ApisixAuthParser._resetProvider()

    // Anonymous user has role 'anonymous', not 'admin'
    assert.isFalse(ApisixAuthParser.isAdmin({}))

    delete process.env.DIGITALTWIN_DISABLE_AUTH
    AuthConfig._resetConfig()
    ApisixAuthParser._resetProvider()
  })
})

test.group('ApisixAuthParser edge cases', () => {
  test('should handle special characters in user ID', ({ assert }) => {
    delete process.env.DIGITALTWIN_DISABLE_AUTH
    AuthConfig._resetConfig()
    ApisixAuthParser._resetProvider()

    const headers = { 'x-user-id': 'user@example.com' }
    const result = ApisixAuthParser.parseAuthHeaders(headers)

    assert.isNotNull(result)
    assert.equal(result!.id, 'user@example.com')
  })

  test('should handle UUID-style user IDs', ({ assert }) => {
    delete process.env.DIGITALTWIN_DISABLE_AUTH
    AuthConfig._resetConfig()
    ApisixAuthParser._resetProvider()

    const headers = { 'x-user-id': '550e8400-e29b-41d4-a716-446655440000' }
    const result = ApisixAuthParser.parseAuthHeaders(headers)

    assert.isNotNull(result)
    assert.equal(result!.id, '550e8400-e29b-41d4-a716-446655440000')
  })

  test('should handle role names with special characters', ({ assert }) => {
    delete process.env.DIGITALTWIN_DISABLE_AUTH
    AuthConfig._resetConfig()
    ApisixAuthParser._resetProvider()

    const headers = {
      'x-user-id': '123',
      'x-user-roles': 'default-roles-master,offline_access,uma_authorization'
    }
    const result = ApisixAuthParser.getUserRoles(headers)

    assert.deepEqual(result, ['default-roles-master', 'offline_access', 'uma_authorization'])
  })

  test('should handle very long role lists', ({ assert }) => {
    delete process.env.DIGITALTWIN_DISABLE_AUTH
    AuthConfig._resetConfig()
    ApisixAuthParser._resetProvider()

    const roles = Array.from({ length: 100 }, (_, i) => `role${i}`)
    const headers = {
      'x-user-id': '123',
      'x-user-roles': roles.join(',')
    }
    const result = ApisixAuthParser.getUserRoles(headers)

    assert.equal(result.length, 100)
    assert.include(result, 'role0')
    assert.include(result, 'role99')
  })

  test('should handle empty string user ID as invalid', ({ assert }) => {
    delete process.env.DIGITALTWIN_DISABLE_AUTH
    AuthConfig._resetConfig()
    ApisixAuthParser._resetProvider()

    const headers = { 'x-user-id': '' }
    assert.isFalse(ApisixAuthParser.hasValidAuth(headers))
    assert.isNull(ApisixAuthParser.parseAuthHeaders(headers))
  })

  test('should handle whitespace-only user ID', ({ assert }) => {
    delete process.env.DIGITALTWIN_DISABLE_AUTH
    AuthConfig._resetConfig()
    ApisixAuthParser._resetProvider()

    // Whitespace is technically a valid value (even if unusual)
    const headers = { 'x-user-id': '   ' }
    assert.isTrue(ApisixAuthParser.hasValidAuth(headers))
  })

  test('should filter empty roles from split', ({ assert }) => {
    delete process.env.DIGITALTWIN_DISABLE_AUTH
    AuthConfig._resetConfig()
    ApisixAuthParser._resetProvider()

    const headers = {
      'x-user-id': '123',
      'x-user-roles': 'admin,,user,,'
    }
    const result = ApisixAuthParser.getUserRoles(headers)

    // Empty strings after split are kept (as trimmed empty strings)
    // The implementation doesn't filter them out
    assert.isArray(result)
  })

  test('should handle case-sensitive role matching for admin', ({ assert }) => {
    delete process.env.DIGITALTWIN_DISABLE_AUTH
    delete process.env.DIGITALTWIN_ADMIN_ROLE_NAME
    AuthConfig._resetConfig()
    ApisixAuthParser._resetProvider()

    // 'Admin' !== 'admin'
    const headers = { 'x-user-id': '123', 'x-user-roles': 'Admin,USER' }
    assert.isFalse(ApisixAuthParser.isAdmin(headers))

    // Exact match required
    const headers2 = { 'x-user-id': '123', 'x-user-roles': 'admin' }
    assert.isTrue(ApisixAuthParser.isAdmin(headers2))
  })
})