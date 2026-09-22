import { test } from '@japa/runner'
import { createServer, type Server } from 'node:http'
import { SignJWT, exportJWK, exportSPKI, generateKeyPair, type CryptoKey, type JWK } from 'jose'
import { OidcAuthProvider } from '../src/providers/oidc_auth_provider.js'

const AUDIENCE = 'digitaltwin'

interface Issuer {
    url: string
    jwks: { keys: JWK[] }
    close(): Promise<void>
}

/** A local OIDC issuer: discovery document plus JWKS, nothing else. */
async function startIssuer(keys: JWK[]): Promise<Issuer> {
    const jwks = { keys }
    let url = ''
    const server: Server = createServer((req, res) => {
        const body =
            req.url === '/.well-known/openid-configuration' ? { issuer: url, jwks_uri: `${url}/keys` }
            : req.url === '/keys' ? jwks
            : req.url === '/broken/.well-known/openid-configuration' ? { issuer: url }
            : undefined
        res.writeHead(body ? 200 : 404, { 'content-type': 'application/json' })
        res.end(JSON.stringify(body ?? { error: 'not found' }))
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('no port')
    url = `http://127.0.0.1:${address.port}`
    return { url, jwks, close: () => new Promise(resolve => server.close(() => resolve())) }
}

async function keyPair(kid: string) {
    const pair = await generateKeyPair('RS256', { extractable: true })
    const jwk = { ...(await exportJWK(pair.publicKey)), kid, alg: 'RS256', use: 'sig' }
    return { ...pair, kid, jwk }
}

function sign(key: { privateKey: CryptoKey; kid: string }, claims: Record<string, unknown>, issuer: string, expiresIn = '5m') {
    return new SignJWT(claims)
        .setProtectedHeader({ alg: 'RS256', kid: key.kid })
        .setIssuer(issuer)
        .setAudience(AUDIENCE)
        .setIssuedAt()
        .setExpirationTime(expiresIn)
        .sign(key.privateKey)
}

const bearer = (token: string) => ({ headers: { authorization: `Bearer ${token}` } })

test.group('OidcAuthProvider with discovery', group => {
    let issuer: Issuer
    let key: Awaited<ReturnType<typeof keyPair>>
    let provider: OidcAuthProvider

    group.setup(async () => {
        key = await keyPair('k1')
        issuer = await startIssuer([key.jwk])
        provider = new OidcAuthProvider({ issuer: issuer.url, audience: AUDIENCE })
        await provider.ready()
    })
    group.teardown(() => issuer.close())

    test('a valid token yields the subject, the roles and the claims', async ({ assert }) => {
        const token = await sign(key, { sub: 'user-1', roles: ['user', 'editor'] }, issuer.url)

        const user = await provider.authenticate(bearer(token))

        assert.equal(user?.subject, 'user-1')
        assert.deepEqual(user?.roles, ['user', 'editor'])
        assert.equal(user?.claims?.aud, AUDIENCE)
    })

    test('an expired token is refused, but the clock tolerance covers a small skew', async ({ assert }) => {
        const longExpired = await sign(key, { sub: 'user-1' }, issuer.url, '-30s')
        const justExpired = await sign(key, { sub: 'user-1' }, issuer.url, '-2s')

        assert.isNull(await provider.authenticate(bearer(longExpired)))
        assert.equal((await provider.authenticate(bearer(justExpired)))?.subject, 'user-1')
    })

    test('wrong audience or wrong issuer is refused', async ({ assert }) => {
        const wrongAudience = await new SignJWT({ sub: 'user-1' })
            .setProtectedHeader({ alg: 'RS256', kid: key.kid })
            .setIssuer(issuer.url)
            .setAudience('someone-else')
            .setExpirationTime('5m')
            .sign(key.privateKey)
        const wrongIssuer = await sign(key, { sub: 'user-1' }, 'https://evil.example')

        assert.isNull(await provider.authenticate(bearer(wrongAudience)))
        assert.isNull(await provider.authenticate(bearer(wrongIssuer)))
    })

    test('a token signed by a key the issuer does not publish is refused', async ({ assert }) => {
        const rogue = await keyPair('k-unknown')
        const token = await sign(rogue, { sub: 'user-1' }, issuer.url)

        assert.isNull(await provider.authenticate(bearer(token)))
    })

    test('alg=none is refused', async ({ assert }) => {
        const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')
        const now = Math.floor(Date.now() / 1000)
        const unsigned = `${encode({ alg: 'none' })}.${encode({ sub: 'user-1', iss: issuer.url, aud: AUDIENCE, exp: now + 300 })}.`

        assert.isNull(await provider.authenticate(bearer(unsigned)))
    })

    test('a token without a subject is refused', async ({ assert }) => {
        const token = await sign(key, { roles: ['user'] }, issuer.url)

        assert.isNull(await provider.authenticate(bearer(token)))
    })

    test('missing or malformed Authorization header yields null', async ({ assert }) => {
        const token = await sign(key, { sub: 'user-1' }, issuer.url)

        assert.isNull(await provider.authenticate({ headers: {} }))
        assert.isNull(await provider.authenticate({ headers: { authorization: token } }))
        assert.isNull(await provider.authenticate({ headers: { authorization: `Basic ${token}` } }))
        assert.isNull(await provider.authenticate({ headers: { authorization: `Bearer ${token} extra` } }))
    })

    test('roles are read from a dot path, missing path means no roles', async ({ assert }) => {
        const keycloak = new OidcAuthProvider({ issuer: issuer.url, audience: AUDIENCE, rolesClaim: 'realm_access.roles' })
        const token = await sign(key, { sub: 'user-1', realm_access: { roles: ['admin', 7] } }, issuer.url)
        const flat = await sign(key, { sub: 'user-2', roles: ['admin'] }, issuer.url)

        assert.deepEqual((await keycloak.authenticate(bearer(token)))?.roles, ['admin'])
        assert.deepEqual((await keycloak.authenticate(bearer(flat)))?.roles, [])
    })
})

test.group('OidcAuthProvider key sources', () => {
    test('ready() fails fast with a clear message when discovery is unreachable', async ({ assert }) => {
        const issuer = await startIssuer([])
        try {
            const missing = new OidcAuthProvider({ issuer: `${issuer.url}/missing`, audience: AUDIENCE })
            const broken = new OidcAuthProvider({ issuer: `${issuer.url}/broken`, audience: AUDIENCE })

            await assert.rejects(() => missing.ready(), /OIDC discovery failed for issuer .*\/missing .*HTTP 404/)
            await assert.rejects(() => broken.ready(), /has no jwks_uri/)
        } finally {
            await issuer.close()
        }
    })

    test('a failed discovery is retried on the next call', async ({ assert }) => {
        const key = await keyPair('k1')
        const issuer = await startIssuer([key.jwk])
        try {
            const provider = new OidcAuthProvider({ issuer: `${issuer.url}/missing`, audience: AUDIENCE })
            await assert.rejects(() => provider.ready())
            const token = await sign(key, { sub: 'user-1' }, `${issuer.url}/missing`)
            assert.isNull(await provider.authenticate(bearer(token)))
        } finally {
            await issuer.close()
        }
    })

    test('an explicit jwksUri skips discovery', async ({ assert }) => {
        const key = await keyPair('k1')
        const issuer = await startIssuer([key.jwk])
        try {
            const provider = new OidcAuthProvider({ issuer: 'https://id.example', audience: AUDIENCE, jwksUri: `${issuer.url}/keys` })
            const token = await sign(key, { sub: 'user-1' }, 'https://id.example')

            assert.equal((await provider.authenticate(bearer(token)))?.subject, 'user-1')
        } finally {
            await issuer.close()
        }
    })

    test('a PEM public key needs no network at all', async ({ assert }) => {
        const key = await keyPair('k1')
        const other = await keyPair('k2')
        const provider = new OidcAuthProvider({ issuer: 'https://id.example', audience: AUDIENCE, publicKey: await exportSPKI(key.publicKey) })
        await provider.ready()

        const good = await sign(key, { sub: 'user-1' }, 'https://id.example')
        const bad = await sign(other, { sub: 'user-1' }, 'https://id.example')

        assert.equal((await provider.authenticate(bearer(good)))?.subject, 'user-1')
        assert.isNull(await provider.authenticate(bearer(bad)))
    })
})
