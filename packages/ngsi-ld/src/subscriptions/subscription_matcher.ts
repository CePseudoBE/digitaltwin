import type { SubscriptionCache } from './subscription_cache.js'
import type { NgsiLdEntity, NgsiLdProperty } from '../types/entity.js'
import { parseQ, evaluateQ } from './q_parser.js'

/**
 * Evaluates active subscriptions against a newly written entity.
 *
 * A subscription matches when ALL of:
 * 1. The entity type is in the subscription's entityTypes list
 * 2. watchedAttributes — if set, at least one watched attribute changed vs oldEntity
 * 3. q — if set, the new entity passes the q-filter expression
 * 4. throttling — the time since last notification is >= throttling seconds
 */
export class SubscriptionMatcher {
    readonly #cache: SubscriptionCache

    constructor(cache: SubscriptionCache) {
        this.#cache = cache
    }

    /**
     * Returns the list of subscription IDs that match the given entity update.
     *
     * @param entity - The new entity state
     * @param oldEntity - The previous entity state (undefined for new entities)
     */
    async match(entity: NgsiLdEntity, oldEntity?: NgsiLdEntity): Promise<string[]> {
        const subscriptions = await this.#cache.getByType(entity.type)

        if (subscriptions.length === 0) return []

        const matched: string[] = []
        const now = Date.now()

        for (const sub of subscriptions) {
            // Check expiry
            if (sub.expiresAt && new Date(sub.expiresAt).getTime() < now) {
                continue
            }

            // Check watchedAttributes: at least one must have changed
            if (sub.watchedAttributes && sub.watchedAttributes.length > 0) {
                const changed = sub.watchedAttributes.some(attr => {
                    if (!oldEntity) return true // New entity: all attributes are "changed"
                    return !this.#attributesEqual(entity[attr], oldEntity[attr])
                })
                if (!changed) continue
            }

            // Check q-filter
            if (sub.q) {
                try {
                    const expr = parseQ(sub.q)
                    if (!evaluateQ(expr, entity)) continue
                } catch {
                    // Malformed q — skip subscription silently
                    continue
                }
            }

            // Check throttling
            if (sub.throttling > 0 && sub.lastNotificationAt) {
                const lastMs = new Date(sub.lastNotificationAt).getTime()
                const elapsedSeconds = (now - lastMs) / 1000
                if (elapsedSeconds < sub.throttling) continue
            }

            matched.push(sub.id)
        }

        return matched
    }

    /**
     * Compares two NGSI-LD attribute values for equality.
     */
    #attributesEqual(a: unknown, b: unknown): boolean {
        if (a === undefined && b === undefined) return true
        if (a === undefined || b === undefined) return false

        // Compare Property values
        if (
            typeof a === 'object' && a !== null && 'type' in a &&
            (a as NgsiLdProperty).type === 'Property' &&
            typeof b === 'object' && b !== null && 'type' in b &&
            (b as NgsiLdProperty).type === 'Property'
        ) {
            return JSON.stringify((a as NgsiLdProperty).value) === JSON.stringify((b as NgsiLdProperty).value)
        }

        return JSON.stringify(a) === JSON.stringify(b)
    }
}
