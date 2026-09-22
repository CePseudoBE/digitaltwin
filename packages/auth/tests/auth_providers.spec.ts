import { test } from '@japa/runner'
import jwt from 'jsonwebtoken'
import { GatewayAuthProvider } from '../src/providers/gateway_auth_provider.js'
import { JwtAuthProvider } from '../src/providers/jwt_auth_provider.js'
import { NoAuthProvider } from '../src/providers/no_auth_provider.js'
import { AuthProviderFactory } from '../src/auth_provider_factory.js'

const JWT_SECRET = 'test-secret-key-256-bits-long!!'

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

test.group('JwtAuthProvider', () => {
    test('rejects invalid token', async ({ assert }) => {
        const provider = new JwtAuthProvider({ mode: 'jwt', jwt: { secret: JWT_SECRET } })

        const user = await provider.authenticate({
            headers: { authorization: 'Bearer invalid.token.here' }
        })

        assert.isNull(user)
    })

    test('rejects expired token', async ({ assert }) => {
        const token = jwt.sign({ sub: 'user-1', roles: ['user'] }, JWT_SECRET, { expiresIn: -10 })
        const provider = new JwtAuthProvider({ mode: 'jwt', jwt: { secret: JWT_SECRET } })

        const user = await provider.authenticate({
            headers: { authorization: `Bearer ${token}` }
        })

        assert.isNull(user)
    })

    test('accepts valid token and extracts claims', async ({ assert }) => {
        const token = jwt.sign({ sub: 'user-42', roles: ['user', 'editor'] }, JWT_SECRET, { expiresIn: '1h' })
        const provider = new JwtAuthProvider({ mode: 'jwt', jwt: { secret: JWT_SECRET } })

        const user = await provider.authenticate({
            headers: { authorization: `Bearer ${token}` }
        })

        assert.isNotNull(user)
        assert.equal(user!.subject, 'user-42')
        assert.deepEqual(user!.roles, ['user', 'editor'])
        assert.equal(user!.claims?.sub, 'user-42')
    })
})

test.group('NoAuthProvider', () => {
    test('always returns anonymous user', async ({ assert }) => {
        const provider = new NoAuthProvider()

        const user = await provider.authenticate({ headers: {} })

        assert.deepEqual(user, { subject: 'anonymous', roles: ['anonymous'] })
    })
})

test.group('AuthProviderFactory', (group) => {
    group.each.setup(() => {
        delete process.env.AUTH_MODE
        delete process.env.JWT_SECRET
        delete process.env.DIGITALTWIN_DISABLE_AUTH
    })
    group.teardown(() => {
        process.env.DIGITALTWIN_DISABLE_AUTH = 'true'
    })

    test('creates correct provider for each mode', ({ assert }) => {
        const gateway = AuthProviderFactory.create({ mode: 'gateway' })
        assert.instanceOf(gateway, GatewayAuthProvider)

        const jwt = AuthProviderFactory.create({ mode: 'jwt', jwt: { secret: JWT_SECRET } })
        assert.instanceOf(jwt, JwtAuthProvider)

        const none = AuthProviderFactory.create({ mode: 'none' })
        assert.instanceOf(none, NoAuthProvider)
    })

    test('fromEnv() with DIGITALTWIN_DISABLE_AUTH creates NoAuthProvider', ({ assert }) => {
        process.env.DIGITALTWIN_DISABLE_AUTH = 'true'

        const provider = AuthProviderFactory.fromEnv()

        assert.instanceOf(provider, NoAuthProvider)
    })
})
