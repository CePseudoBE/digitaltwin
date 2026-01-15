import { test } from '@japa/runner'
import jwt from 'jsonwebtoken'
import {
    GatewayAuthProvider,
    JwtAuthProvider,
    NoAuthProvider,
    AuthProviderFactory
} from '../../src/auth/index.js'

test.group('GatewayAuthProvider', () => {
    test('parseRequest() returns user from x-user-id and x-user-roles headers', ({ assert }) => {
        const provider = new GatewayAuthProvider()
        const req = {
            headers: {
                'x-user-id': 'user-123',
                'x-user-roles': 'admin,user'
            }
        }

        const user = provider.parseRequest(req)

        assert.isNotNull(user)
        assert.equal(user!.id, 'user-123')
        assert.deepEqual(user!.roles, ['admin', 'user'])
    })

    test('parseRequest() returns null when x-user-id is missing', ({ assert }) => {
        const provider = new GatewayAuthProvider()
        const req = {
            headers: {
                'x-user-roles': 'admin'
            }
        }

        const user = provider.parseRequest(req)

        assert.isNull(user)
    })

    test('hasValidAuth() returns true when x-user-id exists', ({ assert }) => {
        const provider = new GatewayAuthProvider()

        assert.isTrue(provider.hasValidAuth({ headers: { 'x-user-id': '123' } }))
        assert.isFalse(provider.hasValidAuth({ headers: {} }))
        assert.isFalse(provider.hasValidAuth({ headers: { 'x-user-id': '' } }))
    })

    test('isAdmin() checks for admin role', ({ assert }) => {
        const provider = new GatewayAuthProvider()

        assert.isTrue(provider.isAdmin({ headers: { 'x-user-id': '1', 'x-user-roles': 'admin,user' } }))
        assert.isFalse(provider.isAdmin({ headers: { 'x-user-id': '1', 'x-user-roles': 'user' } }))
    })

    test('isAdmin() uses custom admin role name', ({ assert }) => {
        const provider = new GatewayAuthProvider('superadmin')

        assert.isTrue(provider.isAdmin({ headers: { 'x-user-id': '1', 'x-user-roles': 'superadmin' } }))
        assert.isFalse(provider.isAdmin({ headers: { 'x-user-id': '1', 'x-user-roles': 'admin' } }))
    })

    test('getUserId() extracts user ID from headers', ({ assert }) => {
        const provider = new GatewayAuthProvider()

        assert.equal(provider.getUserId({ headers: { 'x-user-id': 'abc-123' } }), 'abc-123')
        assert.isNull(provider.getUserId({ headers: {} }))
    })

    test('getUserRoles() parses comma-separated roles', ({ assert }) => {
        const provider = new GatewayAuthProvider()

        assert.deepEqual(
            provider.getUserRoles({ headers: { 'x-user-roles': 'admin, user, manager' } }),
            ['admin', 'user', 'manager']
        )
        assert.deepEqual(provider.getUserRoles({ headers: {} }), [])
    })

    test('handles array header values', ({ assert }) => {
        const provider = new GatewayAuthProvider()
        const req = {
            headers: {
                'x-user-id': ['user-1', 'user-2'],
                'x-user-roles': ['admin,user']
            }
        }

        const user = provider.parseRequest(req)

        assert.isNotNull(user)
        assert.equal(user!.id, 'user-1')
        assert.deepEqual(user!.roles, ['admin', 'user'])
    })
})

