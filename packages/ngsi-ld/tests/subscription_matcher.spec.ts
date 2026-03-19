import { test } from '@japa/runner'
import { SubscriptionMatcher } from '../src/subscriptions/subscription_matcher.js'
import type { SubscriptionCache } from '../src/subscriptions/subscription_cache.js'
import type { Subscription } from '../src/types/subscription.js'
import type { NgsiLdEntity } from '../src/types/entity.js'
import { property } from '../src/helpers/property.js'
import { buildUrn } from '../src/helpers/urn.js'

// --- Mock SubscriptionCache ---

class MockSubscriptionCache {
    private readonly subs: Map<string, Subscription>

    constructor(subs: Subscription[]) {
        this.subs = new Map(subs.map(s => [s.id, s]))
    }

    async getByType(type: string): Promise<Subscription[]> {
        return [...this.subs.values()].filter(
            s => s.isActive && s.entityTypes.includes(type)
        )
    }

    async getById(id: string): Promise<Subscription | null> {
        return this.subs.get(id) ?? null
    }

    async updateLastNotified(_id: string, _at: string): Promise<void> {}
    async add(_sub: Subscription): Promise<void> {}
    async update(_sub: Subscription): Promise<void> {}
    async remove(_id: string): Promise<void> {}
    async getIdsByType(_type: string): Promise<string[]> { return [] }
    async warmup(_subs: Subscription[]): Promise<void> {}
}

// --- Helper builders ---

function makeSub(overrides: Partial<Subscription> = {}): Subscription {
    return {
        id: 'sub-1',
        entityTypes: ['AirQualityObserved'],
        notificationEndpoint: 'https://example.com/notify',
        notificationFormat: 'normalized',
        throttling: 0,
        isActive: true,
        timesSent: 0,
        timesFailed: 0,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
        ...overrides,
    }
}

function makeEntity(attrs: Record<string, number | string | boolean> = {}): NgsiLdEntity {
    const entity: NgsiLdEntity = {
        id: buildUrn('AirQualityObserved', 'sensor-1'),
        type: 'AirQualityObserved',
    }
    for (const [key, value] of Object.entries(attrs)) {
        entity[key] = property(value)
    }
    return entity
}

// --- Tests ---

