import { test } from '@japa/runner'
import Fastify from 'fastify'
import type { FastifyInstance } from 'fastify'
import { Redis } from 'ioredis'
import { RedisContainer } from '@testcontainers/redis'
import type { StartedRedisContainer } from '@testcontainers/redis'
import { EntityCache } from '../src/cache/entity_cache.js'
import { registerEntityEndpoints } from '../src/endpoints/entities.js'
import { ngsiLdErrorHandler } from '../src/endpoints/errors.js'
import { createRouteGuards } from '../src/auth.js'
import type { NgsiLdAuthenticator } from '../src/auth.js'
import type { NgsiLdEntity } from '../src/types/entity.js'
import { property } from '../src/helpers/property.js'
import { buildUrn } from '../src/helpers/urn.js'
import { NGSI_LD_CORE_CONTEXT } from '../src/types/context.js'

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

async function buildApp(cache: EntityCache, auth: NgsiLdAuthenticator): Promise<FastifyInstance> {
    const app = Fastify({ logger: false })
    await app.register(async instance => {
        instance.setErrorHandler(ngsiLdErrorHandler)
        registerEntityEndpoints(instance, cache, createRouteGuards(auth, true))
    })
    return app
}

function makeEntity(type: string, localId: string, attrs: Record<string, number | string> = {}): NgsiLdEntity {
    const entity: NgsiLdEntity = { id: buildUrn(type, localId), type }
    for (const [key, value] of Object.entries(attrs)) {
        entity[key] = property(value)
    }
    return entity
}

const entityUrl = (id: string) => `/ngsi-ld/v1/entities/${encodeURIComponent(id)}`

