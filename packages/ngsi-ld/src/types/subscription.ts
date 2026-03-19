/**
 * Notification format for NGSI-LD subscriptions.
 */
export type NotificationFormat = 'normalized' | 'keyValues'

/**
 * Notification endpoint configuration.
 */
export interface NotificationEndpoint {
    uri: string
    accept?: string
}

/**
 * Input payload for creating a new subscription.
 */
export interface SubscriptionCreate {
    name?: string
    description?: string
    entities?: Array<{ type: string }>
    watchedAttributes?: string[]
    q?: string
    notification: {
        endpoint: NotificationEndpoint
        attributes?: string[]
        format?: NotificationFormat
    }
    throttling?: number
    expiresAt?: string
}

/**
 * A fully hydrated subscription record (as stored in the DB).
 */
export interface Subscription {
    id: string
    name?: string
    description?: string
    entityTypes: string[]
    watchedAttributes?: string[]
    q?: string
    notificationEndpoint: string
    notificationFormat: NotificationFormat
    notificationAttrs?: string[]
    throttling: number
    expiresAt?: string
    isActive: boolean
    lastNotificationAt?: string
    lastSuccessAt?: string
    timesSent: number
    timesFailed: number
    createdAt: string
    updatedAt: string
}
