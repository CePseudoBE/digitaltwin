import { Worker, UnrecoverableError } from 'bullmq'
import type { ConnectionOptions } from 'bullmq'
import type { NotificationJobData, NotificationPayload } from '../types/notification.js'
import type { SubscriptionStore } from '../subscriptions/subscription_store.js'
import type { SubscriptionCache } from '../subscriptions/subscription_cache.js'
import type { Logger } from '@cepseudo/shared'
import { assertSafeWebhookUrl, WebhookUrlError } from './webhook_url.js'

const QUEUE_NAME = 'ngsi-ld-notifications'
const DEFAULT_REQUEST_TIMEOUT_MS = 10_000

export interface NotificationWorkerOptions {
    /** Deliver to loopback and private networks (development only). */
    allowPrivateWebhooks?: boolean
    /** Abort the webhook request after this delay (default 10 s). */
    requestTimeoutMs?: number
}

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
    logger: Logger,
    options: NotificationWorkerOptions = {}
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
                try {
                    await assertSafeWebhookUrl(sub.notificationEndpoint, { allowPrivate: options.allowPrivateWebhooks })
                } catch (err) {
                    // A forbidden destination never becomes valid by retrying
                    if (err instanceof WebhookUrlError) throw new UnrecoverableError(err.message)
                    throw err
                }

                const response = await fetch(sub.notificationEndpoint, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/ld+json',
                        'Accept': 'application/json',
                    },
                    body: JSON.stringify(payload),
                    redirect: 'manual', // a redirect could point back inside the network
                    signal: AbortSignal.timeout(options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS),
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
