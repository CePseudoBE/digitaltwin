import { test } from '@japa/runner'
import { Redis } from 'ioredis'
import { RedisContainer } from '@testcontainers/redis'
import { EntityCache } from '../src/cache/entity_cache.js'
import type { NgsiLdEntity } from '../src/types/entity.js'
import { property } from '../src/helpers/property.js'
import { buildUrn } from '../src/helpers/urn.js'

function makeEntity(type: string, localId: string, attrs: Record<string, number | string> = {}): NgsiLdEntity {
    const entity: NgsiLdEntity = {
        id: buildUrn(type, localId),
        type,
    }
    for (const [key, value] of Object.entries(attrs)) {
        entity[key] = property(value)
    }
    return entity
}

test.group('EntityCache (Redis integration)', group => {
    let redisContainer: Awaited<ReturnType<ReturnType<typeof RedisContainer.prototype.start>['constructor']>>
    let redis: Redis
    let cache: EntityCache

    group.each.setup(async () => {
        redisContainer = await new RedisContainer('redis:7-alpine').start()
        redis = new Redis({
            host: (redisContainer as any).getHost(),
            port: (redisContainer as any).getPort(),
            maxRetriesPerRequest: null,
        })
        cache = new EntityCache(redis)
    })

    group.each.teardown(async () => {
        await redis.quit()
        await (redisContainer as any).stop()
    })

    test('set and get an entity', async ({ assert }) => {
        const entity = makeEntity('AirQualityObserved', 'sensor-1', { pm25: 42 })
        await cache.set(entity)
        const retrieved = await cache.get(entity.id)
        assert.deepEqual(retrieved, entity)
    })

    test('get returns null for non-existent entity', async ({ assert }) => {
        const result = await cache.get('urn:ngsi-ld:Unknown:nobody')
        assert.isNull(result)
    })

    test('set overwrites an existing entity', async ({ assert }) => {
        const entity = makeEntity('AirQualityObserved', 'sensor-2', { pm25: 10 })
        await cache.set(entity)

        const updated: NgsiLdEntity = { ...entity, pm25: property(99) }
        await cache.set(updated)

        const retrieved = await cache.get(entity.id)
        assert.deepEqual(retrieved, updated)
    })

    test('delete removes an entity', async ({ assert }) => {
        const entity = makeEntity('AirQualityObserved', 'sensor-3', { pm25: 5 })
        await cache.set(entity)
        await cache.delete(entity.id)
        const retrieved = await cache.get(entity.id)
        assert.isNull(retrieved)
    })

    test('delete is idempotent for non-existent entity', async ({ assert }) => {
        await assert.doesNotReject(() => cache.delete('urn:ngsi-ld:Unknown:gone'))
    })

    test('listByType returns all entities of that type', async ({ assert }) => {
        const e1 = makeEntity('WeatherObserved', 'station-1', { temperature: 15 })
        const e2 = makeEntity('WeatherObserved', 'station-2', { temperature: 20 })
        const e3 = makeEntity('AirQualityObserved', 'sensor-4', { pm25: 30 })

        await cache.set(e1)
        await cache.set(e2)
        await cache.set(e3)

        const weatherEntities = await cache.listByType('WeatherObserved')
        assert.lengthOf(weatherEntities, 2)

        const ids = weatherEntities.map(e => e.id)
        assert.includeMembers(ids, [e1.id, e2.id])
    })

    test('listByType returns empty array for unknown type', async ({ assert }) => {
        const result = await cache.listByType('NonExistentType')
        assert.deepEqual(result, [])
    })

    test('listTypes returns all known types', async ({ assert }) => {
        const e1 = makeEntity('TypeA', 'x')
        const e2 = makeEntity('TypeB', 'y')
        await cache.set(e1)
        await cache.set(e2)

        const types = await cache.listTypes()
        assert.include(types, 'TypeA')
        assert.include(types, 'TypeB')
    })

    test('type index is cleaned up after last entity of that type is deleted', async ({ assert }) => {
        const entity = makeEntity('UniqueType', 'only-one')
        await cache.set(entity)
        await cache.delete(entity.id)

        const types = await cache.listTypes()
        assert.notInclude(types, 'UniqueType')
    })

    test('list with type filter respects limit and offset', async ({ assert }) => {
        for (let i = 1; i <= 5; i++) {
            await cache.set(makeEntity('PaginatedType', `item-${i}`))
        }

        const page1 = await cache.list({ type: 'PaginatedType', limit: 2, offset: 0 })
        const page2 = await cache.list({ type: 'PaginatedType', limit: 2, offset: 2 })

        assert.lengthOf(page1, 2)
        assert.lengthOf(page2, 2)

        // No overlap
        const ids1 = new Set(page1.map(e => e.id))
        const ids2 = new Set(page2.map(e => e.id))
        const intersection = [...ids1].filter(id => ids2.has(id))
        assert.lengthOf(intersection, 0)
    })

    test('listByType does not mix entities from different types', async ({ assert }) => {
        const airEntity = makeEntity('AirQualityObserved', 'sensor-99', { pm25: 55 })
        const weatherEntity = makeEntity('WeatherObserved', 'station-99', { temperature: 21 })

        await cache.set(airEntity)
        await cache.set(weatherEntity)

        const airEntities = await cache.listByType('AirQualityObserved')
        const weatherEntities = await cache.listByType('WeatherObserved')

        const airIds = airEntities.map(e => e.id)
        const weatherIds = weatherEntities.map(e => e.id)

        assert.include(airIds, airEntity.id)
        assert.notInclude(airIds, weatherEntity.id)
        assert.include(weatherIds, weatherEntity.id)
        assert.notInclude(weatherIds, airEntity.id)
    })
})
