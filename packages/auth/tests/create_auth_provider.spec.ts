import { test } from '@japa/runner'
import { AUTH_MODES, adminRoleFromEnv, createAuthProvider, readAuthEnv } from '../src/create_auth_provider.js'
import { GatewayAuthProvider } from '../src/providers/gateway_auth_provider.js'
import { NoAuthProvider } from '../src/providers/no_auth_provider.js'
import { OidcAuthProvider } from '../src/providers/oidc_auth_provider.js'
import { TrustedHeaderAuthProvider } from '../src/providers/trusted_header_auth_provider.js'

test.group('readAuthEnv', () => {
    test('missing AUTH_MODE means none outside production, and is flagged as defaulted', ({ assert }) => {
        for (const NODE_ENV of ['development', 'test', undefined]) {
            const settings = readAuthEnv({ NODE_ENV })
            assert.equal(settings.mode, 'none')
            assert.isTrue(settings.defaulted)
        }
        assert.isFalse(readAuthEnv({ AUTH_MODE: 'none' }).defaulted)
    })

    test('missing AUTH_MODE in production throws and lists the valid modes', ({ assert }) => {
        for (const env of [{ NODE_ENV: 'production' }, { NODE_ENV: 'production', AUTH_MODE: '' }]) {
            assert.throws(() => readAuthEnv(env), /AUTH_MODE is required in production/)
            assert.throws(() => readAuthEnv(env), new RegExp(AUTH_MODES.join(', ')))
        }
    })

    test('an unknown AUTH_MODE throws and lists the valid modes', ({ assert }) => {
        assert.throws(() => readAuthEnv({ AUTH_MODE: 'jwt' }), /Unknown AUTH_MODE "jwt"\. Valid modes: oidc, trusted-headers, gateway, none/)
    })

    test('admin role and anonymous subject have defaults and env overrides', ({ assert }) => {
        assert.equal(adminRoleFromEnv({}), 'admin')
        assert.equal(adminRoleFromEnv({ AUTH_ADMIN_ROLE: 'operator' }), 'operator')
        assert.equal(adminRoleFromEnv({ DIGITALTWIN_ADMIN_ROLE_NAME: 'root' }), 'root')
        assert.equal(adminRoleFromEnv({ AUTH_ADMIN_ROLE: 'operator', DIGITALTWIN_ADMIN_ROLE_NAME: 'root' }), 'operator')
        assert.equal(readAuthEnv({}).anonymousSubject, 'anonymous')
        assert.equal(readAuthEnv({ DIGITALTWIN_ANONYMOUS_USER_ID: 'dev' }).anonymousSubject, 'dev')
    })

    test('trusted header options are only read in trusted-headers mode', ({ assert }) => {
        const env = { AUTH_HEADER_SUBJECT: 'x-s', AUTH_HEADER_ROLES: 'x-r', AUTH_HEADER_SECRET: 'k' }
        assert.deepEqual(readAuthEnv({ ...env, AUTH_MODE: 'trusted-headers' }).trustedHeaders, { subjectHeader: 'x-s', rolesHeader: 'x-r', secret: 'k' })
        assert.deepEqual(readAuthEnv({ ...env, AUTH_MODE: 'gateway' }).trustedHeaders, {})
    })
})

test.group('createAuthProvider', () => {
    test('builds the provider for each mode', async ({ assert }) => {
        assert.instanceOf(createAuthProvider({ AUTH_MODE: 'none' }), NoAuthProvider)
        assert.instanceOf(createAuthProvider({ AUTH_MODE: 'gateway' }), GatewayAuthProvider)
        assert.instanceOf(createAuthProvider({ AUTH_MODE: 'trusted-headers' }), TrustedHeaderAuthProvider)
        assert.instanceOf(createAuthProvider({ AUTH_MODE: 'oidc', OIDC_ISSUER: 'https://id.example', OIDC_AUDIENCE: 'dt' }), OidcAuthProvider)

        const anonymous = await createAuthProvider({ AUTH_MODE: 'none', DIGITALTWIN_ANONYMOUS_USER_ID: 'dev' }).authenticate({ headers: {} })
        assert.equal(anonymous?.subject, 'dev')
    })

    test('DIGITALTWIN_DISABLE_AUTH no longer switches auth off', async ({ assert }) => {
        const provider = createAuthProvider({ AUTH_MODE: 'gateway', DIGITALTWIN_DISABLE_AUTH: 'true' })

        assert.instanceOf(provider, GatewayAuthProvider)
        assert.isNull(await provider.authenticate({ headers: {} }))
    })

    test('trusted-headers reads the header names and the secret', async ({ assert }) => {
        const provider = createAuthProvider({
            AUTH_MODE: 'trusted-headers',
            AUTH_HEADER_SUBJECT: 'x-forwarded-user',
            AUTH_HEADER_ROLES: 'x-forwarded-groups',
            AUTH_HEADER_SECRET: 'proxy-secret'
        })

        assert.isNull(await provider.authenticate({ headers: { 'x-forwarded-user': 'alice' } }))
        const user = await provider.authenticate({ headers: { 'x-forwarded-user': 'alice', 'x-forwarded-groups': 'ops', 'x-auth-secret': 'proxy-secret' } })
        assert.deepEqual(user, { subject: 'alice', roles: ['ops'] })
    })

    test('oidc needs issuer and audience and a numeric tolerance', ({ assert }) => {
        assert.throws(() => createAuthProvider({ AUTH_MODE: 'oidc' }), /OIDC_ISSUER and OIDC_AUDIENCE/)
        assert.throws(
            () => createAuthProvider({ AUTH_MODE: 'oidc', OIDC_ISSUER: 'https://id.example', OIDC_AUDIENCE: 'dt', OIDC_CLOCK_TOLERANCE: 'soon' }),
            /OIDC_CLOCK_TOLERANCE must be a number/
        )
    })

    test('warns when the development default applies, except under test', ({ assert }) => {
        const warnings: string[] = []
        const original = console.warn
        console.warn = (message: string) => { warnings.push(message) }
        try {
            createAuthProvider({ NODE_ENV: 'development' })
            createAuthProvider({ NODE_ENV: 'test' })
            createAuthProvider({ NODE_ENV: 'development', AUTH_MODE: 'none' })
        } finally {
            console.warn = original
        }

        assert.lengthOf(warnings, 1)
        assert.include(warnings[0], 'AUTH_MODE is not set')
    })
})
