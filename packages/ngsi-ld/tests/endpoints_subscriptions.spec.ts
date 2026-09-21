import { test } from '@japa/runner'
import Fastify from 'fastify'
import type { FastifyInstance } from 'fastify'
import { KyselyDatabaseAdapter } from '@cepseudo/database'
import { SubscriptionStore } from '../src/subscriptions/subscription_store.js'
import { registerSubscriptionEndpoints } from '../src/endpoints/subscriptions.js'
import { ngsiLdErrorHandler } from '../src/endpoints/errors.js'
import type { Subscription, SubscriptionCreate } from '../src/types/subscription.js'
import type { SubscriptionCache } from '../src/subscriptions/subscription_cache.js'
import { createRouteGuards } from '../src/auth.js'
import type { NgsiLdAuthenticator } from '../src/auth.js'

const dataResolver = async (_url: string): Promise<Buffer> => Buffer.alloc(0)

class MockSubscriptionCache implements SubscriptionCache {
    private readonly subs = new Map<string, Subscription>()

    async warmup(subscriptions: Subscription[]): Promise<void> {
        for (const sub of subscriptions) {
            await this.add(sub)
        }
    }

    async add(sub: Subscription): Promise<void> {
        this.subs.set(sub.id, sub)
    }

    async update(sub: Subscription): Promise<void> {
        this.subs.set(sub.id, sub)
    }

    async remove(id: string): Promise<void> {
        this.subs.delete(id)
    }

    async getById(id: string): Promise<Subscription | null> {
        return this.subs.get(id) ?? null
    }

    async getIdsByType(type: string): Promise<string[]> {
        return [...this.subs.values()].filter(s => s.entityTypes.includes(type)).map(s => s.id)
    }

    async getByType(type: string): Promise<Subscription[]> {
        return [...this.subs.values()].filter(s => s.isActive && s.entityTypes.includes(type))
    }

    async updateLastNotified(id: string, at: string): Promise<void> {
        const sub = this.subs.get(id)
        if (sub) {
            this.subs.set(id, { ...sub, lastNotificationAt: at })
        }
    }
}

function makeInput(overrides: Partial<SubscriptionCreate> = {}): SubscriptionCreate {
    return {
        notification: { endpoint: { uri: 'https://example.com/notify' }, format: 'normalized' },
        entities: [{ type: 'AirQualityObserved' }],
        ...overrides
    }
}

const allowAll: NgsiLdAuthenticator = {
    async authenticate() {
        return { success: true, userRecord: { id: 1, keycloak_id: 'tester', roles: [], created_at: new Date(), updated_at: new Date() } }
    }
}

const denyAll: NgsiLdAuthenticator = {
    async authenticate() {
        return { success: false, response: { status: 401, content: JSON.stringify({ error: 'Authentication required' }) } }
    }
}

const SUBS = '/ngsi-ld/v1/subscriptions'
const UNKNOWN_ID = '00000000-0000-0000-0000-000000000000'

async function buildApp(
    store: SubscriptionStore,
    cache: SubscriptionCache,
    auth: NgsiLdAuthenticator | undefined,
    publicRead = true,
    allowPrivateWebhooks = false
): Promise<FastifyInstance> {
    const app = Fastify({ logger: false })
    await app.register(async instance => {
        instance.setErrorHandler(ngsiLdErrorHandler)
        registerSubscriptionEndpoints(instance, store, cache, createRouteGuards(auth, publicRead), { allowPrivateWebhooks })
    })
    return app
}

