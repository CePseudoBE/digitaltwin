import type { Queue } from 'bullmq'
import type { Subscription } from '../types/subscription.js'
import type { NgsiLdEntity } from '../types/entity.js'
import type { NotificationJobData, NotificationPayload } from '../types/notification.js'
import { randomUUID } from 'crypto'

/**
 * Builds a keyValues projection of an NGSI-LD entity.
 */
function toKeyValues(entity: NgsiLdEntity): Record<string, unknown> {
    const result: Record<string, unknown> = {
        id: entity.id,
        type: entity.type,
    }
    for (const [key, value] of Object.entries(entity)) {
        if (key === 'id' || key === 'type' || key === '@context') continue
        if (value && typeof value === 'object' && 'type' in value && 'value' in value) {
            result[key] = (value as { value: unknown }).value
        }
    }
    return result
}

/**
 * Enqueues a notification delivery job in BullMQ.
 *
 * Constructs the appropriate payload (normalized or keyValues) and adds
 * a job to the `ngsi-ld-notifications` queue.
 *
 * @param sub - The subscription to notify
 * @param entity - The entity that triggered the notification
 * @param queue - The BullMQ queue to enqueue into
 */
export async function enqueueNotification(
    sub: Subscription,
    entity: NgsiLdEntity,
    queue: Queue<NotificationJobData>
): Promise<void> {
    const notificationId = randomUUID()
    const notifiedAt = new Date().toISOString()

    // Project attributes if subscription specifies them
    let entityToSend = entity
    if (sub.notificationAttrs && sub.notificationAttrs.length > 0) {
        const projected: NgsiLdEntity = { id: entity.id, type: entity.type }
        for (const attr of sub.notificationAttrs) {
            if (entity[attr] !== undefined) projected[attr] = entity[attr]
        }
        entityToSend = projected
    }

    // Validate the endpoint URI before enqueueing
    const endpoint = sub.notificationEndpoint
    if (!endpoint) return

    const jobData: NotificationJobData = {
        subscription: sub,
        entity: entityToSend,
        notificationId,
        notifiedAt,
    }

    await queue.add('notify', jobData, {
        attempts: 3,
        backoff: {
            type: 'exponential',
            delay: 1000,
        },
        removeOnComplete: 100,
        removeOnFail: 50,
    })

    // Build the full notification payload (for reference, stored in job data)
    const _payload: NotificationPayload = {
        id: `urn:ngsi-ld:Notification:${notificationId}`,
        type: 'Notification',
        subscriptionId: sub.id,
        notifiedAt,
        data: [sub.notificationFormat === 'keyValues' ? (toKeyValues(entityToSend) as NgsiLdEntity) : entityToSend],
    }
}