test.group('JwtAuthProvider', () => {
    const secret = 'test-secret-key-for-jwt-signing'

    test('parseRequest() validates and decodes JWT token', ({ assert }) => {
        const provider = new JwtAuthProvider({
            mode: 'jwt',
            jwt: { secret, algorithm: 'HS256' }
        })

        const token = jwt.sign({ sub: 'user-456', roles: ['admin'] }, secret, { algorithm: 'HS256' })
        const req = {
            headers: {
                authorization: `Bearer ${token}`
            }
        }

        const user = provider.parseRequest(req)

        assert.isNotNull(user)
        assert.equal(user!.id, 'user-456')
        assert.deepEqual(user!.roles, ['admin'])
    })

    test('parseRequest() returns null for invalid token', ({ assert }) => {
        const provider = new JwtAuthProvider({
            mode: 'jwt',
            jwt: { secret, algorithm: 'HS256' }
        })

        const req = {
            headers: {
                authorization: 'Bearer invalid-token'
            }
        }

        const user = provider.parseRequest(req)

        assert.isNull(user)
    })

    test('parseRequest() returns null for expired token', ({ assert }) => {
        const provider = new JwtAuthProvider({
            mode: 'jwt',
            jwt: { secret, algorithm: 'HS256' }
        })

        const token = jwt.sign({ sub: 'user-789' }, secret, { algorithm: 'HS256', expiresIn: '-1s' })
        const req = {
            headers: {
                authorization: `Bearer ${token}`
            }
        }

        const user = provider.parseRequest(req)

        assert.isNull(user)
    })

    test('parseRequest() validates issuer when configured', ({ assert }) => {
        const provider = new JwtAuthProvider({
            mode: 'jwt',
            jwt: { secret, algorithm: 'HS256', issuer: 'https://auth.example.com' }
        })

        // Token with wrong issuer
        const wrongToken = jwt.sign({ sub: 'user-1', iss: 'https://other.com' }, secret)
        assert.isNull(provider.parseRequest({ headers: { authorization: `Bearer ${wrongToken}` } }))

        // Token with correct issuer
        const correctToken = jwt.sign({ sub: 'user-1', iss: 'https://auth.example.com' }, secret)
        assert.isNotNull(provider.parseRequest({ headers: { authorization: `Bearer ${correctToken}` } }))
    })

    test('uses custom userIdClaim', ({ assert }) => {
        const provider = new JwtAuthProvider({
            mode: 'jwt',
            jwt: { secret, algorithm: 'HS256', userIdClaim: 'user_id' }
        })

        const token = jwt.sign({ user_id: 'custom-user-123', roles: [] }, secret)
        const user = provider.parseRequest({ headers: { authorization: `Bearer ${token}` } })

        assert.isNotNull(user)
        assert.equal(user!.id, 'custom-user-123')
    })

    test('uses custom rolesClaim with nested path', ({ assert }) => {
        const provider = new JwtAuthProvider({
            mode: 'jwt',
            jwt: { secret, algorithm: 'HS256', rolesClaim: 'realm_access.roles' }
        })

        const token = jwt.sign(
            {
                sub: 'user-1',
                realm_access: { roles: ['realm-admin', 'realm-user'] }
            },
            secret
        )
        const user = provider.parseRequest({ headers: { authorization: `Bearer ${token}` } })

        assert.isNotNull(user)
        assert.deepEqual(user!.roles, ['realm-admin', 'realm-user'])
    })

    test('falls back to Keycloak realm_access.roles format', ({ assert }) => {
        const provider = new JwtAuthProvider({
            mode: 'jwt',
            jwt: { secret, algorithm: 'HS256' }
        })

        const token = jwt.sign(
            {
                sub: 'user-kc',
                realm_access: { roles: ['kc-admin'] }
            },
            secret
        )
        const user = provider.parseRequest({ headers: { authorization: `Bearer ${token}` } })

        assert.isNotNull(user)
        assert.deepEqual(user!.roles, ['kc-admin'])
    })

    test('hasValidAuth() checks for Bearer token', ({ assert }) => {
        const provider = new JwtAuthProvider({
            mode: 'jwt',
            jwt: { secret }
        })

        assert.isTrue(provider.hasValidAuth({ headers: { authorization: 'Bearer token123' } }))
        assert.isFalse(provider.hasValidAuth({ headers: { authorization: 'Basic abc' } }))
        assert.isFalse(provider.hasValidAuth({ headers: {} }))
    })

    test('isAdmin() checks decoded token for admin role', ({ assert }) => {
        const provider = new JwtAuthProvider({
            mode: 'jwt',
            jwt: { secret },
            adminRoleName: 'admin'
        })

        const adminToken = jwt.sign({ sub: 'admin-user', roles: ['admin', 'user'] }, secret)
        const userToken = jwt.sign({ sub: 'normal-user', roles: ['user'] }, secret)

        assert.isTrue(provider.isAdmin({ headers: { authorization: `Bearer ${adminToken}` } }))
        assert.isFalse(provider.isAdmin({ headers: { authorization: `Bearer ${userToken}` } }))
    })

    test('throws error when JWT config is missing', ({ assert }) => {
        assert.throws(() => {
            new JwtAuthProvider({ mode: 'jwt' })
        }, /JWT configuration required/)
    })

    test('throws error when neither secret nor publicKey is provided', ({ assert }) => {
        assert.throws(() => {
            new JwtAuthProvider({ mode: 'jwt', jwt: {} })
        }, /JWT secret or publicKey required/)
    })
})

test.group('NoAuthProvider', () => {
    test('parseRequest() always returns anonymous user', ({ assert }) => {
        const provider = new NoAuthProvider()

        const user = provider.parseRequest({ headers: {} })

        assert.isNotNull(user)
        assert.equal(user!.id, 'anonymous')
        assert.deepEqual(user!.roles, ['anonymous'])
    })

    test('uses custom anonymous user ID', ({ assert }) => {
        const provider = new NoAuthProvider('dev-user-123')

        const user = provider.parseRequest({ headers: {} })

        assert.equal(user!.id, 'dev-user-123')
    })

    test('uses custom roles', ({ assert }) => {
        const provider = new NoAuthProvider('dev-user', ['developer', 'tester'])

        const user = provider.parseRequest({ headers: {} })

        assert.deepEqual(user!.roles, ['developer', 'tester'])
    })

    test('hasValidAuth() always returns true', ({ assert }) => {
        const provider = new NoAuthProvider()

        assert.isTrue(provider.hasValidAuth({ headers: {} }))
        assert.isTrue(provider.hasValidAuth({ headers: { anything: 'value' } }))
    })

    test('isAdmin() always returns false', ({ assert }) => {
        const provider = new NoAuthProvider()

        assert.isFalse(provider.isAdmin({ headers: {} }))
    })

    test('getUserId() returns anonymous user ID', ({ assert }) => {
        const provider = new NoAuthProvider('test-anon')

        assert.equal(provider.getUserId({ headers: {} }), 'test-anon')
    })

    test('getUserRoles() returns anonymous roles', ({ assert }) => {
        const provider = new NoAuthProvider('anon', ['guest'])

        assert.deepEqual(provider.getUserRoles({ headers: {} }), ['guest'])
    })
})