test.group('Subscription endpoints', group => {
    let db: KyselyDatabaseAdapter
    let store: SubscriptionStore
    let app: FastifyInstance

    group.each.setup(async () => {
        db = await KyselyDatabaseAdapter.forSQLite({ filename: ':memory:', enableForeignKeys: false }, dataResolver)
        store = new SubscriptionStore(db)
        await store.runMigration()
        app = await buildApp(store, new MockSubscriptionCache(), allowAll, true, true)
    })

    group.each.teardown(async () => {
        await app.close()
        await db.close()
    })

    test('POST /ngsi-ld/v1/subscriptions with valid body returns 201 and Location header', async ({ assert }) => {
        const res = await app.inject({ method: 'POST', url: SUBS, payload: makeInput() })

        assert.equal(res.statusCode, 201)
        assert.include(String(res.headers['content-type']), 'application/ld+json')
        const body = res.json() as Subscription
        assert.isString(body.id)
        assert.isTrue(body.isActive)
        assert.include(String(res.headers['location']), body.id)
    })

    test('POST /ngsi-ld/v1/subscriptions with a malformed body returns 400', async ({ assert }) => {
        const bodies: unknown[] = [
            { notification: { endpoint: {} }, entities: [{ type: 'AirQualityObserved' }] },
            { entities: [{ type: 'AirQualityObserved' }] },
            makeInput({ notification: { endpoint: { uri: 'https://example.com/x' }, format: 'xml' as 'normalized' } }),
            makeInput({ throttling: -1 }),
            'null'
        ]
        for (const payload of bodies) {
            const res = await app.inject({ method: 'POST', url: SUBS, payload, headers: { 'content-type': 'application/json' } })
            assert.equal(res.statusCode, 400, JSON.stringify(payload))
            assert.include((res.json() as { type: string }).type, 'BadRequestData')
        }
        assert.lengthOf(await store.findAll(), 0)
    })

    test('GET /ngsi-ld/v1/subscriptions returns 200 and array of subscriptions', async ({ assert }) => {
        await store.create(makeInput({ name: 'sub-a' }))
        await store.create(makeInput({ name: 'sub-b' }))

        const res = await app.inject(SUBS)

        assert.equal(res.statusCode, 200)
        assert.lengthOf(res.json() as Subscription[], 2)
    })

    test('GET /ngsi-ld/v1/subscriptions/:subscriptionId returns 200 and the subscription', async ({ assert }) => {
        const sub = await store.create(makeInput({ name: 'find-me' }))

        const res = await app.inject(`${SUBS}/${sub.id}`)

        assert.equal(res.statusCode, 200)
        const body = res.json() as Subscription
        assert.equal(body.id, sub.id)
        assert.equal(body.name, 'find-me')
    })

    test('GET /ngsi-ld/v1/subscriptions/:subscriptionId with unknown id returns 404', async ({ assert }) => {
        const res = await app.inject(`${SUBS}/${UNKNOWN_ID}`)

        assert.equal(res.statusCode, 404)
        assert.include((res.json() as { type: string }).type, 'ResourceNotFound')
    })

    test('PATCH /ngsi-ld/v1/subscriptions/:subscriptionId returns 204 and updates name in store', async ({ assert }) => {
        const sub = await store.create(makeInput({ name: 'original' }))

        const res = await app.inject({ method: 'PATCH', url: `${SUBS}/${sub.id}`, payload: { name: 'updated' } })

        assert.equal(res.statusCode, 204)
        assert.equal((await store.findById(sub.id))?.name, 'updated')
    })

    test('PATCH /ngsi-ld/v1/subscriptions/:subscriptionId with unknown id returns 404', async ({ assert }) => {
        const res = await app.inject({ method: 'PATCH', url: `${SUBS}/${UNKNOWN_ID}`, payload: { name: 'irrelevant' } })

        assert.equal(res.statusCode, 404)
        assert.include((res.json() as { type: string }).type, 'ResourceNotFound')
    })

    test('DELETE /ngsi-ld/v1/subscriptions/:subscriptionId returns 204 and soft-deletes the subscription', async ({ assert }) => {
        const sub = await store.create(makeInput())

        const res = await app.inject({ method: 'DELETE', url: `${SUBS}/${sub.id}` })

        assert.equal(res.statusCode, 204)
        assert.isNull(await store.findById(sub.id))
    })

    test('DELETE /ngsi-ld/v1/subscriptions/:subscriptionId with unknown id returns 404', async ({ assert }) => {
        const res = await app.inject({ method: 'DELETE', url: `${SUBS}/${UNKNOWN_ID}` })

        assert.equal(res.statusCode, 404)
        assert.include((res.json() as { type: string }).type, 'ResourceNotFound')
    })
})

