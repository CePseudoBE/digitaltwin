import type { Router, Request, Response } from 'ultimate-express'
import type { EntityCache } from '../cache/entity_cache.js'
import { NGSI_LD_CORE_CONTEXT } from '../types/context.js'

/**
 * Registers the NGSI-LD types endpoint on the provided router.
 */
export function registerTypesEndpoints(router: Router, entityCache: EntityCache): void {
    /**
     * GET /ngsi-ld/v1/types
     * Returns a summary of all known entity types.
     */
    router.get('/ngsi-ld/v1/types', async (_req: Request, res: Response) => {
        try {
            const types = await entityCache.listTypes()

            const typeDetails = await Promise.all(
                types.map(async type => {
                    const entities = await entityCache.listByType(type)
                    const attributeNames = new Set<string>()
                    for (const entity of entities) {
                        for (const key of Object.keys(entity)) {
                            if (key !== 'id' && key !== 'type' && key !== '@context') {
                                attributeNames.add(key)
                            }
                        }
                    }
                    return {
                        id: `urn:ngsi-ld:EntityTypeInfo:${type}`,
                        type: 'EntityTypeInfo',
                        typeName: type,
                        entityCount: entities.length,
                        attributeNames: Array.from(attributeNames),
                    }
                })
            )

            res.setHeader('Content-Type', 'application/ld+json')
            res.status(200).json({
                id: 'urn:ngsi-ld:EntityTypeList:default',
                type: 'EntityTypeList',
                typeList: types,
                typeDetails,
                '@context': NGSI_LD_CORE_CONTEXT,
            })
        } catch (err) {
            res.status(500).json({ type: 'https://uri.etsi.org/ngsi-ld/errors/InternalError', title: String(err) })
        }
    })
}
