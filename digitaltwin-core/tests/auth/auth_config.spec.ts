import { test } from '@japa/runner'
import { AuthConfig } from '../../src/auth/auth_config.js'

// Helper to save and restore environment variables
function saveEnv() {
    return {
        DIGITALTWIN_DISABLE_AUTH: process.env.DIGITALTWIN_DISABLE_AUTH,
        DIGITALTWIN_ANONYMOUS_USER_ID: process.env.DIGITALTWIN_ANONYMOUS_USER_ID,
        DIGITALTWIN_ADMIN_ROLE_NAME: process.env.DIGITALTWIN_ADMIN_ROLE_NAME
    }
}

function restoreEnv(saved: ReturnType<typeof saveEnv>) {
    if (saved.DIGITALTWIN_DISABLE_AUTH !== undefined) {
        process.env.DIGITALTWIN_DISABLE_AUTH = saved.DIGITALTWIN_DISABLE_AUTH
    } else {
        delete process.env.DIGITALTWIN_DISABLE_AUTH
    }

    if (saved.DIGITALTWIN_ANONYMOUS_USER_ID !== undefined) {
        process.env.DIGITALTWIN_ANONYMOUS_USER_ID = saved.DIGITALTWIN_ANONYMOUS_USER_ID
    } else {
        delete process.env.DIGITALTWIN_ANONYMOUS_USER_ID
    }

    if (saved.DIGITALTWIN_ADMIN_ROLE_NAME !== undefined) {
        process.env.DIGITALTWIN_ADMIN_ROLE_NAME = saved.DIGITALTWIN_ADMIN_ROLE_NAME
    } else {
        delete process.env.DIGITALTWIN_ADMIN_ROLE_NAME
    }

    AuthConfig._resetConfig()
}

test.group('AuthConfig.isAuthDisabled()', (group) => {
    let savedEnv: ReturnType<typeof saveEnv>

    group.setup(() => {
        savedEnv = saveEnv()
    })

    group.teardown(() => {
        restoreEnv(savedEnv)
    })

    group.each.setup(() => {
        AuthConfig._resetConfig()
    })

    test('should return false by default (auth enabled)', ({ assert }) => {
        delete process.env.DIGITALTWIN_DISABLE_AUTH
        AuthConfig._resetConfig()

        assert.isFalse(AuthConfig.isAuthDisabled())
    })

    test('should return true when DIGITALTWIN_DISABLE_AUTH=true', ({ assert }) => {
        process.env.DIGITALTWIN_DISABLE_AUTH = 'true'
        AuthConfig._resetConfig()

        assert.isTrue(AuthConfig.isAuthDisabled())
    })

    test('should return true when DIGITALTWIN_DISABLE_AUTH=1', ({ assert }) => {
        process.env.DIGITALTWIN_DISABLE_AUTH = '1'
        AuthConfig._resetConfig()

        assert.isTrue(AuthConfig.isAuthDisabled())
    })

    test('should return false when DIGITALTWIN_DISABLE_AUTH=false', ({ assert }) => {
        process.env.DIGITALTWIN_DISABLE_AUTH = 'false'
        AuthConfig._resetConfig()

        assert.isFalse(AuthConfig.isAuthDisabled())
    })

    test('should return false when DIGITALTWIN_DISABLE_AUTH=0', ({ assert }) => {
        process.env.DIGITALTWIN_DISABLE_AUTH = '0'
        AuthConfig._resetConfig()

        assert.isFalse(AuthConfig.isAuthDisabled())
    })
})

test.group('AuthConfig.isAuthEnabled()', (group) => {
    let savedEnv: ReturnType<typeof saveEnv>

    group.setup(() => {
        savedEnv = saveEnv()
    })

    group.teardown(() => {
        restoreEnv(savedEnv)
    })

    group.each.setup(() => {
        AuthConfig._resetConfig()
    })

    test('should return true by default', ({ assert }) => {
        delete process.env.DIGITALTWIN_DISABLE_AUTH
        AuthConfig._resetConfig()

        assert.isTrue(AuthConfig.isAuthEnabled())
    })

    test('should return false when auth is disabled', ({ assert }) => {
        process.env.DIGITALTWIN_DISABLE_AUTH = 'true'
        AuthConfig._resetConfig()

        assert.isFalse(AuthConfig.isAuthEnabled())
    })

    test('should be opposite of isAuthDisabled()', ({ assert }) => {
        process.env.DIGITALTWIN_DISABLE_AUTH = 'true'
        AuthConfig._resetConfig()

        assert.notEqual(AuthConfig.isAuthEnabled(), AuthConfig.isAuthDisabled())

        process.env.DIGITALTWIN_DISABLE_AUTH = 'false'
        AuthConfig._resetConfig()

        assert.notEqual(AuthConfig.isAuthEnabled(), AuthConfig.isAuthDisabled())
    })
})

