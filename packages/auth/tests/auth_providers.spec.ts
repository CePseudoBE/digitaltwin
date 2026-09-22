import { test } from '@japa/runner'
import { GatewayAuthProvider } from '../src/providers/gateway_auth_provider.js'
import { NoAuthProvider } from '../src/providers/no_auth_provider.js'
import { OidcAuthProvider } from '../src/providers/oidc_auth_provider.js'
import { TrustedHeaderAuthProvider } from '../src/providers/trusted_header_auth_provider.js'
import { AuthProviderFactory } from '../src/auth_provider_factory.js'

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

test.group('AuthProviderFactory', (group) => {
    group.each.setup(() => {
        delete process.env.AUTH_MODE
        delete process.env.DIGITALTWIN_DISABLE_AUTH
        for (const name of ['OIDC_ISSUER', 'OIDC_AUDIENCE', 'OIDC_ROLES_CLAIM', 'OIDC_CLOCK_TOLERANCE', 'OIDC_JWKS_URI', 'OIDC_PUBLIC_KEY', 'AUTH_HEADER_SUBJECT', 'AUTH_HEADER_ROLES', 'AUTH_HEADER_SECRET']) {
            delete process.env[name]
        }
    })
    group.teardown(() => {
        process.env.DIGITALTWIN_DISABLE_AUTH = 'true'
    })

    test('creates correct provider for each mode', ({ assert }) => {
        const gateway = AuthProviderFactory.create({ mode: 'gateway' })
        assert.instanceOf(gateway, GatewayAuthProvider)

        const oidc = AuthProviderFactory.create({ mode: 'oidc', oidc: { issuer: 'https://id.example', audience: 'dt' } })
        assert.instanceOf(oidc, OidcAuthProvider)
        assert.throws(() => AuthProviderFactory.create({ mode: 'oidc' }), /OIDC configuration required/)

        const none = AuthProviderFactory.create({ mode: 'none' })
        assert.instanceOf(none, NoAuthProvider)

        const trusted = AuthProviderFactory.create({ mode: 'trusted-headers', trustedHeaders: { secret: 's' } })
        assert.instanceOf(trusted, TrustedHeaderAuthProvider)
    })

    test('fromEnv() with AUTH_MODE=trusted-headers reads the header names and the secret', async ({ assert }) => {
        process.env.AUTH_MODE = 'trusted-headers'
        process.env.AUTH_HEADER_SUBJECT = 'x-forwarded-user'
        process.env.AUTH_HEADER_ROLES = 'x-forwarded-groups'
        process.env.AUTH_HEADER_SECRET = 'proxy-secret'

        const provider = AuthProviderFactory.fromEnv()

        assert.instanceOf(provider, TrustedHeaderAuthProvider)
        assert.isNull(await provider.authenticate({ headers: { 'x-forwarded-user': 'alice' } }))
        const user = await provider.authenticate({ headers: { 'x-forwarded-user': 'alice', 'x-forwarded-groups': 'ops', 'x-auth-secret': 'proxy-secret' } })
        assert.deepEqual(user, { subject: 'alice', roles: ['ops'] })
    })

    test('fromEnv() with DIGITALTWIN_DISABLE_AUTH creates NoAuthProvider', ({ assert }) => {
        process.env.DIGITALTWIN_DISABLE_AUTH = 'true'

        const provider = AuthProviderFactory.fromEnv()

        assert.instanceOf(provider, NoAuthProvider)
    })

    test('fromEnv() with AUTH_MODE=oidc needs issuer and audience and a numeric tolerance', ({ assert }) => {
        process.env.AUTH_MODE = 'oidc'
        assert.throws(() => AuthProviderFactory.fromEnv(), /OIDC_ISSUER and OIDC_AUDIENCE/)

        process.env.OIDC_ISSUER = 'https://id.example'
        process.env.OIDC_AUDIENCE = 'dt'
        assert.instanceOf(AuthProviderFactory.fromEnv(), OidcAuthProvider)

        process.env.OIDC_CLOCK_TOLERANCE = 'soon'
        assert.throws(() => AuthProviderFactory.fromEnv(), /OIDC_CLOCK_TOLERANCE must be a number/)
    })

    test('fromEnv() rejects an unknown AUTH_MODE', ({ assert }) => {
        process.env.AUTH_MODE = 'jwt'
        assert.throws(() => AuthProviderFactory.fromEnv(), /Unknown auth mode: jwt/)
    })
})