test.group('Subscription endpoints - authentication and webhook safety', group => {
    let db: KyselyDatabaseAdapter
    let store: SubscriptionStore
    let cache: MockSubscriptionCache
    const apps: FastifyInstance[] = []

    group.each.setup(async () => {
        db = await KyselyDatabaseAdapter.forSQLite({ filename: ':memory:', enableForeignKeys: false }, dataResolver)
        store = new SubscriptionStore(db)
        await store.runMigration()
        cache = new MockSubscriptionCache()
    })

    group.each.teardown(async () => {
        await Promise.all(apps.splice(0).map(app => app.close()))
        await db.close()
    })

    async function appWith(auth: NgsiLdAuthenticator | undefined, publicRead = true, allowPrivateWebhooks = false): Promise<FastifyInstance> {
        const app = await buildApp(store, cache, auth, publicRead, allowPrivateWebhooks)
        apps.push(app)
        return app
    }

    test('POST without valid credentials returns 401 and creates nothing', async ({ assert }) => {
        const app = await appWith(denyAll)
        const res = await app.inject({ method: 'POST', url: SUBS, payload: makeInput() })
        assert.equal(res.statusCode, 401)
        assert.include((res.json() as { type: string }).type, 'Unauthorized')
        assert.lengthOf(await store.findAll(), 0)
    })

    test('writes are refused when no authenticator is configured', async ({ assert }) => {
        const app = await appWith(undefined)
        const res = await app.inject({ method: 'POST', url: SUBS, payload: makeInput() })
        assert.equal(res.statusCode, 401)
    })

    test('GET stays public by default, even with a denying authenticator', async ({ assert }) => {
        const app = await appWith(denyAll)
        assert.equal((await app.inject(SUBS)).statusCode, 200)
    })

    test('GET requires credentials when publicRead is false', async ({ assert }) => {
        const app = await appWith(denyAll, false)
        assert.equal((await app.inject(SUBS)).statusCode, 401)
    })

    test('POST rejects webhooks on loopback, link-local and private ranges', async ({ assert }) => {
        const app = await appWith(allowAll)
        for (const uri of ['http://127.0.0.1:6379/', 'http://169.254.169.254/latest/meta-data/', 'http://10.0.0.5/hook', 'http://localhost/hook']) {
            const res = await app.inject({ method: 'POST', url: SUBS, payload: makeInput({ notification: { endpoint: { uri } } }) })
            assert.equal(res.statusCode, 400, uri)
            assert.include((res.json() as { type: string }).type, 'BadRequestData')
        }
        assert.lengthOf(await store.findAll(), 0)
    })

    test('POST rejects non-http schemes', async ({ assert }) => {
        const app = await appWith(allowAll)
        const res = await app.inject({ method: 'POST', url: SUBS, payload: makeInput({ notification: { endpoint: { uri: 'ftp://203.0.113.7/x' } } }) })
        assert.equal(res.statusCode, 400)
        assert.include((res.json() as { title: string }).title, 'http or https')
    })

    test('PATCH cannot move an existing subscription to a private webhook', async ({ assert }) => {
        const app = await appWith(allowAll)
        const created = await app.inject({ method: 'POST', url: SUBS, payload: makeInput({ notification: { endpoint: { uri: 'https://203.0.113.7/notify' } } }) })
        assert.equal(created.statusCode, 201)
        const id = (created.json() as Subscription).id

        const res = await app.inject({ method: 'PATCH', url: `${SUBS}/${id}`, payload: { notification: { endpoint: { uri: 'http://192.168.1.10/' } } } })
        assert.equal(res.statusCode, 400)
        assert.equal((await store.findById(id))?.notificationEndpoint, 'https://203.0.113.7/notify')
    })

    test('allowPrivateWebhooks accepts loopback for development', async ({ assert }) => {
        const app = await appWith(allowAll, true, true)
        const res = await app.inject({ method: 'POST', url: SUBS, payload: makeInput({ notification: { endpoint: { uri: 'http://127.0.0.1:4000/hook' } } }) })
        assert.equal(res.statusCode, 201)
    })
})
