import { test } from '@japa/runner'
import { KyselyDatabaseAdapter } from '@cepseudo/database'
import { SubscriptionStore } from '../src/subscriptions/subscription_store.js'
import { registerSubscriptionEndpoints } from '../src/endpoints/subscriptions.js'
import type { Subscription, SubscriptionCreate } from '../src/types/subscription.js'
import type { SubscriptionCache } from '../src/subscriptions/subscription_cache.js'

const dataResolver = async (_url: string): Promise<Buffer> => Buffer.alloc(0)

// --- MockRouter ---

type RouteHandler = (req: any, res: any) => Promise<void> | void

class MockRouter {
    private routes = new Map<string, RouteHandler>()

    private reg(method: string, path: string, h: RouteHandler) {
        this.routes.set(`${method} ${path}`, h)
    }

    get(path: string, h: RouteHandler) { this.reg('GET', path, h) }
    post(path: string, h: RouteHandler) { this.reg('POST', path, h) }
    patch(path: string, h: RouteHandler) { this.reg('PATCH', path, h) }
    delete(path: string, h: RouteHandler) { this.reg('DELETE', path, h) }

    async invoke(method: string, templatePath: string, req: any, res: any) {
        const h = this.routes.get(`${method} ${templatePath}`)
        if (!h) throw new Error(`No handler registered: ${method} ${templatePath}`)
        await h(req, res)
    }
}

// --- Mock req / res factories ---

function makeReq(opts: {
    body?: unknown
    params?: Record<string, string>
    query?: Record<string, string>
} = {}) {
    return { body: opts.body ?? {}, params: opts.params ?? {}, query: opts.query ?? {} }
}

function makeRes() {
    const res = {
        statusCode: 200,
        body: undefined as unknown,
        resHeaders: {} as Record<string, string>,
        ended: false,
        status(code: number) { res.statusCode = code; return res },
        json(data: unknown) { res.body = data; return res },
        end() { res.ended = true; return res },
        setHeader(name: string, value: string) { res.resHeaders[name] = value; return res },
    }
    return res
}

// --- In-memory MockSubscriptionCache ---

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
        return [...this.subs.values()]
            .filter(s => s.entityTypes.includes(type))
            .map(s => s.id)
    }

    async getByType(type: string): Promise<Subscription[]> {
        return [...this.subs.values()].filter(
            s => s.isActive && s.entityTypes.includes(type)
        )
    }

    async updateLastNotified(id: string, at: string): Promise<void> {
        const sub = this.subs.get(id)
        if (sub) {
            this.subs.set(id, { ...sub, lastNotificationAt: at })
        }
    }
}

// --- SubscriptionCreate helpers ---

function makeInput(overrides: Partial<SubscriptionCreate> = {}): SubscriptionCreate {
    return {
        notification: {
            endpoint: { uri: 'https://example.com/notify' },
            format: 'normalized',
        },
        entities: [{ type: 'AirQualityObserved' }],
        ...overrides,
    }
}

// --- Tests ---

