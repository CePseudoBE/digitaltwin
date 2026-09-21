import type { FastifyInstance } from 'fastify'
import type { RouteGuards } from '../auth.js'
import type { EntityCache } from '../cache/entity_cache.js'
import type { NgsiLdEntity } from '../types/entity.js'
import { problem } from './errors.js'
import { attributeFragmentSchema, entityIdParamsSchema } from './schemas.js'

/**
 * Registers the NGSI-LD attrs route: append or update attributes on an existing entity.
 */
export function registerAttrsEndpoints(fastify: FastifyInstance, entityCache: EntityCache, guards: RouteGuards): void {
    fastify.patch<{ Params: { entityId: string }; Body: Partial<NgsiLdEntity> }>(
        '/ngsi-ld/v1/entities/:entityId/attrs',
        { schema: { params: entityIdParamsSchema, body: attributeFragmentSchema }, preHandler: guards.write },
        async (request, reply) => {
            const existing = await entityCache.get(request.params.entityId)
            if (!existing) {
                return reply.code(404).send(problem(404, 'Entity not found'))
            }
            await entityCache.set({ ...existing, ...request.body, id: existing.id, type: existing.type })
            return reply.code(204).send()
        }
    )
}
