import { test } from '@japa/runner'
import { ApisixAuthParser, AuthConfig } from '../../src/auth/index.js'

// Helper function to restore test environment (auth disabled)
function restoreTestEnv() {
    process.env.DIGITALTWIN_DISABLE_AUTH = 'true'
    AuthConfig._resetConfig()
    ApisixAuthParser._resetProvider()
}

test.group('Auth Bypass', group => {
    // Restore auth disabled state after all tests
    group.teardown(() => {
        restoreTestEnv()
    })
    test('should bypass auth when DIGITALTWIN_DISABLE_AUTH=true', ({ assert }) => {
        // Setup: disable auth
        process.env.DIGITALTWIN_DISABLE_AUTH = 'true'
        process.env.DIGITALTWIN_ANONYMOUS_USER_ID = 'test-user'
        AuthConfig._resetConfig()
        ApisixAuthParser._resetProvider()

        // Empty headers should be valid
        const emptyHeaders = {}
        assert.isTrue(ApisixAuthParser.hasValidAuth(emptyHeaders))

        // Should return anonymous user
        const user = ApisixAuthParser.parseAuthHeaders(emptyHeaders)
        assert.isNotNull(user)
        assert.equal(user!.id, 'test-user')
        assert.deepEqual(user!.roles, ['anonymous'])

        // Cleanup
        delete process.env.DIGITALTWIN_DISABLE_AUTH
        delete process.env.DIGITALTWIN_ANONYMOUS_USER_ID
        AuthConfig._resetConfig()
        ApisixAuthParser._resetProvider()
    })

    test('should use default anonymous user when no custom ID provided', ({ assert }) => {
        // Setup: disable auth without custom user ID
        process.env.DIGITALTWIN_DISABLE_AUTH = 'true'
        delete process.env.DIGITALTWIN_ANONYMOUS_USER_ID
        AuthConfig._resetConfig()
        ApisixAuthParser._resetProvider()

        const user = ApisixAuthParser.parseAuthHeaders({})
        assert.isNotNull(user)
        assert.equal(user!.id, 'anonymous')
        assert.deepEqual(user!.roles, ['anonymous'])

        // Cleanup
        delete process.env.DIGITALTWIN_DISABLE_AUTH
        AuthConfig._resetConfig()
        ApisixAuthParser._resetProvider()
    })

    test('should work normally when auth is enabled', ({ assert }) => {
        // Setup: ensure auth is enabled
        delete process.env.DIGITALTWIN_DISABLE_AUTH
        delete process.env.DIGITALTWIN_ANONYMOUS_USER_ID
        AuthConfig._resetConfig()
        ApisixAuthParser._resetProvider()

        // Empty headers should not be valid
        const emptyHeaders = {}
        assert.isFalse(ApisixAuthParser.hasValidAuth(emptyHeaders))

        // Should return null for empty headers
        const user = ApisixAuthParser.parseAuthHeaders(emptyHeaders)
        assert.isNull(user)

        // Should work with valid headers
        const validHeaders = { 'x-user-id': '123', 'x-user-roles': 'admin,user' }
        assert.isTrue(ApisixAuthParser.hasValidAuth(validHeaders))
        const validUser = ApisixAuthParser.parseAuthHeaders(validHeaders)
        assert.isNotNull(validUser)
        assert.equal(validUser!.id, '123')
        assert.deepEqual(validUser!.roles, ['admin', 'user'])
    })
})
