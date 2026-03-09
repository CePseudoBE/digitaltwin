import type { Router, Request, Response } from 'ultimate-express'
import type { EntityCache } from '../cache/entity_cache.js'
import type { NgsiLdEntity } from '../types/entity.js'
import type { SubscriptionStore } from '../subscriptions/subscription_store.js'
import type { SubscriptionCache } from '../subscriptions/subscription_cache.js'
import { NGSI_LD_CORE_CONTEXT } from '../types/context.js'
import { parseQ, evaluateQ } from '../subscriptions/q_parser.js'

const LD_JSON = 'application/ld+json'

function withContext(entity: NgsiLdEntity): NgsiLdEntity {
    return {
        ...entity,
        '@context': entity['@context'] ?? NGSI_LD_CORE_CONTEXT,
    }
}

/**
 * Registers NGSI-LD entity endpoints on the provided router.
 */
export function registerEntityEndpoints(
    router: Router,
    entityCache: EntityCache,
    _subscriptionStore: SubscriptionStore,
    _subscriptionCache: SubscriptionCache
): void {
    /**
     * GET /ngsi-ld/v1/entities
     * Query entities by type, q-filter, attributes, pagination.
     */
    router.get('/ngsi-ld/v1/entities', async (req: Request, res: Response) => {
        const type = req.query['type'] as string | undefined
        const q = req.query['q'] as string | undefined
        const attrs = req.query['attrs'] as string | undefined
        const limit = parseInt(String(req.query['limit'] ?? '20'), 10)
        const offset = parseInt(String(req.query['offset'] ?? '0'), 10)

        try {
            let entities = await entityCache.list({ type, limit, offset })

            // Apply q-filter
            if (q) {
                try {
                    const expr = parseQ(q)
                    entities = entities.filter(e => evaluateQ(expr, e))
                } catch {
                    res.status(400).json({ type: 'https://uri.etsi.org/ngsi-ld/errors/BadRequestData', title: 'Invalid q filter' })
                    return
                }
            }

            // Project attributes
            if (attrs) {
                const attrsArray = attrs.split(',').map(a => a.trim())
                entities = entities.map(e => {
                    const projected: NgsiLdEntity = { id: e.id, type: e.type }
                    for (const attr of attrsArray) {
                        if (e[attr] !== undefined) projected[attr] = e[attr]
                    }
                    return withContext(projected)
                })
            } else {
                entities = entities.map(withContext)
            }

            res.setHeader('Content-Type', LD_JSON)
            res.status(200).json(entities)
        } catch (err) {
            res.status(500).json({ type: 'https://uri.etsi.org/ngsi-ld/errors/InternalError', title: String(err) })
        }
    })

    /**
     * POST /ngsi-ld/v1/entities
     * Create or replace an entity in the cache.
     */
    router.post('/ngsi-ld/v1/entities', async (req: Request, res: Response) => {
        const body = req.body as NgsiLdEntity

        if (!body || !body.id || !body.type) {
            res.status(400).json({ type: 'https://uri.etsi.org/ngsi-ld/errors/BadRequestData', title: 'Missing id or type' })
            return
        }

        try {
            await entityCache.set(body)
            res.setHeader('Location', `/ngsi-ld/v1/entities/${encodeURIComponent(body.id)}`)
            res.status(201).end()
        } catch (err) {
            res.status(500).json({ type: 'https://uri.etsi.org/ngsi-ld/errors/InternalError', title: String(err) })
        }
    })

    /**
     * GET /ngsi-ld/v1/entities/:entityId
     */
    router.get('/ngsi-ld/v1/entities/:entityId', async (req: Request, res: Response) => {
        const entityId = decodeURIComponent(req.params['entityId'] as string)
        const attrs = req.query['attrs'] as string | undefined

        try {
            let entity = await entityCache.get(entityId)
            if (!entity) {
                res.status(404).json({ type: 'https://uri.etsi.org/ngsi-ld/errors/ResourceNotFound', title: 'Entity not found' })
                return
            }

            if (attrs) {
                const attrsArray = attrs.split(',').map(a => a.trim())
                const projected: NgsiLdEntity = { id: entity.id, type: entity.type }
                for (const attr of attrsArray) {
                    if (entity[attr] !== undefined) projected[attr] = entity[attr]
                }
                entity = withContext(projected)
            } else {
                entity = withContext(entity)
            }

            res.setHeader('Content-Type', LD_JSON)
            res.status(200).json(entity)
        } catch (err) {
            res.status(500).json({ type: 'https://uri.etsi.org/ngsi-ld/errors/InternalError', title: String(err) })
        }
    })

    /**
     * PATCH /ngsi-ld/v1/entities/:entityId
     * Merge-patch an entity.
     */
    router.patch('/ngsi-ld/v1/entities/:entityId', async (req: Request, res: Response) => {
        const entityId = decodeURIComponent(req.params['entityId'] as string)

        try {
            const existing = await entityCache.get(entityId)
            if (!existing) {
                res.status(404).json({ type: 'https://uri.etsi.org/ngsi-ld/errors/ResourceNotFound', title: 'Entity not found' })
                return
            }

            const patch = req.body as Partial<NgsiLdEntity>
            const merged: NgsiLdEntity = { ...existing, ...patch, id: existing.id, type: existing.type }
            await entityCache.set(merged)
            res.status(204).end()
        } catch (err) {
            res.status(500).json({ type: 'https://uri.etsi.org/ngsi-ld/errors/InternalError', title: String(err) })
        }
    })

    /**
     * DELETE /ngsi-ld/v1/entities/:entityId
     */
    router.delete('/ngsi-ld/v1/entities/:entityId', async (req: Request, res: Response) => {
        const entityId = decodeURIComponent(req.params['entityId'] as string)

        try {
            const existing = await entityCache.get(entityId)
            if (!existing) {
                res.status(404).json({ type: 'https://uri.etsi.org/ngsi-ld/errors/ResourceNotFound', title: 'Entity not found' })
                return
            }

            await entityCache.delete(entityId)
            res.status(204).end()
        } catch (err) {
            res.status(500).json({ type: 'https://uri.etsi.org/ngsi-ld/errors/InternalError', title: String(err) })
        }
    })
}
