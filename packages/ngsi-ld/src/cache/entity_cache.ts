import type { Redis } from 'ioredis'
import type { NgsiLdEntity } from '../types/entity.js'

const KEY_PREFIX = 'ngsi:entity:'
const TYPES_KEY = 'ngsi:types'

/**
 * Redis-backed cache for NGSI-LD entity last-state.
 *
 * - Each entity is stored as a Redis HASH under `ngsi:entity:<id>`
 * - A Redis SET `ngsi:types` indexes all known entity types
 * - A Redis SET `ngsi:type:<type>` indexes all entity IDs for that type
 */
export class EntityCache {
    readonly #redis: Redis

    constructor(redis: Redis) {
        this.#redis = redis
    }

    /**
     * Stores or overwrites an entity in the cache.
     */
    async set(entity: NgsiLdEntity): Promise<void> {
        const key = `${KEY_PREFIX}${entity.id}`
        const serialized = JSON.stringify(entity)

        await Promise.all([
            this.#redis.set(key, serialized),
            this.#redis.sadd(TYPES_KEY, entity.type),
            this.#redis.sadd(`ngsi:type:${entity.type}`, entity.id),
        ])
    }

    /**
     * Retrieves an entity by its URN, or null if not found.
     */
    async get(id: string): Promise<NgsiLdEntity | null> {
        const raw = await this.#redis.get(`${KEY_PREFIX}${id}`)
        if (!raw) return null
        return JSON.parse(raw) as NgsiLdEntity
    }

    /**
     * Removes an entity from the cache.
     */
    async delete(id: string): Promise<void> {
        const existing = await this.get(id)
        if (!existing) return

        await Promise.all([
            this.#redis.del(`${KEY_PREFIX}${id}`),
            this.#redis.srem(`ngsi:type:${existing.type}`, id),
        ])

        // Clean up the type index entry if no more entities of that type
        const remaining = await this.#redis.scard(`ngsi:type:${existing.type}`)
        if (remaining === 0) {
            await this.#redis.srem(TYPES_KEY, existing.type)
        }
    }

    /**
     * Returns all entities of a given type.
     */
    async listByType(type: string): Promise<NgsiLdEntity[]> {
        const ids = await this.#redis.smembers(`ngsi:type:${type}`)
        if (ids.length === 0) return []

        const keys = ids.map(id => `${KEY_PREFIX}${id}`)
        const raws = await this.#redis.mget(...keys)

        return raws
            .filter((raw): raw is string => raw !== null)
            .map(raw => JSON.parse(raw) as NgsiLdEntity)
    }

    /**
     * Returns all known entity types.
     */
    async listTypes(): Promise<string[]> {
        return this.#redis.smembers(TYPES_KEY)
    }

    /**
     * Returns all cached entities, optionally filtered by type.
     */
    async list(options?: { type?: string; limit?: number; offset?: number }): Promise<NgsiLdEntity[]> {
        if (options?.type) {
            const all = await this.listByType(options.type)
            const offset = options.offset ?? 0
            const limit = options.limit ?? all.length
            return all.slice(offset, offset + limit)
        }

        const types = await this.listTypes()
        const results: NgsiLdEntity[] = []

        for (const type of types) {
            const entities = await this.listByType(type)
            results.push(...entities)
        }

        const offset = options?.offset ?? 0
        const limit = options?.limit ?? results.length
        return results.slice(offset, offset + limit)
    }
}
