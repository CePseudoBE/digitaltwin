import { Worker } from 'bullmq'
import type { ConnectionOptions } from 'bullmq'
import type { NotificationJobData, NotificationPayload } from '../types/notification.js'
import type { SubscriptionStore } from '../subscriptions/subscription_store.js'
import type { SubscriptionCache } from '../subscriptions/subscription_cache.js'
import type { Logger } from '@digitaltwin/shared'

const QUEUE_NAME = 'ngsi-ld-notifications'

/**
 * Starts the BullMQ worker that delivers NGSI-LD notifications.
 *
 * For each job:
 * 1. Builds the NotificationPayload
 * 2. HTTP POSTs to the subscriber's endpoint
 * 3. Updates times_sent / times_failed / last_success_at in PostgreSQL
 * 4. Updates last_notification_at in Redis
 *
 * Retry: exponential backoff — 1s → 5s → 25s (max 3 attempts via queue config)
 */
export function startNotificationWorker(
    redis: ConnectionOptions,
    store: SubscriptionStore,
    cache: SubscriptionCache,
    logger: Logger
): Worker<NotificationJobData> {
    const worker = new Worker<NotificationJobData>(
        QUEUE_NAME,
        async job => {
            const { subscription: sub, entity, notificationId, notifiedAt } = job.data

            const payload: NotificationPayload = {
                id: `urn:ngsi-ld:Notification:${notificationId}`,
                type: 'Notification',
                subscriptionId: sub.id,
                notifiedAt,
                data: [entity],
            }

            let success = false
            try {
                const response = await fetch(sub.notificationEndpoint, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/ld+json',
                        'Accept': 'application/json',
                    },
                    body: JSON.stringify(payload),
                })

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status} from ${sub.notificationEndpoint}`)
                }

                success = true
                logger.info(`Notification delivered to ${sub.notificationEndpoint} for subscription ${sub.id}`)
            } catch (err) {
                logger.warn(`Notification delivery failed for subscription ${sub.id}: ${err instanceof Error ? err.message : String(err)}`)
                throw err // Re-throw so BullMQ handles retry
            } finally {
                // Update stats regardless of success/failure (best-effort)
                try {
                    await store.recordNotification(sub.id, success, notifiedAt)
                    await cache.updateLastNotified(sub.id, notifiedAt)
                } catch (statsErr) {
                    logger.warn(`Failed to update notification stats for ${sub.id}: ${statsErr instanceof Error ? statsErr.message : String(statsErr)}`)
                }
            }
        },
        {
            connection: redis,
            concurrency: 5,
        }
    )

    worker.on('failed', (job, err) => {
        if (job) {
            logger.warn(`Notification job ${job.id} failed permanently: ${err.message}`)
        }
    })

    return worker
}
