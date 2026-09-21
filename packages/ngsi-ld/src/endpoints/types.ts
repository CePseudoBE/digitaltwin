import type { FastifyInstance } from 'fastify'
import type { RouteGuards } from '../auth.js'
import type { EntityCache } from '../cache/entity_cache.js'
import { NGSI_LD_CORE_CONTEXT } from '../types/context.js'
import { LD_JSON } from './entities.js'

/**
 * Registers the NGSI-LD types route: a summary of every known entity type.
 */
export function registerTypesEndpoints(fastify: FastifyInstance, entityCache: EntityCache, guards: RouteGuards): void {
    fastify.get('/ngsi-ld/v1/types', { preHandler: guards.read }, async (_request, reply) => {
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
                    attributeNames: Array.from(attributeNames)
                }
            })
        )

        return reply.type(LD_JSON).send({
            id: 'urn:ngsi-ld:EntityTypeList:default',
            type: 'EntityTypeList',
            typeList: types,
            typeDetails,
            '@context': NGSI_LD_CORE_CONTEXT
        })
    })
}