test.group('Subscription endpoints', group => {
    let db: KyselyDatabaseAdapter
    let store: SubscriptionStore
    let cache: MockSubscriptionCache
    let router: MockRouter

    group.each.setup(async () => {
        db = await KyselyDatabaseAdapter.forSQLite({ filename: ':memory:', enableForeignKeys: false }, dataResolver)
        store = new SubscriptionStore(db)
        await store.runMigration()
        cache = new MockSubscriptionCache()
        router = new MockRouter()
        registerSubscriptionEndpoints(router as any, store, cache as unknown as SubscriptionCache)
    })

    group.each.teardown(async () => {
        await db.close()
    })

    // POST /ngsi-ld/v1/subscriptions

    test('POST /ngsi-ld/v1/subscriptions with valid body returns 201 and Location header', async ({ assert }) => {
        const req = makeReq({ body: makeInput() })
        const res = makeRes()

        await router.invoke('POST', '/ngsi-ld/v1/subscriptions', req, res)

        assert.equal(res.statusCode, 201)
        const body = res.body as Subscription
        assert.isString(body.id)
        assert.isTrue(body.isActive)
        assert.include(res.resHeaders['Location'], body.id)
    })

    test('POST /ngsi-ld/v1/subscriptions missing notification.endpoint.uri returns 400', async ({ assert }) => {
        const req = makeReq({
            body: {
                notification: { endpoint: {} },
                entities: [{ type: 'AirQualityObserved' }],
            },
        })
        const res = makeRes()

        await router.invoke('POST', '/ngsi-ld/v1/subscriptions', req, res)

        assert.equal(res.statusCode, 400)
        const body = res.body as { type: string }
        assert.include(body.type, 'BadRequestData')
    })

    test('POST /ngsi-ld/v1/subscriptions with null body returns 400', async ({ assert }) => {
        const req = makeReq({ body: null })
        const res = makeRes()

        await router.invoke('POST', '/ngsi-ld/v1/subscriptions', req, res)

        assert.equal(res.statusCode, 400)
        const body = res.body as { type: string }
        assert.include(body.type, 'BadRequestData')
    })

    // GET /ngsi-ld/v1/subscriptions

    test('GET /ngsi-ld/v1/subscriptions returns 200 and array of subscriptions', async ({ assert }) => {
        await store.create(makeInput({ name: 'sub-a' }))
        await store.create(makeInput({ name: 'sub-b' }))

        const req = makeReq()
        const res = makeRes()

        await router.invoke('GET', '/ngsi-ld/v1/subscriptions', req, res)

        assert.equal(res.statusCode, 200)
        const body = res.body as Subscription[]
        assert.isArray(body)
        assert.lengthOf(body, 2)
    })

    // GET /ngsi-ld/v1/subscriptions/:subscriptionId

    test('GET /ngsi-ld/v1/subscriptions/:subscriptionId returns 200 and the subscription', async ({ assert }) => {
        const sub = await store.create(makeInput({ name: 'find-me' }))

        const req = makeReq({ params: { subscriptionId: sub.id } })
        const res = makeRes()

        await router.invoke('GET', '/ngsi-ld/v1/subscriptions/:subscriptionId', req, res)

        assert.equal(res.statusCode, 200)
        const body = res.body as Subscription
        assert.equal(body.id, sub.id)
        assert.equal(body.name, 'find-me')
    })

    test('GET /ngsi-ld/v1/subscriptions/:subscriptionId with unknown id returns 404', async ({ assert }) => {
        const req = makeReq({ params: { subscriptionId: '00000000-0000-0000-0000-000000000000' } })
        const res = makeRes()

        await router.invoke('GET', '/ngsi-ld/v1/subscriptions/:subscriptionId', req, res)

        assert.equal(res.statusCode, 404)
        const body = res.body as { type: string }
        assert.include(body.type, 'ResourceNotFound')
    })

    // PATCH /ngsi-ld/v1/subscriptions/:subscriptionId

    test('PATCH /ngsi-ld/v1/subscriptions/:subscriptionId returns 204 and updates name in store', async ({ assert }) => {
        const sub = await store.create(makeInput({ name: 'original' }))

        const req = makeReq({
            params: { subscriptionId: sub.id },
            body: { name: 'updated' },
        })
        const res = makeRes()

        await router.invoke('PATCH', '/ngsi-ld/v1/subscriptions/:subscriptionId', req, res)

        assert.equal(res.statusCode, 204)
        assert.isTrue(res.ended)

        const persisted = await store.findById(sub.id)
        assert.isNotNull(persisted)
        assert.equal(persisted!.name, 'updated')
    })

    test('PATCH /ngsi-ld/v1/subscriptions/:subscriptionId with unknown id returns 404', async ({ assert }) => {
        const req = makeReq({
            params: { subscriptionId: '00000000-0000-0000-0000-000000000000' },
            body: { name: 'irrelevant' },
        })
        const res = makeRes()

        await router.invoke('PATCH', '/ngsi-ld/v1/subscriptions/:subscriptionId', req, res)

        assert.equal(res.statusCode, 404)
        const body = res.body as { type: string }
        assert.include(body.type, 'ResourceNotFound')
    })

    // DELETE /ngsi-ld/v1/subscriptions/:subscriptionId

    test('DELETE /ngsi-ld/v1/subscriptions/:subscriptionId returns 204 and soft-deletes the subscription', async ({ assert }) => {
        const sub = await store.create(makeInput())

        const req = makeReq({ params: { subscriptionId: sub.id } })
        const res = makeRes()

        await router.invoke('DELETE', '/ngsi-ld/v1/subscriptions/:subscriptionId', req, res)

        assert.equal(res.statusCode, 204)
        assert.isTrue(res.ended)

        const gone = await store.findById(sub.id)
        assert.isNull(gone)
    })

    test('DELETE /ngsi-ld/v1/subscriptions/:subscriptionId with unknown id returns 404', async ({ assert }) => {
        const req = makeReq({ params: { subscriptionId: '00000000-0000-0000-0000-000000000000' } })
        const res = makeRes()

        await router.invoke('DELETE', '/ngsi-ld/v1/subscriptions/:subscriptionId', req, res)

        assert.equal(res.statusCode, 404)
        const body = res.body as { type: string }
        assert.include(body.type, 'ResourceNotFound')
    })
})
