import type { DatabaseAdapter } from '@digitaltwin/database'
import type { Subscription, SubscriptionCreate } from '../types/subscription.js'
import { randomUUID } from 'crypto'

const TABLE = 'ngsi_ld_subscriptions'

/**
 * Column schema for the subscriptions table.
 * Uses TEXT for everything (arrays stored as JSON) for SQLite/PostgreSQL compatibility.
 * The integer `id` PK is added automatically by `createTableWithColumns`.
 * The UUID is stored in `sub_id`.
 */
const SUBSCRIPTION_COLUMNS: Record<string, string> = {
    sub_id: 'text not null',
    name: 'text',
    description: 'text',
    entity_types: 'text not null',
    watched_attributes: 'text',
    q: 'text',
    notification_endpoint: 'text not null',
    notification_format: 'text',
    notification_attrs: 'text',
    throttling: 'integer',
    expires_at: 'text',
    is_active: 'integer',
    last_notification_at: 'text',
    last_success_at: 'text',
    times_sent: 'integer',
    times_failed: 'integer',
}

/**
 * PostgreSQL/SQLite persistence layer for NGSI-LD subscriptions.
 *
 * Arrays are serialized as JSON strings for SQLite compatibility.
 * The UUID subscription id is stored in the `sub_id` column; the database
 * integer primary key is used internally for updates.
 */
export class SubscriptionStore {
    readonly #db: DatabaseAdapter

    constructor(db: DatabaseAdapter) {
        this.#db = db
    }

    /**
     * Creates the ngsi_ld_subscriptions table if it does not already exist.
     */
    async runMigration(): Promise<void> {
        const exists = await this.#db.doesTableExists(TABLE)
        if (!exists) {
            await this.#db.createTableWithColumns(TABLE, SUBSCRIPTION_COLUMNS)
        }
    }

    /**
     * Inserts a new subscription and returns it with generated id and timestamps.
     */
    async create(input: SubscriptionCreate): Promise<Subscription> {
        const subId = randomUUID()
        const entityTypes = input.entities?.map(e => e.type) ?? []

        const data: Record<string, unknown> = {
            sub_id: subId,
            name: input.name ?? null,
            description: input.description ?? null,
            entity_types: JSON.stringify(entityTypes),
            watched_attributes: input.watchedAttributes ? JSON.stringify(input.watchedAttributes) : null,
            q: input.q ?? null,
            notification_endpoint: input.notification.endpoint.uri,
            notification_format: input.notification.format ?? 'normalized',
            notification_attrs: input.notification.attributes ? JSON.stringify(input.notification.attributes) : null,
            throttling: input.throttling ?? 0,
            expires_at: input.expiresAt ?? null,
            is_active: 1,
            last_notification_at: null,
            last_success_at: null,
            times_sent: 0,
            times_failed: 0,
        }

        await this.#db.insertCustomTableRecord(TABLE, data)

        const created = await this.findById(subId)
        if (!created) {
            throw new Error(`Failed to retrieve subscription after insert: ${subId}`)
        }
        return created
    }

    /**
     * Returns all active subscriptions.
     */
    async findAll(): Promise<Subscription[]> {
        const rows = await this.#db.findCustomTableRecords(TABLE, { is_active: 1 })
        return rows.map(row => this.#rowToSubscription(row))
    }

    /**
     * Returns a subscription by its UUID, or null if not found.
     */
    async findById(subId: string): Promise<Subscription | null> {
        const rows = await this.#db.findCustomTableRecords(TABLE, { sub_id: subId })
        if (rows.length === 0) return null
        return this.#rowToSubscription(rows[0])
    }

    /**
     * Partially updates a subscription.
     */
    async update(subId: string, patch: Partial<SubscriptionCreate>): Promise<Subscription | null> {
        const rows = await this.#db.findCustomTableRecords(TABLE, { sub_id: subId })
        if (rows.length === 0) return null

        const internalId = rows[0].id as number
        const updates: Record<string, unknown> = {}

        if (patch.name !== undefined) updates['name'] = patch.name
        if (patch.description !== undefined) updates['description'] = patch.description
        if (patch.entities !== undefined) updates['entity_types'] = JSON.stringify(patch.entities.map(e => e.type))
        if (patch.watchedAttributes !== undefined) updates['watched_attributes'] = JSON.stringify(patch.watchedAttributes)
        if (patch.q !== undefined) updates['q'] = patch.q
        if (patch.notification?.endpoint?.uri !== undefined) updates['notification_endpoint'] = patch.notification.endpoint.uri
        if (patch.notification?.format !== undefined) updates['notification_format'] = patch.notification.format
        if (patch.notification?.attributes !== undefined) updates['notification_attrs'] = JSON.stringify(patch.notification.attributes)
        if (patch.throttling !== undefined) updates['throttling'] = patch.throttling
        if (patch.expiresAt !== undefined) updates['expires_at'] = patch.expiresAt

        await this.#db.updateById(TABLE, internalId, updates)
        return this.findById(subId)
    }

    /**
     * Soft-deletes a subscription by setting is_active = 0.
     */
    async delete(subId: string): Promise<boolean> {
        const rows = await this.#db.findCustomTableRecords(TABLE, { sub_id: subId })
        if (rows.length === 0) return false

        const internalId = rows[0].id as number
        await this.#db.updateById(TABLE, internalId, { is_active: 0 })
        return true
    }

    /**
     * Updates notification statistics after a delivery attempt.
     */
    async recordNotification(subId: string, success: boolean, at: string): Promise<void> {
        const rows = await this.#db.findCustomTableRecords(TABLE, { sub_id: subId })
        if (rows.length === 0) return

        const row = rows[0]
        const internalId = row.id as number

        const updates: Record<string, unknown> = {
            last_notification_at: at,
            times_sent: (Number(row['times_sent']) || 0) + 1,
        }

        if (success) {
            updates['last_success_at'] = at
        } else {
            updates['times_failed'] = (Number(row['times_failed']) || 0) + 1
        }

        await this.#db.updateById(TABLE, internalId, updates)
    }

    #rowToSubscription(row: Record<string, unknown>): Subscription {
        return {
            id: String(row['sub_id']),
            name: row['name'] ? String(row['name']) : undefined,
            description: row['description'] ? String(row['description']) : undefined,
            entityTypes: row['entity_types'] ? (JSON.parse(String(row['entity_types'])) as string[]) : [],
            watchedAttributes: row['watched_attributes']
                ? (JSON.parse(String(row['watched_attributes'])) as string[])
                : undefined,
            q: row['q'] ? String(row['q']) : undefined,
            notificationEndpoint: String(row['notification_endpoint']),
            notificationFormat: (row['notification_format'] as 'normalized' | 'keyValues') ?? 'normalized',
            notificationAttrs: row['notification_attrs']
                ? (JSON.parse(String(row['notification_attrs'])) as string[])
                : undefined,
            throttling: Number(row['throttling'] ?? 0),
            expiresAt: row['expires_at'] ? String(row['expires_at']) : undefined,
            isActive: Number(row['is_active']) === 1,
            lastNotificationAt: row['last_notification_at'] ? String(row['last_notification_at']) : undefined,
            lastSuccessAt: row['last_success_at'] ? String(row['last_success_at']) : undefined,
            timesSent: Number(row['times_sent'] ?? 0),
            timesFailed: Number(row['times_failed'] ?? 0),
            createdAt: String(row['created_at']),
            updatedAt: String(row['updated_at']),
        }
    }
}
