import { test } from '@japa/runner'
import { AUTH_SECRET_HEADER, TrustedHeaderAuthProvider } from '../src/providers/trusted_header_auth_provider.js'

const withHeaders = (headers: Record<string, string | string[] | undefined>) => ({ headers })

test.group('TrustedHeaderAuthProvider', () => {
    test('reads subject and roles from the default headers, trimming and dropping empty roles', async ({ assert }) => {
        const provider = new TrustedHeaderAuthProvider()

        const user = await provider.authenticate(withHeaders({ 'x-user-id': 'uuid-1', 'x-user-roles': ' admin , user ,, ' }))

        assert.deepEqual(user, { subject: 'uuid-1', roles: ['admin', 'user'] })
    })

    test('missing subject header yields null, missing roles header yields no roles', async ({ assert }) => {
        const provider = new TrustedHeaderAuthProvider()

        assert.isNull(await provider.authenticate(withHeaders({ 'x-user-roles': 'admin' })))
        assert.isNull(await provider.authenticate(withHeaders({ 'x-user-id': '' })))
        assert.deepEqual(await provider.authenticate(withHeaders({ 'x-user-id': 'uuid-1' })), { subject: 'uuid-1', roles: [] })
    })

    test('header names are configurable and matched case-insensitively', async ({ assert }) => {
        const provider = new TrustedHeaderAuthProvider({ subjectHeader: 'X-Forwarded-User', rolesHeader: 'X-Forwarded-Groups' })

        const user = await provider.authenticate(withHeaders({ 'x-forwarded-user': 'alice', 'x-forwarded-groups': 'ops' }))

        assert.deepEqual(user, { subject: 'alice', roles: ['ops'] })
        assert.isNull(await provider.authenticate(withHeaders({ 'x-user-id': 'alice' })))
    })

    test('a repeated header uses its first value', async ({ assert }) => {
        const provider = new TrustedHeaderAuthProvider()

        const user = await provider.authenticate(withHeaders({ 'x-user-id': ['first', 'second'], 'x-user-roles': ['a', 'b'] }))

        assert.deepEqual(user, { subject: 'first', roles: ['a'] })
    })

    test('with a shared secret, the proxy must send it exactly', async ({ assert }) => {
        const provider = new TrustedHeaderAuthProvider({ secret: 's3cret' })
        const identity = { 'x-user-id': 'uuid-1', 'x-user-roles': 'admin' }

        assert.isNull(await provider.authenticate(withHeaders(identity)))
        assert.isNull(await provider.authenticate(withHeaders({ ...identity, [AUTH_SECRET_HEADER]: 'wrong!' })))
        assert.isNull(await provider.authenticate(withHeaders({ ...identity, [AUTH_SECRET_HEADER]: 's3cre' })))
        assert.isNull(await provider.authenticate(withHeaders({ ...identity, [AUTH_SECRET_HEADER]: 's3cret-and-more' })))
        assert.equal((await provider.authenticate(withHeaders({ ...identity, [AUTH_SECRET_HEADER]: 's3cret' })))?.subject, 'uuid-1')
    })

    test('ready() warns that the app must sit behind the proxy, louder without a secret', async ({ assert }) => {
        const warnings: string[] = []
        const original = console.warn
        console.warn = (message: string) => { warnings.push(message) }
        try {
            await new TrustedHeaderAuthProvider().ready()
            await new TrustedHeaderAuthProvider({ secret: 'x' }).ready()
        } finally {
            console.warn = original
        }

        assert.lengthOf(warnings, 2)
        assert.include(warnings[0], 'only be reachable through the proxy')
        assert.include(warnings[0], 'No shared secret is configured')
        assert.notInclude(warnings[1], 'No shared secret is configured')
    })
})
