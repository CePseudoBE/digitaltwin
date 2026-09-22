import { test } from '@japa/runner'
import { GatewayAuthProvider } from '../src/providers/gateway_auth_provider.js'
import { NoAuthProvider } from '../src/providers/no_auth_provider.js'

test.group('GatewayAuthProvider', () => {
    test('parses x-user-id and x-user-roles headers', async ({ assert }) => {
        const provider = new GatewayAuthProvider()
        const user = await provider.authenticate({
            headers: { 'x-user-id': 'uuid-1', 'x-user-roles': 'admin,user' }
        })

        assert.deepEqual(user, { subject: 'uuid-1', roles: ['admin', 'user'] })
    })

    test('takes the first value of a repeated header and returns null without a subject', async ({ assert }) => {
        const provider = new GatewayAuthProvider()

        const repeated = await provider.authenticate({ headers: { 'x-user-id': ['uuid-1', 'uuid-2'] } })
        const missing = await provider.authenticate({ headers: { 'x-user-roles': 'admin' } })

        assert.equal(repeated?.subject, 'uuid-1')
        assert.isNull(missing)
    })
})

test.group('NoAuthProvider', () => {
    test('always returns anonymous user', async ({ assert }) => {
        const provider = new NoAuthProvider()

        const user = await provider.authenticate({ headers: {} })

        assert.deepEqual(user, { subject: 'anonymous', roles: ['anonymous'] })
    })
})