test.group('SubscriptionMatcher', () => {
    test('returns empty array when no subscriptions exist for the type', async ({ assert }) => {
        const cache = new MockSubscriptionCache([]) as unknown as SubscriptionCache
        const matcher = new SubscriptionMatcher(cache)
        const entity = makeEntity({ pm25: 63 })

        const result = await matcher.match(entity)
        assert.deepEqual(result, [])
    })

    test('returns matching subscription when entity type matches', async ({ assert }) => {
        const sub = makeSub()
        const cache = new MockSubscriptionCache([sub]) as unknown as SubscriptionCache
        const matcher = new SubscriptionMatcher(cache)
        const entity = makeEntity({ pm25: 63 })

        const result = await matcher.match(entity)
        assert.deepEqual(result, ['sub-1'])
    })

    test('watchedAttributes: includes sub when attribute changed', async ({ assert }) => {
        const sub = makeSub({ watchedAttributes: ['pm25'] })
        const cache = new MockSubscriptionCache([sub]) as unknown as SubscriptionCache
        const matcher = new SubscriptionMatcher(cache)

        const oldEntity = makeEntity({ pm25: 30 })
        const newEntity = makeEntity({ pm25: 63 })

        const result = await matcher.match(newEntity, oldEntity)
        assert.deepEqual(result, ['sub-1'])
    })

    test('watchedAttributes: excludes sub when attribute did not change', async ({ assert }) => {
        const sub = makeSub({ watchedAttributes: ['pm25'] })
        const cache = new MockSubscriptionCache([sub]) as unknown as SubscriptionCache
        const matcher = new SubscriptionMatcher(cache)

        const entity = makeEntity({ pm25: 63 })
        const sameEntity = makeEntity({ pm25: 63 })

        const result = await matcher.match(entity, sameEntity)
        assert.deepEqual(result, [])
    })

    test('watchedAttributes: includes sub for new entity (no oldEntity)', async ({ assert }) => {
        const sub = makeSub({ watchedAttributes: ['pm25'] })
        const cache = new MockSubscriptionCache([sub]) as unknown as SubscriptionCache
        const matcher = new SubscriptionMatcher(cache)

        const entity = makeEntity({ pm25: 63 })

        const result = await matcher.match(entity)
        assert.deepEqual(result, ['sub-1'])
    })

    test('q-filter: passes when entity matches', async ({ assert }) => {
        const sub = makeSub({ q: 'pm25>30' })
        const cache = new MockSubscriptionCache([sub]) as unknown as SubscriptionCache
        const matcher = new SubscriptionMatcher(cache)

        const entity = makeEntity({ pm25: 63 })
        const result = await matcher.match(entity)
        assert.deepEqual(result, ['sub-1'])
    })

    test('q-filter: excludes when entity does not match', async ({ assert }) => {
        const sub = makeSub({ q: 'pm25>30' })
        const cache = new MockSubscriptionCache([sub]) as unknown as SubscriptionCache
        const matcher = new SubscriptionMatcher(cache)

        const entity = makeEntity({ pm25: 10 })
        const result = await matcher.match(entity)
        assert.deepEqual(result, [])
    })

    test('throttling: blocks notification when not enough time has passed', async ({ assert }) => {
        const lastNotifiedAt = new Date(Date.now() - 5000).toISOString() // 5 seconds ago
        const sub = makeSub({ throttling: 60, lastNotificationAt: lastNotifiedAt })
        const cache = new MockSubscriptionCache([sub]) as unknown as SubscriptionCache
        const matcher = new SubscriptionMatcher(cache)

        const entity = makeEntity({ pm25: 63 })
        const result = await matcher.match(entity)
        assert.deepEqual(result, [])
    })

    test('throttling: allows notification when enough time has passed', async ({ assert }) => {
        const lastNotifiedAt = new Date(Date.now() - 120000).toISOString() // 2 minutes ago
        const sub = makeSub({ throttling: 60, lastNotificationAt: lastNotifiedAt })
        const cache = new MockSubscriptionCache([sub]) as unknown as SubscriptionCache
        const matcher = new SubscriptionMatcher(cache)

        const entity = makeEntity({ pm25: 63 })
        const result = await matcher.match(entity)
        assert.deepEqual(result, ['sub-1'])
    })

    test('throttling: no block when throttling is 0', async ({ assert }) => {
        const sub = makeSub({ throttling: 0, lastNotificationAt: new Date().toISOString() })
        const cache = new MockSubscriptionCache([sub]) as unknown as SubscriptionCache
        const matcher = new SubscriptionMatcher(cache)

        const entity = makeEntity({ pm25: 63 })
        const result = await matcher.match(entity)
        assert.deepEqual(result, ['sub-1'])
    })

    test('expired subscription is skipped', async ({ assert }) => {
        const pastDate = new Date(Date.now() - 10000).toISOString()
        const sub = makeSub({ expiresAt: pastDate })
        const cache = new MockSubscriptionCache([sub]) as unknown as SubscriptionCache
        const matcher = new SubscriptionMatcher(cache)

        const entity = makeEntity({ pm25: 63 })
        const result = await matcher.match(entity)
        assert.deepEqual(result, [])
    })

    test('inactive subscription is excluded via cache getByType filter', async ({ assert }) => {
        const sub = makeSub({ isActive: false })
        const cache = new MockSubscriptionCache([sub]) as unknown as SubscriptionCache
        const matcher = new SubscriptionMatcher(cache)

        const entity = makeEntity({ pm25: 63 })
        const result = await matcher.match(entity)
        assert.deepEqual(result, [])
    })

    test('watchedAttributes OR semantics: matches when any one attribute changed', async ({ assert }) => {
        const sub = makeSub({ watchedAttributes: ['pm25', 'temperature'] })
        const cache = new MockSubscriptionCache([sub]) as unknown as SubscriptionCache
        const matcher = new SubscriptionMatcher(cache)

        // Only pm25 changed, temperature did not
        const oldEntity = makeEntity({ pm25: 30, temperature: 20 })
        const newEntity = makeEntity({ pm25: 63, temperature: 20 })

        const result = await matcher.match(newEntity, oldEntity)
        assert.deepEqual(result, ['sub-1'])
    })

    test('watchedAttributes OR semantics: excludes sub when none of the watched attributes changed', async ({ assert }) => {
        const sub = makeSub({ watchedAttributes: ['pm25', 'temperature'] })
        const cache = new MockSubscriptionCache([sub]) as unknown as SubscriptionCache
        const matcher = new SubscriptionMatcher(cache)

        const entity = makeEntity({ pm25: 63, temperature: 20 })
        const sameEntity = makeEntity({ pm25: 63, temperature: 20 })

        const result = await matcher.match(entity, sameEntity)
        assert.deepEqual(result, [])
    })

    test('watchedAttributes: empty array behaves like undefined — matches everything', async ({ assert }) => {
        const sub = makeSub({ watchedAttributes: [] })
        const cache = new MockSubscriptionCache([sub]) as unknown as SubscriptionCache
        const matcher = new SubscriptionMatcher(cache)

        const entity = makeEntity({ pm25: 63 })
        const result = await matcher.match(entity)
        assert.deepEqual(result, ['sub-1'])
    })

    test('throttling: always allows when no lastNotificationAt set', async ({ assert }) => {
        const sub = makeSub({ throttling: 60, lastNotificationAt: undefined })
        const cache = new MockSubscriptionCache([sub]) as unknown as SubscriptionCache
        const matcher = new SubscriptionMatcher(cache)

        const entity = makeEntity({ pm25: 63 })
        const result = await matcher.match(entity)
        assert.deepEqual(result, ['sub-1'])
    })

    test('malformed q-filter is silently skipped', async ({ assert }) => {
        const sub = makeSub({ q: 'not-valid-q!!!' })
        const cache = new MockSubscriptionCache([sub]) as unknown as SubscriptionCache
        const matcher = new SubscriptionMatcher(cache)

        const entity = makeEntity({ pm25: 63 })
        // Should not throw, and should skip the subscription
        const result = await matcher.match(entity)
        assert.deepEqual(result, [])
    })
})
