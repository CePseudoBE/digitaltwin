import type { Redis } from 'ioredis'
import type { Subscription } from '../types/subscription.js'

/**
 * Redis structure:
 *   SET  "ngsi:subs:type:<type>"   → set of subscription UUIDs
 *   HASH "ngsi:sub:<id>"           → serialized Subscription JSON
 */
const SUB_KEY = (id: string) => `ngsi:sub:${id}`
const TYPE_KEY = (type: string) => `ngsi:subs:type:${type}`

/**
 * Redis cache for active subscriptions.
 *
 * Warmed up at plugin startup from PostgreSQL.
 * Updated on every CRUD operation.
 */
export class SubscriptionCache {
    readonly #redis: Redis

    constructor(redis: Redis) {
        this.#redis = redis
    }

    /**
     * Loads all subscriptions from a list into the cache (called at startup).
     */
    async warmup(subscriptions: Subscription[]): Promise<void> {
        for (const sub of subscriptions) {
            await this.add(sub)
        }
    }

    /**
     * Adds or replaces a subscription in the cache.
     */
    async add(sub: Subscription): Promise<void> {
        await this.#redis.set(SUB_KEY(sub.id), JSON.stringify(sub))
        for (const type of sub.entityTypes) {
            await this.#redis.sadd(TYPE_KEY(type), sub.id)
        }
    }

    /**
     * Updates an existing subscription in the cache.
     * Removes old type index entries if entityTypes changed.
     */
    async update(sub: Subscription): Promise<void> {
        const existing = await this.getById(sub.id)
        if (existing) {
            // Remove stale type index entries
            for (const type of existing.entityTypes) {
                await this.#redis.srem(TYPE_KEY(type), sub.id)
            }
        }
        await this.add(sub)
    }

    /**
     * Removes a subscription from the cache.
     */
    async remove(id: string): Promise<void> {
        const sub = await this.getById(id)
        if (!sub) return

        await this.#redis.del(SUB_KEY(id))
        for (const type of sub.entityTypes) {
            await this.#redis.srem(TYPE_KEY(type), id)
        }
    }

    /**
     * Returns all subscription IDs watching a given entity type.
     */
    async getIdsByType(type: string): Promise<string[]> {
        return this.#redis.smembers(TYPE_KEY(type))
    }

    /**
     * Returns a subscription by id, or null if not cached.
     */
    async getById(id: string): Promise<Subscription | null> {
        const raw = await this.#redis.get(SUB_KEY(id))
        if (!raw) return null
        return JSON.parse(raw) as Subscription
    }

    /**
     * Returns all subscriptions watching a given entity type.
     */
    async getByType(type: string): Promise<Subscription[]> {
        const ids = await this.getIdsByType(type)
        const subs: Subscription[] = []

        for (const id of ids) {
            const sub = await this.getById(id)
            if (sub && sub.isActive) {
                subs.push(sub)
            }
        }

        return subs
    }

    /**
     * Updates the lastNotifiedAt timestamp for a subscription (in-cache only).
     */
    async updateLastNotified(id: string, at: string): Promise<void> {
        const sub = await this.getById(id)
        if (!sub) return

        const updated: Subscription = {
            ...sub,
            lastNotificationAt: at,
        }
        await this.#redis.set(SUB_KEY(id), JSON.stringify(updated))
    }
}
