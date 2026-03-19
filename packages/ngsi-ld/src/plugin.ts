import { Queue } from 'bullmq'
import type { ConnectionOptions } from 'bullmq'
import { Redis } from 'ioredis'
import type { Router } from 'ultimate-express'
import type { DatabaseAdapter } from '@digitaltwin/database'
import { Logger, engineEventBus } from '@digitaltwin/shared'
import type { NotificationJobData } from './types/notification.js'
import { EntityCache } from './cache/entity_cache.js'
import { SubscriptionStore } from './subscriptions/subscription_store.js'
import { SubscriptionCache } from './subscriptions/subscription_cache.js'
import { SubscriptionMatcher } from './subscriptions/subscription_matcher.js'
import { isNgsiLdCollector, isNgsiLdHarvester } from './components/type_guards.js'
import { enqueueNotification } from './notifications/notification_sender.js'
import { startNotificationWorker } from './notifications/notification_worker.js'
import { registerEntityEndpoints } from './endpoints/entities.js'
import { registerAttrsEndpoints } from './endpoints/attrs.js'
import { registerSubscriptionEndpoints } from './endpoints/subscriptions.js'
import { registerTypesEndpoints } from './endpoints/types.js'

/**
 * Configuration options for the NGSI-LD plugin.
 */
export interface NgsiLdPluginOptions {
    /** Express Router from the engine */
    router: Router
    /** Database adapter for subscription persistence */
    db: DatabaseAdapter
    /** Redis connection config for entity cache and subscription cache */
    redis: { host: string; port: number; password?: string }
    /** All components registered in the engine */
    components: unknown[]
    /** Logger instance */
    logger: Logger
}

/**
 * Registers the NGSI-LD plugin with the Digital Twin engine.
 *
 * This function:
 * 1. Connects to Redis
 * 2. Runs the subscription table migration
 * 3. Warms up the subscription cache
 * 4. Registers NGSI-LD HTTP endpoints
 * 5. Starts the notification worker
 * 6. Listens to engineEventBus for component completion events
 */
export async function registerNgsiLd(options: NgsiLdPluginOptions): Promise<void> {
    const { router, db, redis: redisConfig, components, logger } = options

    // Connect to Redis
    const redisConnection = new Redis({
        host: redisConfig.host,
        port: redisConfig.port,
        password: redisConfig.password,
        maxRetriesPerRequest: null,
        enableReadyCheck: true,
    })

    // Create Redis connection for BullMQ (separate connection, same config)
    const bullmqConnection: ConnectionOptions = {
        host: redisConfig.host,
        port: redisConfig.port,
        password: redisConfig.password,
    }

    // Initialize subsystems
    const entityCache = new EntityCache(redisConnection)
    const subscriptionStore = new SubscriptionStore(db)
    const subscriptionCache = new SubscriptionCache(redisConnection)
    const matcher = new SubscriptionMatcher(subscriptionCache)

    // Run migration to create subscriptions table
    await subscriptionStore.runMigration()

    // Warm up subscription cache from database
    const allSubs = await subscriptionStore.findAll()
    await subscriptionCache.warmup(allSubs)

    logger.info(`NGSI-LD plugin initialized: ${allSubs.length} subscriptions loaded`)

    // BullMQ notification queue
    const notificationQueue = new Queue<NotificationJobData>('ngsi-ld-notifications', {
        connection: bullmqConnection,
    })

    // Register HTTP endpoints
    registerEntityEndpoints(router, entityCache, subscriptionStore, subscriptionCache)
    registerAttrsEndpoints(router, entityCache)
    registerSubscriptionEndpoints(router, subscriptionStore, subscriptionCache)
    registerTypesEndpoints(router, entityCache)

    // Start notification delivery worker
    startNotificationWorker(bullmqConnection, subscriptionStore, subscriptionCache, logger)

    // Listen to engine events for NGSI-LD-aware components
    engineEventBus.on('component:event', async event => {
        if (
            event.type !== 'collector:completed' &&
            event.type !== 'harvester:completed'
        ) {
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
            // Get the latest record from database
            const record = await db.getLatestByName(event.componentName)
            if (!record) return

            // Parse the data
            const blob = await record.data()
            let data: unknown
            try {
                data = JSON.parse(blob.toString())
            } catch {
                data = blob.toString()
            }

            // Convert to NGSI-LD entity
            const entity = component.toNgsiLdEntity(data, record)
            const oldEntity = await entityCache.get(entity.id)

            // Update cache
            await entityCache.set(entity)

            // Evaluate subscriptions
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
    })
}
