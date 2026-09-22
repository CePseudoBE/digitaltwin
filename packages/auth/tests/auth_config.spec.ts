import { test } from '@japa/runner'
import { AuthConfig } from '../src/auth_config.js'

function resetEnv() {
    delete process.env.DIGITALTWIN_DISABLE_AUTH
    delete process.env.DIGITALTWIN_ANONYMOUS_USER_ID
    delete process.env.DIGITALTWIN_ADMIN_ROLE_NAME
    delete process.env.AUTH_ADMIN_ROLE
    AuthConfig._resetConfig()
}

test.group('AuthConfig', (group) => {
    group.each.setup(() => resetEnv())
    group.teardown(() => {
        process.env.DIGITALTWIN_DISABLE_AUTH = 'true'
        AuthConfig._resetConfig()
    })

    test('defaults: auth enabled, anonymous="anonymous", admin="admin"', ({ assert }) => {
        assert.isTrue(AuthConfig.isAuthEnabled())
        assert.isFalse(AuthConfig.isAuthDisabled())
        assert.equal(AuthConfig.getAnonymousUserId(), 'anonymous')
        assert.equal(AuthConfig.getAdminRoleName(), 'admin')
    })

    test('custom config via env vars', ({ assert }) => {
        process.env.DIGITALTWIN_DISABLE_AUTH = 'true'
        process.env.DIGITALTWIN_ANONYMOUS_USER_ID = 'dev-user'
        process.env.DIGITALTWIN_ADMIN_ROLE_NAME = 'superadmin'
        AuthConfig._resetConfig()

        assert.isTrue(AuthConfig.isAuthDisabled())
        assert.equal(AuthConfig.getAnonymousUserId(), 'dev-user')
        assert.equal(AuthConfig.getAdminRoleName(), 'superadmin')
    })

    test('_resetConfig() clears cache and rereads env', ({ assert }) => {
        assert.isTrue(AuthConfig.isAuthEnabled())

        process.env.DIGITALTWIN_DISABLE_AUTH = 'true'
        AuthConfig._resetConfig()

        assert.isTrue(AuthConfig.isAuthDisabled())
    })

    test('AUTH_ADMIN_ROLE is honoured when DIGITALTWIN_ADMIN_ROLE_NAME is unset', ({ assert }) => {
        process.env.AUTH_ADMIN_ROLE = 'operator'
        AuthConfig._resetConfig()

        assert.equal(AuthConfig.getAdminRoleName(), 'operator')
    })

    test('getAnonymousUser() returns valid AuthenticatedUser', ({ assert }) => {
        const user = AuthConfig.getAnonymousUser()

        assert.equal(user.subject, 'anonymous')
        assert.isArray(user.roles)
        assert.deepEqual(user.roles, ['anonymous'])
    })
})
