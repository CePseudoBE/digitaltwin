import type { Router, Request, Response } from 'ultimate-express'
import type { EntityCache } from '../cache/entity_cache.js'
import type { NgsiLdEntity } from '../types/entity.js'

/**
 * Registers the NGSI-LD attrs endpoint on the provided router.
 */
export function registerAttrsEndpoints(router: Router, entityCache: EntityCache): void {
    /**
     * PATCH /ngsi-ld/v1/entities/:entityId/attrs
     * Append or update attributes on an existing entity (partial update).
     */
    router.patch('/ngsi-ld/v1/entities/:entityId/attrs', async (req: Request, res: Response) => {
        const entityId = decodeURIComponent(req.params['entityId'] as string)

        try {
            const existing = await entityCache.get(entityId)
            if (!existing) {
                res.status(404).json({
                    type: 'https://uri.etsi.org/ngsi-ld/errors/ResourceNotFound',
                    title: 'Entity not found',
                })
                return
            }

            const attrsFragment = req.body as Partial<NgsiLdEntity>
            // Merge attributes into the existing entity (NGSI-LD PATCH semantics)
            const merged: NgsiLdEntity = {
                ...existing,
                ...attrsFragment,
                // Preserve immutable fields
                id: existing.id,
                type: existing.type,
            }

            await entityCache.set(merged)
            res.status(204).end()
        } catch (err) {
            res.status(500).json({ type: 'https://uri.etsi.org/ngsi-ld/errors/InternalError', title: String(err) })
        }
    })
}
