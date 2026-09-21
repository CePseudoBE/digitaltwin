import type { FastifyInstance } from 'fastify'
import type { SubscriptionStore } from '../subscriptions/subscription_store.js'
import type { SubscriptionCache } from '../subscriptions/subscription_cache.js'
import type { SubscriptionCreate } from '../types/subscription.js'
import type { RouteGuards } from '../auth.js'
import { assertSafeWebhookUrl, WebhookUrlError } from '../notifications/webhook_url.js'
import { LD_JSON } from './entities.js'
import { problem } from './errors.js'
import { subscriptionIdParamsSchema, subscriptionPatchSchema, subscriptionSchema } from './schemas.js'

export interface SubscriptionEndpointOptions {
    /** Accept webhooks on loopback and private networks (development only). */
    allowPrivateWebhooks?: boolean
}

type SubscriptionParams = { subscriptionId: string }

/** Resolves to an error title when the URI must be refused, undefined when it is acceptable. */
async function webhookRejection(uri: string, options: SubscriptionEndpointOptions): Promise<string | undefined> {
    try {
        await assertSafeWebhookUrl(uri, { allowPrivate: options.allowPrivateWebhooks })
        return undefined
    } catch (err) {
        if (err instanceof WebhookUrlError) return err.message
        throw err
    }
}

/**
 * Registers the NGSI-LD subscription CRUD routes on the given Fastify instance.
 */
export function registerSubscriptionEndpoints(
    fastify: FastifyInstance,
    store: SubscriptionStore,
    cache: SubscriptionCache,
    guards: RouteGuards,
    options: SubscriptionEndpointOptions = {}
): void {
    fastify.post<{ Body: SubscriptionCreate }>(
        '/ngsi-ld/v1/subscriptions',
        { schema: { body: subscriptionSchema }, preHandler: guards.write },
        async (request, reply) => {
            const rejection = await webhookRejection(request.body.notification.endpoint.uri, options)
            if (rejection) {
                return reply.code(400).send(problem(400, rejection))
            }
            const sub = await store.create(request.body)
            await cache.add(sub)
            return reply.code(201).header('Location', `/ngsi-ld/v1/subscriptions/${sub.id}`).type(LD_JSON).send(sub)
        }
    )

    fastify.get('/ngsi-ld/v1/subscriptions', { preHandler: guards.read }, async (_request, reply) => {
        return reply.type(LD_JSON).send(await store.findAll())
    })

    fastify.get<{ Params: SubscriptionParams }>(
        '/ngsi-ld/v1/subscriptions/:subscriptionId',
        { schema: { params: subscriptionIdParamsSchema }, preHandler: guards.read },
        async (request, reply) => {
            const sub = await store.findById(request.params.subscriptionId)
            if (!sub) {
                return reply.code(404).send(problem(404, 'Subscription not found'))
            }
            return reply.type(LD_JSON).send(sub)
        }
    )

    fastify.patch<{ Params: SubscriptionParams; Body: Partial<SubscriptionCreate> }>(
        '/ngsi-ld/v1/subscriptions/:subscriptionId',
        { schema: { params: subscriptionIdParamsSchema, body: subscriptionPatchSchema }, preHandler: guards.write },
        async (request, reply) => {
            const uri = request.body.notification?.endpoint?.uri
            if (uri !== undefined) {
                const rejection = await webhookRejection(uri, options)
                if (rejection) {
                    return reply.code(400).send(problem(400, rejection))
                }
            }
            const updated = await store.update(request.params.subscriptionId, request.body)
            if (!updated) {
                return reply.code(404).send(problem(404, 'Subscription not found'))
            }
            await cache.update(updated)
            return reply.code(204).send()
        }
    )

    fastify.delete<{ Params: SubscriptionParams }>(
        '/ngsi-ld/v1/subscriptions/:subscriptionId',
        { schema: { params: subscriptionIdParamsSchema }, preHandler: guards.write },
        async (request, reply) => {
            const deleted = await store.delete(request.params.subscriptionId)
            if (!deleted) {
                return reply.code(404).send(problem(404, 'Subscription not found'))
            }
            await cache.remove(request.params.subscriptionId)
            return reply.code(204).send()
        }
    )
}
