import { test } from '@japa/runner'
import { randomUUID } from 'node:crypto'
import { enqueueNotification } from '../src/notifications/notification_sender.js'
import type { Subscription } from '../src/types/subscription.js'
import type { NgsiLdEntity } from '../src/types/entity.js'
import type { NotificationJobData } from '../src/types/notification.js'
import { property } from '../src/helpers/property.js'
import { buildUrn } from '../src/helpers/urn.js'

function makeSub(overrides: Partial<Subscription> = {}): Subscription {
    return {
        id: randomUUID(),
        entityTypes: ['AirQualityObserved'],
        notificationEndpoint: 'https://example.com/notify',
        notificationFormat: 'normalized',
        throttling: 0,
        isActive: true,
        timesSent: 0,
        timesFailed: 0,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
        ...overrides,
    }
}

function makeEntity(attrs: Record<string, number | string> = {}): NgsiLdEntity {
    const entity: NgsiLdEntity = {
        id: buildUrn('AirQualityObserved', 'sensor-1'),
        type: 'AirQualityObserved',
    }
    for (const [key, value] of Object.entries(attrs)) {
        entity[key] = property(value)
    }
    return entity
}

function makeMockQueue() {
    const jobs: NotificationJobData[] = []
    return {
        jobs,
        async add(_name: string, data: NotificationJobData) {
            jobs.push(data)
        },
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.group('enqueueNotification — attribute projection', () => {
    test('a subscription without attribute filter delivers all entity attributes', async ({ assert }) => {
        const queue = makeMockQueue()
        const entity = makeEntity({ pm25: 42, temperature: 20, no2: 15 })

        await enqueueNotification(makeSub(), entity, queue as any)

        const delivered = queue.jobs[0].entity
        assert.property(delivered, 'pm25')
        assert.property(delivered, 'temperature')
        assert.property(delivered, 'no2')
    })

    test('a subscription with notificationAttrs delivers only those attributes', async ({ assert }) => {
        const queue = makeMockQueue()
        const entity = makeEntity({ pm25: 42, temperature: 20 })

        await enqueueNotification(makeSub({ notificationAttrs: ['pm25'] }), entity, queue as any)

        const delivered = queue.jobs[0].entity
        assert.property(delivered, 'pm25')
        assert.notProperty(delivered, 'temperature')
    })

    test('id and type are always delivered regardless of attribute filter', async ({ assert }) => {
        const queue = makeMockQueue()
        const entity = makeEntity({ pm25: 42 })

        await enqueueNotification(makeSub({ notificationAttrs: ['pm25'] }), entity, queue as any)

        const delivered = queue.jobs[0].entity
        assert.equal(delivered.id, entity.id)
        assert.equal(delivered.type, entity.type)
    })

    test('requesting an attribute absent from the entity does not include it and does not error', async ({ assert }) => {
        const queue = makeMockQueue()
        const entity = makeEntity({ pm25: 42 })

        await assert.doesNotReject(() =>
            enqueueNotification(makeSub({ notificationAttrs: ['pm25', 'no2'] }), entity, queue as any)
        )

        const delivered = queue.jobs[0].entity
        assert.property(delivered, 'pm25')
        assert.notProperty(delivered, 'no2')
    })
})

test.group('enqueueNotification — delivery conditions', () => {
    test('subscriptions with no endpoint are not queued for delivery', async ({ assert }) => {
        const queue = makeMockQueue()

        await enqueueNotification(makeSub({ notificationEndpoint: '' }), makeEntity({ pm25: 42 }), queue as any)

        assert.lengthOf(queue.jobs, 0)
    })
})