test.group('AuthConfig.getAnonymousUserId()', (group) => {
    let savedEnv: ReturnType<typeof saveEnv>

    group.setup(() => {
        savedEnv = saveEnv()
    })

    group.teardown(() => {
        restoreEnv(savedEnv)
    })

    group.each.setup(() => {
        AuthConfig._resetConfig()
    })

    test('should return "anonymous" by default', ({ assert }) => {
        delete process.env.DIGITALTWIN_ANONYMOUS_USER_ID
        AuthConfig._resetConfig()

        assert.equal(AuthConfig.getAnonymousUserId(), 'anonymous')
    })

    test('should return custom user ID when configured', ({ assert }) => {
        process.env.DIGITALTWIN_ANONYMOUS_USER_ID = 'dev-user-123'
        AuthConfig._resetConfig()

        assert.equal(AuthConfig.getAnonymousUserId(), 'dev-user-123')
    })

    test('should return UUID-style user ID when configured', ({ assert }) => {
        process.env.DIGITALTWIN_ANONYMOUS_USER_ID = '550e8400-e29b-41d4-a716-446655440000'
        AuthConfig._resetConfig()

        assert.equal(AuthConfig.getAnonymousUserId(), '550e8400-e29b-41d4-a716-446655440000')
    })
})

test.group('AuthConfig.getAnonymousUser()', (group) => {
    let savedEnv: ReturnType<typeof saveEnv>

    group.setup(() => {
        savedEnv = saveEnv()
    })

    group.teardown(() => {
        restoreEnv(savedEnv)
    })

    group.each.setup(() => {
        AuthConfig._resetConfig()
    })

    test('should return user object with default ID', ({ assert }) => {
        delete process.env.DIGITALTWIN_ANONYMOUS_USER_ID
        AuthConfig._resetConfig()

        const user = AuthConfig.getAnonymousUser()

        assert.equal(user.id, 'anonymous')
        assert.deepEqual(user.roles, ['anonymous'])
    })

    test('should return user object with custom ID', ({ assert }) => {
        process.env.DIGITALTWIN_ANONYMOUS_USER_ID = 'custom-anon'
        AuthConfig._resetConfig()

        const user = AuthConfig.getAnonymousUser()

        assert.equal(user.id, 'custom-anon')
        assert.deepEqual(user.roles, ['anonymous'])
    })

    test('should always have anonymous role', ({ assert }) => {
        process.env.DIGITALTWIN_ANONYMOUS_USER_ID = 'any-user'
        AuthConfig._resetConfig()

        const user = AuthConfig.getAnonymousUser()

        assert.include(user.roles, 'anonymous')
        assert.equal(user.roles.length, 1)
    })
})

test.group('AuthConfig.getAdminRoleName()', (group) => {
    let savedEnv: ReturnType<typeof saveEnv>

    group.setup(() => {
        savedEnv = saveEnv()
    })

    group.teardown(() => {
        restoreEnv(savedEnv)
    })

    group.each.setup(() => {
        AuthConfig._resetConfig()
    })

    test('should return "admin" by default', ({ assert }) => {
        delete process.env.DIGITALTWIN_ADMIN_ROLE_NAME
        AuthConfig._resetConfig()

        assert.equal(AuthConfig.getAdminRoleName(), 'admin')
    })

    test('should return custom admin role name when configured', ({ assert }) => {
        process.env.DIGITALTWIN_ADMIN_ROLE_NAME = 'administrator'
        AuthConfig._resetConfig()

        assert.equal(AuthConfig.getAdminRoleName(), 'administrator')
    })

    test('should support Keycloak-style role names', ({ assert }) => {
        process.env.DIGITALTWIN_ADMIN_ROLE_NAME = 'realm-admin'
        AuthConfig._resetConfig()

        assert.equal(AuthConfig.getAdminRoleName(), 'realm-admin')
    })

    test('should support role names with underscores', ({ assert }) => {
        process.env.DIGITALTWIN_ADMIN_ROLE_NAME = 'super_admin'
        AuthConfig._resetConfig()

        assert.equal(AuthConfig.getAdminRoleName(), 'super_admin')
    })
})

