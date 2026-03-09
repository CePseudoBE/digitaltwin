import type { NgsiLdEntity } from './entity.js'
import type { Subscription } from './subscription.js'

/**
 * Payload delivered to a subscriber's endpoint.
 */
export interface NotificationPayload {
    id: string
    type: 'Notification'
    subscriptionId: string
    notifiedAt: string
    data: NgsiLdEntity[]
}

/**
 * Data stored in the BullMQ job for notification delivery.
 */
export interface NotificationJobData {
    subscription: Subscription
    entity: NgsiLdEntity
    notificationId: string
    notifiedAt: string
}