test.group('AuthProviderFactory', () => {
    const originalEnv = { ...process.env }

    function resetEnv() {
        // Clear auth-related env vars
        delete process.env.AUTH_MODE
        delete process.env.AUTH_ADMIN_ROLE
        delete process.env.DIGITALTWIN_ADMIN_ROLE_NAME
        delete process.env.DIGITALTWIN_DISABLE_AUTH
        delete process.env.DIGITALTWIN_ANONYMOUS_USER_ID
        delete process.env.JWT_SECRET
        delete process.env.JWT_PUBLIC_KEY
        delete process.env.JWT_PUBLIC_KEY_FILE
        delete process.env.JWT_ALGORITHM
        delete process.env.JWT_ISSUER
        delete process.env.JWT_AUDIENCE
        delete process.env.JWT_USER_ID_CLAIM
        delete process.env.JWT_ROLES_CLAIM
    }

    function restoreEnv() {
        resetEnv()
        Object.assign(process.env, originalEnv)
    }

    test('create() returns GatewayAuthProvider for gateway mode', ({ assert }) => {
        const provider = AuthProviderFactory.create({ mode: 'gateway' })

        assert.instanceOf(provider, GatewayAuthProvider)
    })

    test('create() returns JwtAuthProvider for jwt mode', ({ assert }) => {
        const provider = AuthProviderFactory.create({
            mode: 'jwt',
            jwt: { secret: 'test-secret' }
        })

        assert.instanceOf(provider, JwtAuthProvider)
    })

    test('create() returns NoAuthProvider for none mode', ({ assert }) => {
        const provider = AuthProviderFactory.create({ mode: 'none' })

        assert.instanceOf(provider, NoAuthProvider)
    })

    test('create() throws for unknown mode', ({ assert }) => {
        assert.throws(() => {
            AuthProviderFactory.create({ mode: 'unknown' as any })
        }, /Unknown auth mode/)
    })

    test('fromEnv() defaults to gateway mode', ({ assert }) => {
        resetEnv()

        const provider = AuthProviderFactory.fromEnv()

        assert.instanceOf(provider, GatewayAuthProvider)
        restoreEnv()
    })

    test('fromEnv() returns NoAuthProvider when DIGITALTWIN_DISABLE_AUTH=true', ({ assert }) => {
        resetEnv()
        process.env.DIGITALTWIN_DISABLE_AUTH = 'true'

        const provider = AuthProviderFactory.fromEnv()

        assert.instanceOf(provider, NoAuthProvider)
        restoreEnv()
    })

    test('fromEnv() returns NoAuthProvider for AUTH_MODE=none', ({ assert }) => {
        resetEnv()
        process.env.AUTH_MODE = 'none'

        const provider = AuthProviderFactory.fromEnv()

        assert.instanceOf(provider, NoAuthProvider)
        restoreEnv()
    })

    test('fromEnv() returns JwtAuthProvider for AUTH_MODE=jwt with secret', ({ assert }) => {
        resetEnv()
        process.env.AUTH_MODE = 'jwt'
        process.env.JWT_SECRET = 'my-secret-key'

        const provider = AuthProviderFactory.fromEnv()

        assert.instanceOf(provider, JwtAuthProvider)
        restoreEnv()
    })

    test('fromEnv() throws for jwt mode without secret or public key', ({ assert }) => {
        resetEnv()
        process.env.AUTH_MODE = 'jwt'

        assert.throws(() => {
            AuthProviderFactory.fromEnv()
        }, /JWT mode requires either JWT_SECRET or JWT_PUBLIC_KEY/)

        restoreEnv()
    })

    test('fromEnv() uses AUTH_ADMIN_ROLE for admin role name', ({ assert }) => {
        resetEnv()
        process.env.AUTH_ADMIN_ROLE = 'superuser'

        const provider = AuthProviderFactory.fromEnv() as GatewayAuthProvider

        // Verify by checking isAdmin with the custom role
        const req = { headers: { 'x-user-id': '1', 'x-user-roles': 'superuser' } }
        assert.isTrue(provider.isAdmin(req))

        restoreEnv()
    })

    test('fromEnv() falls back to DIGITALTWIN_ADMIN_ROLE_NAME', ({ assert }) => {
        resetEnv()
        process.env.DIGITALTWIN_ADMIN_ROLE_NAME = 'legacy-admin'

        const provider = AuthProviderFactory.fromEnv() as GatewayAuthProvider

        const req = { headers: { 'x-user-id': '1', 'x-user-roles': 'legacy-admin' } }
        assert.isTrue(provider.isAdmin(req))

        restoreEnv()
    })
})
