import type { Router, Request, Response } from 'ultimate-express'
import type { SubscriptionStore } from '../subscriptions/subscription_store.js'
import type { SubscriptionCache } from '../subscriptions/subscription_cache.js'
import type { SubscriptionCreate } from '../types/subscription.js'

/**
 * Registers NGSI-LD subscription CRUD endpoints on the provided router.
 */
export function registerSubscriptionEndpoints(
    router: Router,
    store: SubscriptionStore,
    cache: SubscriptionCache
): void {
    /**
     * POST /ngsi-ld/v1/subscriptions
     * Create a new subscription.
     */
    router.post('/ngsi-ld/v1/subscriptions', async (req: Request, res: Response) => {
        const body = req.body as SubscriptionCreate

        if (!body?.notification?.endpoint?.uri) {
            res.status(400).json({
                type: 'https://uri.etsi.org/ngsi-ld/errors/BadRequestData',
                title: 'Missing notification.endpoint.uri',
            })
            return
        }

        try {
            const sub = await store.create(body)
            await cache.add(sub)
            res.setHeader('Location', `/ngsi-ld/v1/subscriptions/${sub.id}`)
            res.setHeader('Content-Type', 'application/ld+json')
            res.status(201).json(sub)
        } catch (err) {
            res.status(500).json({ type: 'https://uri.etsi.org/ngsi-ld/errors/InternalError', title: String(err) })
        }
    })

    /**
     * GET /ngsi-ld/v1/subscriptions
     * List all active subscriptions.
     */
    router.get('/ngsi-ld/v1/subscriptions', async (_req: Request, res: Response) => {
        try {
            const subs = await store.findAll()
            res.setHeader('Content-Type', 'application/ld+json')
            res.status(200).json(subs)
        } catch (err) {
            res.status(500).json({ type: 'https://uri.etsi.org/ngsi-ld/errors/InternalError', title: String(err) })
        }
    })

    /**
     * GET /ngsi-ld/v1/subscriptions/:subscriptionId
     */
    router.get('/ngsi-ld/v1/subscriptions/:subscriptionId', async (req: Request, res: Response) => {
        const id = req.params['subscriptionId'] as string

        try {
            const sub = await store.findById(id)
            if (!sub) {
                res.status(404).json({
                    type: 'https://uri.etsi.org/ngsi-ld/errors/ResourceNotFound',
                    title: 'Subscription not found',
                })
                return
            }
            res.setHeader('Content-Type', 'application/ld+json')
            res.status(200).json(sub)
        } catch (err) {
            res.status(500).json({ type: 'https://uri.etsi.org/ngsi-ld/errors/InternalError', title: String(err) })
        }
    })

    /**
     * PATCH /ngsi-ld/v1/subscriptions/:subscriptionId
     * Partially update a subscription.
     */
    router.patch('/ngsi-ld/v1/subscriptions/:subscriptionId', async (req: Request, res: Response) => {
        const id = req.params['subscriptionId'] as string
        const patch = req.body as Partial<SubscriptionCreate>

        try {
            const updated = await store.update(id, patch)
            if (!updated) {
                res.status(404).json({
                    type: 'https://uri.etsi.org/ngsi-ld/errors/ResourceNotFound',
                    title: 'Subscription not found',
                })
                return
            }
            await cache.update(updated)
            res.status(204).end()
        } catch (err) {
            res.status(500).json({ type: 'https://uri.etsi.org/ngsi-ld/errors/InternalError', title: String(err) })
        }
    })

    /**
     * DELETE /ngsi-ld/v1/subscriptions/:subscriptionId
     */
    router.delete('/ngsi-ld/v1/subscriptions/:subscriptionId', async (req: Request, res: Response) => {
        const id = req.params['subscriptionId'] as string

        try {
            const deleted = await store.delete(id)
            if (!deleted) {
                res.status(404).json({
                    type: 'https://uri.etsi.org/ngsi-ld/errors/ResourceNotFound',
                    title: 'Subscription not found',
                })
                return
            }
            await cache.remove(id)
            res.status(204).end()
        } catch (err) {
            res.status(500).json({ type: 'https://uri.etsi.org/ngsi-ld/errors/InternalError', title: String(err) })
        }
    })
}
