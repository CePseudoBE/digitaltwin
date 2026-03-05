import { test } from '@japa/runner'
import jwt from 'jsonwebtoken'
import { GatewayAuthProvider } from '../src/providers/gateway_auth_provider.js'
import { JwtAuthProvider } from '../src/providers/jwt_auth_provider.js'
import { NoAuthProvider } from '../src/providers/no_auth_provider.js'
import { AuthProviderFactory } from '../src/auth_provider_factory.js'
import { AuthConfig } from '../src/auth_config.js'
import { ApisixAuthParser } from '../src/apisix_parser.js'

const JWT_SECRET = 'test-secret-key-256-bits-long!!'

test.group('GatewayAuthProvider', () => {
    test('parses x-user-id and x-user-roles headers', ({ assert }) => {
        const provider = new GatewayAuthProvider()
        const user = provider.parseRequest({
            headers: { 'x-user-id': 'uuid-1', 'x-user-roles': 'admin,user' }
        })

        assert.isNotNull(user)
        assert.equal(user!.id, 'uuid-1')
        assert.deepEqual(user!.roles, ['admin', 'user'])
    })
})

test.group('JwtAuthProvider', () => {
    test('rejects invalid token', ({ assert }) => {
        const provider = new JwtAuthProvider({ mode: 'jwt', jwt: { secret: JWT_SECRET } })

        const user = provider.parseRequest({
            headers: { authorization: 'Bearer invalid.token.here' }
        })

        assert.isNull(user)
    })

    test('rejects expired token', ({ assert }) => {
        const token = jwt.sign(
            { sub: 'user-1', roles: ['user'] },
            JWT_SECRET,
            { expiresIn: -10 }
        )
        const provider = new JwtAuthProvider({ mode: 'jwt', jwt: { secret: JWT_SECRET } })

        const user = provider.parseRequest({
            headers: { authorization: `Bearer ${token}` }
        })

        assert.isNull(user)
    })

    test('accepts valid token and extracts claims', ({ assert }) => {
        const token = jwt.sign(
            { sub: 'user-42', roles: ['user', 'editor'] },
            JWT_SECRET,
            { expiresIn: '1h' }
        )
        const provider = new JwtAuthProvider({ mode: 'jwt', jwt: { secret: JWT_SECRET } })

        const user = provider.parseRequest({
            headers: { authorization: `Bearer ${token}` }
        })

        assert.isNotNull(user)
        assert.equal(user!.id, 'user-42')
        assert.deepEqual(user!.roles, ['user', 'editor'])
    })
})

test.group('NoAuthProvider', () => {
    test('always returns anonymous user', ({ assert }) => {
        const provider = new NoAuthProvider()

        const user = provider.parseRequest({ headers: {} })

        assert.isNotNull(user)
        assert.equal(user!.id, 'anonymous')
        assert.isTrue(provider.hasValidAuth({ headers: {} }))
        assert.isFalse(provider.isAdmin({ headers: {} }))
    })
})

test.group('AuthProviderFactory', (group) => {
    group.each.setup(() => {
        delete process.env.AUTH_MODE
        delete process.env.JWT_SECRET
        delete process.env.DIGITALTWIN_DISABLE_AUTH
        AuthConfig._resetConfig()
        ApisixAuthParser._resetProvider()
    })
    group.teardown(() => {
        process.env.DIGITALTWIN_DISABLE_AUTH = 'true'
        AuthConfig._resetConfig()
        ApisixAuthParser._resetProvider()
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