test.group('Entity endpoints (integration)', group => {
    let redisContainer: StartedRedisContainer
    let redis: Redis
    let cache: EntityCache
    let app: FastifyInstance

    group.each.setup(async () => {
        redisContainer = await new RedisContainer('redis:7-alpine').start()
        redis = new Redis({ host: redisContainer.getHost(), port: redisContainer.getPort(), maxRetriesPerRequest: null })
        cache = new EntityCache(redis)
        app = await buildApp(cache, allowAll)
    })

    group.each.teardown(async () => {
        await app.close()
        await redis.quit()
        await redisContainer.stop()
    })

    // GET /ngsi-ld/v1/entities

    test('GET /ngsi-ld/v1/entities returns 200 with empty array when cache is empty', async ({ assert }) => {
        const res = await app.inject('/ngsi-ld/v1/entities')

        assert.equal(res.statusCode, 200)
        assert.include(String(res.headers['content-type']), 'application/ld+json')
        assert.deepEqual(res.json(), [])
    })

    test('GET /ngsi-ld/v1/entities returns all entities with @context added', async ({ assert }) => {
        await cache.set(makeEntity('AirQualityObserved', 'sensor-1', { pm25: 42 }))
        await cache.set(makeEntity('WeatherObserved', 'station-1', { temperature: 15 }))

        const res = await app.inject('/ngsi-ld/v1/entities')

        assert.equal(res.statusCode, 200)
        const body = res.json() as NgsiLdEntity[]
        assert.lengthOf(body, 2)
        for (const entity of body) {
            assert.equal(entity['@context'], NGSI_LD_CORE_CONTEXT)
        }
    })

    test('GET /ngsi-ld/v1/entities?type=X returns only entities of that type', async ({ assert }) => {
        await cache.set(makeEntity('AirQualityObserved', 'sensor-2', { pm25: 30 }))
        await cache.set(makeEntity('WeatherObserved', 'station-2', { temperature: 18 }))

        const res = await app.inject('/ngsi-ld/v1/entities?type=AirQualityObserved')

        assert.equal(res.statusCode, 200)
        const body = res.json() as NgsiLdEntity[]
        assert.lengthOf(body, 1)
        assert.equal(body[0].type, 'AirQualityObserved')
    })

    test('GET /ngsi-ld/v1/entities?q=pm25>30 returns only matching entities', async ({ assert }) => {
        const e1 = makeEntity('AirQualityObserved', 'sensor-3', { pm25: 50 })
        await cache.set(e1)
        await cache.set(makeEntity('AirQualityObserved', 'sensor-4', { pm25: 10 }))

        const res = await app.inject({ url: '/ngsi-ld/v1/entities', query: { q: 'pm25>30' } })

        assert.equal(res.statusCode, 200)
        const body = res.json() as NgsiLdEntity[]
        assert.lengthOf(body, 1)
        assert.equal(body[0].id, e1.id)
    })

    test('the q filter runs before pagination, so a page never hides matches', async ({ assert }) => {
        for (let i = 0; i < 30; i++) {
            await cache.set(makeEntity('AirQualityObserved', `sensor-${String(i).padStart(2, '0')}`, { pm25: i >= 25 ? 90 : 5 }))
        }

        const res = await app.inject({ url: '/ngsi-ld/v1/entities', query: { q: 'pm25>50', limit: '20' } })

        assert.equal(res.statusCode, 200)
        assert.lengthOf(res.json() as NgsiLdEntity[], 5)

        const secondPage = await app.inject({ url: '/ngsi-ld/v1/entities', query: { q: 'pm25>50', limit: '2', offset: '4' } })
        assert.lengthOf(secondPage.json() as NgsiLdEntity[], 1)
    })

    test('GET /ngsi-ld/v1/entities with a non-numeric or out-of-range limit returns 400', async ({ assert }) => {
        for (const limit of ['abc', '0', '5000']) {
            const res = await app.inject({ url: '/ngsi-ld/v1/entities', query: { limit } })
            assert.equal(res.statusCode, 400, limit)
            assert.include((res.json() as { type: string }).type, 'BadRequestData')
        }
    })

    test('GET /ngsi-ld/v1/entities with invalid q-filter returns 400', async ({ assert }) => {
        const res = await app.inject({ url: '/ngsi-ld/v1/entities', query: { q: 'invalid!!!' } })

        assert.equal(res.statusCode, 400)
        assert.include((res.json() as { type: string }).type, 'BadRequestData')
    })

    test('GET /ngsi-ld/v1/entities?attrs=pm25 projects entities to only that attribute', async ({ assert }) => {
        await cache.set(makeEntity('AirQualityObserved', 'sensor-5', { pm25: 60, temperature: 22 }))

        const res = await app.inject('/ngsi-ld/v1/entities?attrs=pm25')

        assert.equal(res.statusCode, 200)
        const body = res.json() as NgsiLdEntity[]
        assert.lengthOf(body, 1)
        assert.property(body[0], 'pm25')
        assert.notProperty(body[0], 'temperature')
        assert.property(body[0], 'id')
        assert.property(body[0], 'type')
        assert.property(body[0], '@context')
    })

    test('writes require credentials while reads stay public', async ({ assert }) => {
        const guarded = await buildApp(cache, denyAll)
        try {
            const write = await guarded.inject({ method: 'POST', url: '/ngsi-ld/v1/entities', payload: makeEntity('AirQualityObserved', 'sensor-guard', { pm25: 1 }) })
            assert.equal(write.statusCode, 401)
            assert.include((write.json() as { type: string }).type, 'Unauthorized')

            const read = await guarded.inject('/ngsi-ld/v1/entities')
            assert.equal(read.statusCode, 200)
        } finally {
            await guarded.close()
        }
    })

    // POST /ngsi-ld/v1/entities

    test('POST /ngsi-ld/v1/entities with valid body returns 201 and Location header', async ({ assert }) => {
        const entity = makeEntity('AirQualityObserved', 'sensor-6', { pm25: 33 })

        const res = await app.inject({ method: 'POST', url: '/ngsi-ld/v1/entities', payload: entity })

        assert.equal(res.statusCode, 201)
        assert.equal(res.body, '')
        assert.equal(res.headers['location'], entityUrl(entity.id))
        assert.deepEqual(await cache.get(entity.id), entity)
    })

    test('POST /ngsi-ld/v1/entities missing id or type returns 400', async ({ assert }) => {
        for (const payload of [{ type: 'AirQualityObserved' }, { id: buildUrn('AirQualityObserved', 'sensor-99') }, 'not json']) {
            const res = await app.inject({ method: 'POST', url: '/ngsi-ld/v1/entities', payload, headers: { 'content-type': 'application/json' } })
            assert.equal(res.statusCode, 400)
            assert.include((res.json() as { type: string }).type, 'BadRequestData')
        }
    })

    // GET /ngsi-ld/v1/entities/:entityId

    test('GET /ngsi-ld/v1/entities/:entityId returns 200 and entity with @context', async ({ assert }) => {
        const entity = makeEntity('AirQualityObserved', 'sensor-7', { pm25: 77 })
        await cache.set(entity)

        const res = await app.inject(entityUrl(entity.id))

        assert.equal(res.statusCode, 200)
        const body = res.json() as NgsiLdEntity
        assert.equal(body.id, entity.id)
        assert.property(body, '@context')

        const projected = await app.inject(`${entityUrl(entity.id)}?attrs=nothing`)
        assert.deepEqual(Object.keys(projected.json() as object).sort(), ['@context', 'id', 'type'])
    })

    test('GET /ngsi-ld/v1/entities/:entityId with unknown id returns 404', async ({ assert }) => {
        const res = await app.inject(entityUrl(buildUrn('AirQualityObserved', 'nobody')))

        assert.equal(res.statusCode, 404)
        assert.include((res.json() as { type: string }).type, 'ResourceNotFound')
    })

    // PATCH /ngsi-ld/v1/entities/:entityId

    test('PATCH /ngsi-ld/v1/entities/:entityId returns 204 and updates the entity in cache', async ({ assert }) => {
        const entity = makeEntity('AirQualityObserved', 'sensor-8', { pm25: 10 })
        await cache.set(entity)

        const res = await app.inject({ method: 'PATCH', url: entityUrl(entity.id), payload: { pm25: property(99), id: 'urn:ngsi-ld:Tampered:1' } })

        assert.equal(res.statusCode, 204)
        const updated = await cache.get(entity.id)
        assert.deepEqual(updated!.pm25, property(99))
        assert.equal(updated!.id, entity.id)
    })

    test('PATCH /ngsi-ld/v1/entities/:entityId with unknown id returns 404', async ({ assert }) => {
        const res = await app.inject({ method: 'PATCH', url: entityUrl(buildUrn('AirQualityObserved', 'ghost')), payload: { pm25: property(1) } })

        assert.equal(res.statusCode, 404)
        assert.include((res.json() as { type: string }).type, 'ResourceNotFound')
    })

    // DELETE /ngsi-ld/v1/entities/:entityId

    test('DELETE /ngsi-ld/v1/entities/:entityId returns 204 and removes entity from cache', async ({ assert }) => {
        const entity = makeEntity('AirQualityObserved', 'sensor-9', { pm25: 5 })
        await cache.set(entity)

        const res = await app.inject({ method: 'DELETE', url: entityUrl(entity.id) })

        assert.equal(res.statusCode, 204)
        assert.isNull(await cache.get(entity.id))
    })

    test('DELETE /ngsi-ld/v1/entities/:entityId with unknown id returns 404', async ({ assert }) => {
        const res = await app.inject({ method: 'DELETE', url: entityUrl(buildUrn('AirQualityObserved', 'phantom')) })

        assert.equal(res.statusCode, 404)
        assert.include((res.json() as { type: string }).type, 'ResourceNotFound')
    })
})
