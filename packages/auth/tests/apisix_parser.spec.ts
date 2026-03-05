import { test } from '@japa/runner'
import { ApisixAuthParser } from '../src/apisix_parser.js'
import { AuthConfig } from '../src/auth_config.js'

function enableAuth() {
    delete process.env.DIGITALTWIN_DISABLE_AUTH
    delete process.env.AUTH_MODE
    AuthConfig._resetConfig()
    ApisixAuthParser._resetProvider()
}

function disableAuth() {
    process.env.DIGITALTWIN_DISABLE_AUTH = 'true'
    AuthConfig._resetConfig()
    ApisixAuthParser._resetProvider()
}

test.group('ApisixAuthParser', (group) => {
    group.each.setup(() => enableAuth())
    group.teardown(() => disableAuth())

    test('complete headers are parsed correctly with trimmed roles', ({ assert }) => {
        const user = ApisixAuthParser.parseAuthHeaders({
            'x-user-id': 'uuid-abc',
            'x-user-roles': ' admin , user , editor '
        })

        assert.isNotNull(user)
        assert.equal(user!.id, 'uuid-abc')
        assert.deepEqual(user!.roles, ['admin', 'user', 'editor'])
    })

    test('missing x-user-id returns null', ({ assert }) => {
        const user = ApisixAuthParser.parseAuthHeaders({
            'x-user-roles': 'admin'
        })

        assert.isNull(user)
    })

    test('isAdmin() returns true when user has admin role', ({ assert }) => {
        const headers = { 'x-user-id': 'uuid-1', 'x-user-roles': 'user,admin' }
        assert.isTrue(ApisixAuthParser.isAdmin(headers))
    })

    test('isAdmin() returns false when user lacks admin role', ({ assert }) => {
        const headers = { 'x-user-id': 'uuid-1', 'x-user-roles': 'user,editor' }
        assert.isFalse(ApisixAuthParser.isAdmin(headers))
    })

    test('auth disabled returns anonymous user', ({ assert }) => {
        disableAuth()

        const user = ApisixAuthParser.parseAuthHeaders({})

        assert.isNotNull(user)
        assert.equal(user!.id, 'anonymous')
        assert.isTrue(ApisixAuthParser.hasValidAuth({}))
    })
})
