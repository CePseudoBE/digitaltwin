import { Queue } from 'bullmq'
import type { ConnectionOptions } from 'bullmq'
import { Redis } from 'ioredis'
import type { FastifyInstance } from 'fastify'
import type { DatabaseAdapter } from '@cepseudo/database'
import { Logger, engineEventBus, parseBoolean } from '@cepseudo/shared'
import type { ComponentEvent } from '@cepseudo/shared'
import { createRouteGuards } from './auth.js'
import type { NgsiLdAuthenticator } from './auth.js'
import type { NotificationJobData } from './types/notification.js'
import { EntityCache } from './cache/entity_cache.js'
import { SubscriptionStore } from './subscriptions/subscription_store.js'
import { SubscriptionCache } from './subscriptions/subscription_cache.js'
import { SubscriptionMatcher } from './subscriptions/subscription_matcher.js'
import { isNgsiLdCollector, isNgsiLdHarvester } from './components/type_guards.js'
import { enqueueNotification } from './notifications/notification_sender.js'
import { startNotificationWorker } from './notifications/notification_worker.js'
import { ngsiLdErrorHandler } from './endpoints/errors.js'
import { registerEntityEndpoints } from './endpoints/entities.js'
import { registerAttrsEndpoints } from './endpoints/attrs.js'
import { registerSubscriptionEndpoints } from './endpoints/subscriptions.js'
import { registerTypesEndpoints } from './endpoints/types.js'

/**
 * Configuration options for the NGSI-LD plugin.
 */
export interface NgsiLdPluginOptions {
    /** The engine's Fastify server, before it listens */
    fastify: FastifyInstance
    /** Database adapter for subscription persistence */
    db: DatabaseAdapter
    /** Redis connection config for entity cache and subscription cache */
    redis: { host: string; port: number; password?: string }
    /** All components registered in the engine */
    components: unknown[]
    /** Logger instance */
    logger: Logger
    /** Engine auth middleware. Without it every write endpoint answers 401. */
    authMiddleware?: NgsiLdAuthenticator
    /** Serve GET endpoints without authentication (default true). */
    publicRead?: boolean
    /** Accept webhooks on loopback and private networks. Development only; also NGSI_LD_ALLOW_PRIVATE_WEBHOOKS=true. */
    allowPrivateWebhooks?: boolean
}

/** What the engine keeps to shut the plugin down. */
export interface NgsiLdHandle {
    /** Stops the notification worker and closes the queue and Redis connection. */
    close(): Promise<void>
}

/**
 * Registers the NGSI-LD plugin with the Digital Twin engine.
 *
 * This function:
 * 1. Connects to Redis
 * 2. Runs the subscription table migration
 * 3. Warms up the subscription cache
 * 4. Registers the NGSI-LD routes as an encapsulated Fastify plugin
 * 5. Starts the notification worker
 * 6. Listens to engineEventBus for component completion events
 */
export async function registerNgsiLd(options: NgsiLdPluginOptions): Promise<NgsiLdHandle> {
    const { fastify, db, redis: redisConfig, components, logger, authMiddleware } = options
    const publicRead = options.publicRead ?? true
    const allowPrivateWebhooks =
        options.allowPrivateWebhooks ?? parseBoolean(process.env.NGSI_LD_ALLOW_PRIVATE_WEBHOOKS, 'NGSI_LD_ALLOW_PRIVATE_WEBHOOKS') ?? false
    const guards = createRouteGuards(authMiddleware, publicRead)

    if (!authMiddleware) logger.warn('NGSI-LD plugin started without an auth middleware: write endpoints will answer 401')
    if (allowPrivateWebhooks) logger.warn('NGSI-LD notifications may target private networks (allowPrivateWebhooks); not for production')

    const redisConnection = new Redis({
        host: redisConfig.host,
        port: redisConfig.port,
        password: redisConfig.password,
        maxRetriesPerRequest: null,
        enableReadyCheck: true
    })

    // BullMQ opens its own connections from the plain config
    const bullmqConnection: ConnectionOptions = {
        host: redisConfig.host,
        port: redisConfig.port,
        password: redisConfig.password
    }

    const entityCache = new EntityCache(redisConnection)
    const subscriptionStore = new SubscriptionStore(db)
    const subscriptionCache = new SubscriptionCache(redisConnection)
    const matcher = new SubscriptionMatcher(subscriptionCache)

    await subscriptionStore.runMigration()
    const allSubs = await subscriptionStore.findAll()
    await subscriptionCache.warmup(allSubs)
    logger.info(`NGSI-LD plugin initialized: ${allSubs.length} subscriptions loaded`)

    const notificationQueue = new Queue<NotificationJobData>('ngsi-ld-notifications', { connection: bullmqConnection })

    // Encapsulated so the NGSI-LD error format applies to these routes only
    await fastify.register(async instance => {
        instance.setErrorHandler(ngsiLdErrorHandler)
        registerEntityEndpoints(instance, entityCache, guards)
        registerAttrsEndpoints(instance, entityCache, guards)
        registerSubscriptionEndpoints(instance, subscriptionStore, subscriptionCache, guards, { allowPrivateWebhooks })
        registerTypesEndpoints(instance, entityCache, guards)
    })

    const worker = startNotificationWorker(bullmqConnection, subscriptionStore, subscriptionCache, logger, { allowPrivateWebhooks })

    const onComponentEvent = async (event: ComponentEvent): Promise<void> => {
        if (event.type !== 'collector:completed' && event.type !== 'harvester:completed') {
            return
        }

        const component = components.find(c => {
            if (!c || typeof c !== 'object') return false
            const conf = (c as { getConfiguration?: () => { name: string } }).getConfiguration?.()
            return conf?.name === event.componentName
        })

        if (!component) return
        if (!isNgsiLdCollector(component) && !isNgsiLdHarvester(component)) return

        try {
            const record = await db.getLatestByName(event.componentName)
            if (!record) return

            const blob = await record.data()
            let data: unknown
            try {
                data = JSON.parse(blob.toString())
            } catch {
                data = blob.toString()
            }

            const entity = component.toNgsiLdEntity(data, record)
            const oldEntity = await entityCache.get(entity.id)
            await entityCache.set(entity)

            const matchingSubIds = await matcher.match(entity, oldEntity ?? undefined)
            for (const subId of matchingSubIds) {
                const sub = await subscriptionCache.getById(subId)
                if (sub) {
                    await enqueueNotification(sub, entity, notificationQueue)
                }
            }
        } catch (err) {
            logger.warn(`NGSI-LD event processing failed for ${event.componentName}: ${err instanceof Error ? err.message : String(err)}`)
        }
    }
    engineEventBus.on('component:event', onComponentEvent)

    return {
        async close() {
            engineEventBus.off('component:event', onComponentEvent)
            await worker.close()
            await notificationQueue.close()
            await redisConnection.quit()
        }
    }
}
