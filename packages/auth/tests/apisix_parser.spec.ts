import { test } from '@japa/runner'
import { ApisixAuthParser } from '../src/apisix_parser.js'

function enableAuth() {
    process.env.AUTH_MODE = 'gateway'
}

function disableAuth() {
    process.env.AUTH_MODE = 'none'
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
        assert.equal(user!.subject, 'uuid-abc')
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

    test('outside the header modes nothing is parsed, so a client cannot claim a role', ({ assert }) => {
        const headers = { 'x-user-id': 'uuid-1', 'x-user-roles': 'admin' }

        for (const mode of ['none', 'oidc']) {
            process.env.AUTH_MODE = mode
            assert.isNull(ApisixAuthParser.parseAuthHeaders(headers))
            assert.isFalse(ApisixAuthParser.hasValidAuth(headers))
            assert.isFalse(ApisixAuthParser.isAdmin(headers))
        }
    })

    test('trusted-headers mode honours the configured names and the secret', ({ assert }) => {
        process.env.AUTH_MODE = 'trusted-headers'
        process.env.AUTH_HEADER_SUBJECT = 'x-forwarded-user'
        process.env.AUTH_HEADER_ROLES = 'x-forwarded-groups'
        process.env.AUTH_HEADER_SECRET = 'k'
        try {
            const identity = { 'x-forwarded-user': 'alice', 'x-forwarded-groups': 'admin' }
            assert.isFalse(ApisixAuthParser.isAdmin(identity))
            assert.isTrue(ApisixAuthParser.isAdmin({ ...identity, 'x-auth-secret': 'k' }))
            assert.isFalse(ApisixAuthParser.isAdmin({ 'x-user-id': 'alice', 'x-user-roles': 'admin', 'x-auth-secret': 'k' }))
        } finally {
            delete process.env.AUTH_HEADER_SUBJECT
            delete process.env.AUTH_HEADER_ROLES
            delete process.env.AUTH_HEADER_SECRET
        }
    })

    test('the admin role name comes from AUTH_ADMIN_ROLE', ({ assert }) => {
        process.env.AUTH_ADMIN_ROLE = 'operator'
        try {
            assert.isTrue(ApisixAuthParser.isAdmin({ 'x-user-id': 'u', 'x-user-roles': 'operator' }))
            assert.isFalse(ApisixAuthParser.isAdmin({ 'x-user-id': 'u', 'x-user-roles': 'admin' }))
        } finally {
            delete process.env.AUTH_ADMIN_ROLE
        }
    })
})
