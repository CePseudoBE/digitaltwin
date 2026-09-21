import type { FastifyInstance } from 'fastify'
import type { RouteGuards } from '../auth.js'
import type { EntityCache } from '../cache/entity_cache.js'
import type { NgsiLdEntity } from '../types/entity.js'
import { NGSI_LD_CORE_CONTEXT } from '../types/context.js'
import { parseQ, evaluateQ } from '../subscriptions/q_parser.js'
import { problem } from './errors.js'
import { attributeFragmentSchema, entityAttrsQuerySchema, entityIdParamsSchema, entityListQuerySchema, entitySchema } from './schemas.js'

export const LD_JSON = 'application/ld+json'

interface EntityListQuery {
    type?: string
    q?: string
    attrs?: string
    limit?: number
    offset?: number
}

function withContext(entity: NgsiLdEntity): NgsiLdEntity {
    return { ...entity, '@context': entity['@context'] ?? NGSI_LD_CORE_CONTEXT }
}

function project(entity: NgsiLdEntity, attrs: string | undefined): NgsiLdEntity {
    if (!attrs) return withContext(entity)
    const projected: NgsiLdEntity = { id: entity.id, type: entity.type }
    for (const attr of attrs.split(',').map(a => a.trim())) {
        if (entity[attr] !== undefined) projected[attr] = entity[attr]
    }
    return withContext(projected)
}

/**
 * Registers the NGSI-LD entity routes on the given Fastify instance.
 */
export function registerEntityEndpoints(fastify: FastifyInstance, entityCache: EntityCache, guards: RouteGuards): void {
    fastify.get<{ Querystring: EntityListQuery }>(
        '/ngsi-ld/v1/entities',
        { schema: { querystring: entityListQuerySchema }, preHandler: guards.read },
        async (request, reply) => {
            const { type, q, attrs, limit = 20, offset = 0 } = request.query
            let entities = await entityCache.list({ type })

            // The filter runs before pagination so a page never hides matching entities (#80)
            if (q) {
                let expr
                try {
                    expr = parseQ(q)
                } catch {
                    return reply.code(400).send(problem(400, 'Invalid q filter'))
                }
                entities = entities.filter(e => evaluateQ(expr, e))
            }

            const page = entities.slice(offset, offset + limit).map(e => project(e, attrs))
            return reply.type(LD_JSON).send(page)
        }
    )

    fastify.post<{ Body: NgsiLdEntity }>(
        '/ngsi-ld/v1/entities',
        { schema: { body: entitySchema }, preHandler: guards.write },
        async (request, reply) => {
            await entityCache.set(request.body)
            return reply.code(201).header('Location', `/ngsi-ld/v1/entities/${encodeURIComponent(request.body.id)}`).send()
        }
    )

    fastify.get<{ Params: { entityId: string }; Querystring: { attrs?: string } }>(
        '/ngsi-ld/v1/entities/:entityId',
        { schema: { params: entityIdParamsSchema, querystring: entityAttrsQuerySchema }, preHandler: guards.read },
        async (request, reply) => {
            const entity = await entityCache.get(request.params.entityId)
            if (!entity) {
                return reply.code(404).send(problem(404, 'Entity not found'))
            }
            return reply.type(LD_JSON).send(project(entity, request.query.attrs))
        }
    )

    fastify.patch<{ Params: { entityId: string }; Body: Partial<NgsiLdEntity> }>(
        '/ngsi-ld/v1/entities/:entityId',
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

    fastify.delete<{ Params: { entityId: string } }>(
        '/ngsi-ld/v1/entities/:entityId',
        { schema: { params: entityIdParamsSchema }, preHandler: guards.write },
        async (request, reply) => {
            const existing = await entityCache.get(request.params.entityId)
            if (!existing) {
                return reply.code(404).send(problem(404, 'Entity not found'))
            }
            await entityCache.delete(request.params.entityId)
            return reply.code(204).send()
        }
    )
}
