import { test } from '@japa/runner'
import { Redis } from 'ioredis'
import { RedisContainer } from '@testcontainers/redis'
import { EntityCache } from '../src/cache/entity_cache.js'
import { registerEntityEndpoints } from '../src/endpoints/entities.js'
import type { NgsiLdEntity } from '../src/types/entity.js'
import { property } from '../src/helpers/property.js'
import { buildUrn } from '../src/helpers/urn.js'
import { NGSI_LD_CORE_CONTEXT } from '../src/types/context.js'

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

// --- Entity helpers ---

function makeEntity(type: string, localId: string, attrs: Record<string, number | string> = {}): NgsiLdEntity {
    const entity: NgsiLdEntity = { id: buildUrn(type, localId), type }
    for (const [key, value] of Object.entries(attrs)) {
        entity[key] = property(value)
    }
    return entity
}

// --- Tests ---

test.group('Entity endpoints (integration)', group => {
    let redisContainer: Awaited<ReturnType<ReturnType<typeof RedisContainer.prototype.start>['constructor']>>
    let redis: Redis
    let cache: EntityCache
    let router: MockRouter

    group.each.setup(async () => {
        redisContainer = await new RedisContainer('redis:7-alpine').start()
        redis = new Redis({
            host: (redisContainer as any).getHost(),
            port: (redisContainer as any).getPort(),
            maxRetriesPerRequest: null,
        })
        cache = new EntityCache(redis)
        router = new MockRouter()
        registerEntityEndpoints(router as any, cache, null as any, null as any)
    })

    group.each.teardown(async () => {
        await redis.quit()
        await (redisContainer as any).stop()
    })

    // GET /ngsi-ld/v1/entities

    test('GET /ngsi-ld/v1/entities returns 200 with empty array when cache is empty', async ({ assert }) => {
        const req = makeReq({ query: {} })
        const res = makeRes()

        await router.invoke('GET', '/ngsi-ld/v1/entities', req, res)

        assert.equal(res.statusCode, 200)
        assert.deepEqual(res.body, [])
    })

    test('GET /ngsi-ld/v1/entities returns all entities with @context added', async ({ assert }) => {
        const e1 = makeEntity('AirQualityObserved', 'sensor-1', { pm25: 42 })
        const e2 = makeEntity('WeatherObserved', 'station-1', { temperature: 15 })
        await cache.set(e1)
        await cache.set(e2)

        const req = makeReq({ query: {} })
        const res = makeRes()

        await router.invoke('GET', '/ngsi-ld/v1/entities', req, res)

        assert.equal(res.statusCode, 200)
        const body = res.body as NgsiLdEntity[]
        assert.lengthOf(body, 2)
        for (const entity of body) {
            assert.property(entity, '@context')
            assert.equal(entity['@context'], NGSI_LD_CORE_CONTEXT)
        }
    })

    test('GET /ngsi-ld/v1/entities?type=X returns only entities of that type', async ({ assert }) => {
        const e1 = makeEntity('AirQualityObserved', 'sensor-2', { pm25: 30 })
        const e2 = makeEntity('WeatherObserved', 'station-2', { temperature: 18 })
        await cache.set(e1)
        await cache.set(e2)

        const req = makeReq({ query: { type: 'AirQualityObserved' } })
        const res = makeRes()

        await router.invoke('GET', '/ngsi-ld/v1/entities', req, res)

        assert.equal(res.statusCode, 200)
        const body = res.body as NgsiLdEntity[]
        assert.lengthOf(body, 1)
        assert.equal(body[0].type, 'AirQualityObserved')
    })

    test('GET /ngsi-ld/v1/entities?q=pm25>30 returns only matching entities', async ({ assert }) => {
        const e1 = makeEntity('AirQualityObserved', 'sensor-3', { pm25: 50 })
        const e2 = makeEntity('AirQualityObserved', 'sensor-4', { pm25: 10 })
        await cache.set(e1)
        await cache.set(e2)

        const req = makeReq({ query: { q: 'pm25>30' } })
        const res = makeRes()

        await router.invoke('GET', '/ngsi-ld/v1/entities', req, res)

        assert.equal(res.statusCode, 200)
        const body = res.body as NgsiLdEntity[]
        assert.lengthOf(body, 1)
        assert.equal(body[0].id, e1.id)
    })

    test('GET /ngsi-ld/v1/entities with invalid q-filter returns 400', async ({ assert }) => {
        const req = makeReq({ query: { q: 'invalid!!!' } })
        const res = makeRes()

        await router.invoke('GET', '/ngsi-ld/v1/entities', req, res)

        assert.equal(res.statusCode, 400)
        const body = res.body as { type: string }
        assert.include(body.type, 'BadRequestData')
    })

    test('GET /ngsi-ld/v1/entities?attrs=pm25 projects entities to only that attribute', async ({ assert }) => {
        const e1 = makeEntity('AirQualityObserved', 'sensor-5', { pm25: 60, temperature: 22 })
        await cache.set(e1)

        const req = makeReq({ query: { attrs: 'pm25' } })
        const res = makeRes()

        await router.invoke('GET', '/ngsi-ld/v1/entities', req, res)

        assert.equal(res.statusCode, 200)
        const body = res.body as NgsiLdEntity[]
        assert.lengthOf(body, 1)
        assert.property(body[0], 'pm25')
        assert.notProperty(body[0], 'temperature')
        assert.property(body[0], 'id')
        assert.property(body[0], 'type')
        assert.property(body[0], '@context')
    })

    // POST /ngsi-ld/v1/entities

    test('POST /ngsi-ld/v1/entities with valid body returns 201 and Location header', async ({ assert }) => {
        const entity = makeEntity('AirQualityObserved', 'sensor-6', { pm25: 33 })
        const req = makeReq({ body: entity })
        const res = makeRes()

        await router.invoke('POST', '/ngsi-ld/v1/entities', req, res)

        assert.equal(res.statusCode, 201)
        assert.isTrue(res.ended)
        assert.equal(res.resHeaders['Location'], `/ngsi-ld/v1/entities/${encodeURIComponent(entity.id)}`)
    })

    test('POST /ngsi-ld/v1/entities missing id returns 400', async ({ assert }) => {
        const req = makeReq({ body: { type: 'AirQualityObserved' } })
        const res = makeRes()

        await router.invoke('POST', '/ngsi-ld/v1/entities', req, res)

        assert.equal(res.statusCode, 400)
        const body = res.body as { type: string }
        assert.include(body.type, 'BadRequestData')
    })

    test('POST /ngsi-ld/v1/entities missing type returns 400', async ({ assert }) => {
        const req = makeReq({ body: { id: buildUrn('AirQualityObserved', 'sensor-99') } })
        const res = makeRes()

        await router.invoke('POST', '/ngsi-ld/v1/entities', req, res)

        assert.equal(res.statusCode, 400)
        const body = res.body as { type: string }
        assert.include(body.type, 'BadRequestData')
    })

    // GET /ngsi-ld/v1/entities/:entityId

    test('GET /ngsi-ld/v1/entities/:entityId returns 200 and entity with @context', async ({ assert }) => {
        const entity = makeEntity('AirQualityObserved', 'sensor-7', { pm25: 77 })
        await cache.set(entity)

        const req = makeReq({ params: { entityId: entity.id } })
        const res = makeRes()

        await router.invoke('GET', '/ngsi-ld/v1/entities/:entityId', req, res)

        assert.equal(res.statusCode, 200)
        const body = res.body as NgsiLdEntity
        assert.equal(body.id, entity.id)
        assert.property(body, '@context')
    })

    test('GET /ngsi-ld/v1/entities/:entityId with unknown id returns 404', async ({ assert }) => {
        const req = makeReq({ params: { entityId: buildUrn('AirQualityObserved', 'nobody') } })
        const res = makeRes()

        await router.invoke('GET', '/ngsi-ld/v1/entities/:entityId', req, res)

        assert.equal(res.statusCode, 404)
        const body = res.body as { type: string }
        assert.include(body.type, 'ResourceNotFound')
    })

    // PATCH /ngsi-ld/v1/entities/:entityId

    test('PATCH /ngsi-ld/v1/entities/:entityId returns 204 and updates the entity in cache', async ({ assert }) => {
        const entity = makeEntity('AirQualityObserved', 'sensor-8', { pm25: 10 })
        await cache.set(entity)

        const req = makeReq({
            params: { entityId: entity.id },
            body: { pm25: property(99) },
        })
        const res = makeRes()

        await router.invoke('PATCH', '/ngsi-ld/v1/entities/:entityId', req, res)

        assert.equal(res.statusCode, 204)
        assert.isTrue(res.ended)

        const updated = await cache.get(entity.id)
        assert.isNotNull(updated)
        assert.deepEqual(updated!.pm25, property(99))
    })

    test('PATCH /ngsi-ld/v1/entities/:entityId with unknown id returns 404', async ({ assert }) => {
        const req = makeReq({
            params: { entityId: buildUrn('AirQualityObserved', 'ghost') },
            body: { pm25: property(1) },
        })
        const res = makeRes()

        await router.invoke('PATCH', '/ngsi-ld/v1/entities/:entityId', req, res)

        assert.equal(res.statusCode, 404)
        const body = res.body as { type: string }
        assert.include(body.type, 'ResourceNotFound')
    })

    // DELETE /ngsi-ld/v1/entities/:entityId

    test('DELETE /ngsi-ld/v1/entities/:entityId returns 204 and removes entity from cache', async ({ assert }) => {
        const entity = makeEntity('AirQualityObserved', 'sensor-9', { pm25: 5 })
        await cache.set(entity)

        const req = makeReq({ params: { entityId: entity.id } })
        const res = makeRes()

        await router.invoke('DELETE', '/ngsi-ld/v1/entities/:entityId', req, res)

        assert.equal(res.statusCode, 204)
        assert.isTrue(res.ended)

        const gone = await cache.get(entity.id)
        assert.isNull(gone)
    })

    test('DELETE /ngsi-ld/v1/entities/:entityId with unknown id returns 404', async ({ assert }) => {
        const req = makeReq({ params: { entityId: buildUrn('AirQualityObserved', 'phantom') } })
        const res = makeRes()

        await router.invoke('DELETE', '/ngsi-ld/v1/entities/:entityId', req, res)

        assert.equal(res.statusCode, 404)
        const body = res.body as { type: string }
        assert.include(body.type, 'ResourceNotFound')
    })
})