test.group('AuthConfig._resetConfig()', (group) => {
    let savedEnv: ReturnType<typeof saveEnv>

    group.setup(() => {
        savedEnv = saveEnv()
    })

    group.teardown(() => {
        restoreEnv(savedEnv)
    })

    test('should clear cached configuration', ({ assert }) => {
        // Set initial config
        process.env.DIGITALTWIN_DISABLE_AUTH = 'true'
        AuthConfig._resetConfig()
        assert.isTrue(AuthConfig.isAuthDisabled())

        // Change env and reset
        process.env.DIGITALTWIN_DISABLE_AUTH = 'false'
        AuthConfig._resetConfig()

        // Should read new value
        assert.isFalse(AuthConfig.isAuthDisabled())
    })

    test('should allow reconfiguration after reset', ({ assert }) => {
        // Initial configuration
        process.env.DIGITALTWIN_ANONYMOUS_USER_ID = 'user1'
        AuthConfig._resetConfig()
        assert.equal(AuthConfig.getAnonymousUserId(), 'user1')

        // Reconfigure
        process.env.DIGITALTWIN_ANONYMOUS_USER_ID = 'user2'
        AuthConfig._resetConfig()
        assert.equal(AuthConfig.getAnonymousUserId(), 'user2')
    })
})

test.group('AuthConfig caching behavior', (group) => {
    let savedEnv: ReturnType<typeof saveEnv>

    group.setup(() => {
        savedEnv = saveEnv()
    })

    group.teardown(() => {
        restoreEnv(savedEnv)
    })

    group.each.setup(() => {
        AuthConfig._resetConfig()
    })

    test('should cache configuration after first access', ({ assert }) => {
        process.env.DIGITALTWIN_DISABLE_AUTH = 'true'
        AuthConfig._resetConfig()

        // First access loads config
        const first = AuthConfig.isAuthDisabled()
        assert.isTrue(first)

        // Change env without reset
        process.env.DIGITALTWIN_DISABLE_AUTH = 'false'

        // Should still return cached value
        const second = AuthConfig.isAuthDisabled()
        assert.isTrue(second) // Still true because config is cached
    })

    test('should load config only once until reset', ({ assert }) => {
        process.env.DIGITALTWIN_ANONYMOUS_USER_ID = 'cached-user'
        AuthConfig._resetConfig()

        // First access
        assert.equal(AuthConfig.getAnonymousUserId(), 'cached-user')

        // Change env without reset
        process.env.DIGITALTWIN_ANONYMOUS_USER_ID = 'new-user'

        // Should return cached value
        assert.equal(AuthConfig.getAnonymousUserId(), 'cached-user')

        // Reset and verify new value
        AuthConfig._resetConfig()
        assert.equal(AuthConfig.getAnonymousUserId(), 'new-user')
    })
})

test.group('AuthConfig combined configuration', (group) => {
    let savedEnv: ReturnType<typeof saveEnv>

    group.setup(() => {
        savedEnv = saveEnv()
    })

    group.teardown(() => {
        restoreEnv(savedEnv)
    })

    group.each.setup(() => {
        AuthConfig._resetConfig()
    })

    test('should handle all options configured together', ({ assert }) => {
        process.env.DIGITALTWIN_DISABLE_AUTH = 'true'
        process.env.DIGITALTWIN_ANONYMOUS_USER_ID = 'test-user'
        process.env.DIGITALTWIN_ADMIN_ROLE_NAME = 'superadmin'
        AuthConfig._resetConfig()

        assert.isTrue(AuthConfig.isAuthDisabled())
        assert.isFalse(AuthConfig.isAuthEnabled())
        assert.equal(AuthConfig.getAnonymousUserId(), 'test-user')
        assert.equal(AuthConfig.getAdminRoleName(), 'superadmin')

        const anonUser = AuthConfig.getAnonymousUser()
        assert.equal(anonUser.id, 'test-user')
        assert.deepEqual(anonUser.roles, ['anonymous'])
    })

    test('should handle production-like configuration', ({ assert }) => {
        delete process.env.DIGITALTWIN_DISABLE_AUTH
        delete process.env.DIGITALTWIN_ANONYMOUS_USER_ID
        process.env.DIGITALTWIN_ADMIN_ROLE_NAME = 'realm-management'
        AuthConfig._resetConfig()

        assert.isFalse(AuthConfig.isAuthDisabled())
        assert.isTrue(AuthConfig.isAuthEnabled())
        assert.equal(AuthConfig.getAnonymousUserId(), 'anonymous')
        assert.equal(AuthConfig.getAdminRoleName(), 'realm-management')
    })

    test('should handle development configuration', ({ assert }) => {
        process.env.DIGITALTWIN_DISABLE_AUTH = 'true'
        process.env.DIGITALTWIN_ANONYMOUS_USER_ID = 'dev-user-local'
        delete process.env.DIGITALTWIN_ADMIN_ROLE_NAME
        AuthConfig._resetConfig()

        assert.isTrue(AuthConfig.isAuthDisabled())
        assert.equal(AuthConfig.getAnonymousUserId(), 'dev-user-local')
        assert.equal(AuthConfig.getAdminRoleName(), 'admin')
    })
})
