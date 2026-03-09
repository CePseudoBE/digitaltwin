import { test } from '@japa/runner'
import { KyselyDatabaseAdapter } from '@digitaltwin/database'
import { SubscriptionStore } from '../src/subscriptions/subscription_store.js'
import type { SubscriptionCreate } from '../src/types/subscription.js'

const dataResolver = async (_url: string): Promise<Buffer> => Buffer.alloc(0)

async function createDb(): Promise<KyselyDatabaseAdapter> {
    return KyselyDatabaseAdapter.forSQLite(
        { filename: ':memory:', enableForeignKeys: false },
        dataResolver
    )
}

function makeInput(overrides: Partial<SubscriptionCreate> = {}): SubscriptionCreate {
    return {
        notification: {
            endpoint: { uri: 'https://example.com/notify' },
            format: 'normalized',
        },
        entities: [{ type: 'AirQualityObserved' }],
        ...overrides,
    }
}

test.group('SubscriptionStore — migration', group => {
    let db: KyselyDatabaseAdapter
    let store: SubscriptionStore

    group.each.setup(async () => {
        db = await createDb()
        store = new SubscriptionStore(db)
    })

    group.each.teardown(async () => {
        await db.close()
    })

    test('runMigration() creates the table if absent', async ({ assert }) => {
        await store.runMigration()
        const exists = await db.doesTableExists('ngsi_ld_subscriptions')
        assert.isTrue(exists)
    })

    test('runMigration() is idempotent', async ({ assert }) => {
        await store.runMigration()
        await assert.doesNotReject(() => store.runMigration())
        const exists = await db.doesTableExists('ngsi_ld_subscriptions')
        assert.isTrue(exists)
    })

    test('runMigration() adds missing columns to an existing table', async ({ assert }) => {
        // Simulate a legacy table that pre-dates the times_failed column
        await db.createTableWithColumns('ngsi_ld_subscriptions', {
            sub_id: 'text not null',
            notification_endpoint: 'text not null',
            entity_types: 'text not null',
            is_active: 'integer',
            // times_failed intentionally absent — simulates old schema
        })

        // runMigration() should detect and add the missing columns
        await store.runMigration()

        // Verify the table still works end-to-end (times_failed is now present)
        const sub = await store.create(makeInput())
        await store.recordNotification(sub.id, false, new Date().toISOString())

        const updated = await store.findById(sub.id)
        assert.equal(updated!.timesFailed, 1)
    })
})

test.group('SubscriptionStore — create', group => {
    let db: KyselyDatabaseAdapter
    let store: SubscriptionStore

    group.each.setup(async () => {
        db = await createDb()
        store = new SubscriptionStore(db)
        await store.runMigration()
    })

    group.each.teardown(async () => {
        await db.close()
    })

    test('create() returns a subscription with a UUID id', async ({ assert }) => {
        const sub = await store.create(makeInput())
        assert.isString(sub.id)
        // UUID format
        assert.match(sub.id, /^[0-9a-f-]{36}$/)
    })

    test('entityTypes are correctly serialized and deserialized', async ({ assert }) => {
        const sub = await store.create(makeInput({
            entities: [{ type: 'WeatherObserved' }, { type: 'AirQualityObserved' }],
        }))
        assert.deepEqual(sub.entityTypes, ['WeatherObserved', 'AirQualityObserved'])
    })

    test('watchedAttributes null is preserved as undefined', async ({ assert }) => {
        const sub = await store.create(makeInput({ watchedAttributes: undefined }))
        assert.isUndefined(sub.watchedAttributes)
    })

    test('watchedAttributes array round-trips correctly', async ({ assert }) => {
        const sub = await store.create(makeInput({ watchedAttributes: ['pm25', 'no2'] }))
        assert.deepEqual(sub.watchedAttributes, ['pm25', 'no2'])
    })

    test('create() without entities defaults to empty entityTypes', async ({ assert }) => {
        const sub = await store.create(makeInput({ entities: undefined }))
        assert.deepEqual(sub.entityTypes, [])
    })

    test('create() sets isActive to true by default', async ({ assert }) => {
        const sub = await store.create(makeInput())
        assert.isTrue(sub.isActive)
    })

    test('create() initializes counters to zero', async ({ assert }) => {
        const sub = await store.create(makeInput())
        assert.equal(sub.timesSent, 0)
        assert.equal(sub.timesFailed, 0)
    })
})

test.group('SubscriptionStore — findAll', group => {
    let db: KyselyDatabaseAdapter
    let store: SubscriptionStore

    group.each.setup(async () => {
        db = await createDb()
        store = new SubscriptionStore(db)
        await store.runMigration()
    })

    group.each.teardown(async () => {
        await db.close()
    })

    test('returns all active subscriptions', async ({ assert }) => {
        await store.create(makeInput())
        await store.create(makeInput())
        const all = await store.findAll()
        assert.lengthOf(all, 2)
    })

    test('does not return soft-deleted subscriptions', async ({ assert }) => {
        const sub = await store.create(makeInput())
        await store.delete(sub.id)

        const all = await store.findAll()
        assert.lengthOf(all, 0)
    })
})

test.group('SubscriptionStore — findById', group => {
    let db: KyselyDatabaseAdapter
    let store: SubscriptionStore

    group.each.setup(async () => {
        db = await createDb()
        store = new SubscriptionStore(db)
        await store.runMigration()
    })

    group.each.teardown(async () => {
        await db.close()
    })

    test('returns the subscription by UUID', async ({ assert }) => {
        const created = await store.create(makeInput())
        const found = await store.findById(created.id)
        assert.isNotNull(found)
        assert.equal(found!.id, created.id)
    })

    test('returns null for unknown id', async ({ assert }) => {
        const found = await store.findById('00000000-0000-0000-0000-000000000000')
        assert.isNull(found)
    })
})

test.group('SubscriptionStore — update', group => {
    let db: KyselyDatabaseAdapter
    let store: SubscriptionStore

    group.each.setup(async () => {
        db = await createDb()
        store = new SubscriptionStore(db)
        await store.runMigration()
    })

    group.each.teardown(async () => {
        await db.close()
    })

    test('updates the name field', async ({ assert }) => {
        const sub = await store.create(makeInput({ name: 'original' }))
        const updated = await store.update(sub.id, { name: 'updated' })
        assert.equal(updated!.name, 'updated')
    })

    test('updates entityTypes with re-serialization', async ({ assert }) => {
        const sub = await store.create(makeInput({ entities: [{ type: 'AirQualityObserved' }] }))
        const updated = await store.update(sub.id, {
            entities: [{ type: 'WeatherObserved' }],
        })
        assert.deepEqual(updated!.entityTypes, ['WeatherObserved'])
    })

    test('returns null for unknown id', async ({ assert }) => {
        const result = await store.update('00000000-0000-0000-0000-000000000000', { name: 'x' })
        assert.isNull(result)
    })
})

test.group('SubscriptionStore — delete', group => {
    let db: KyselyDatabaseAdapter
    let store: SubscriptionStore

    group.each.setup(async () => {
        db = await createDb()
        store = new SubscriptionStore(db)
        await store.runMigration()
    })

    group.each.teardown(async () => {
        await db.close()
    })

    test('soft-delete: findAll no longer returns the subscription', async ({ assert }) => {
        const sub = await store.create(makeInput())
        const deleted = await store.delete(sub.id)
        assert.isTrue(deleted)

        const all = await store.findAll()
        const ids = all.map(s => s.id)
        assert.notInclude(ids, sub.id)
    })

    test('soft-delete: findById returns null after delete', async ({ assert }) => {
        const sub = await store.create(makeInput())
        await store.delete(sub.id)

        const found = await store.findById(sub.id)
        assert.isNull(found)
    })

    test('delete returns false for unknown id', async ({ assert }) => {
        const result = await store.delete('00000000-0000-0000-0000-000000000000')
        assert.isFalse(result)
    })
})

test.group('SubscriptionStore — recordNotification', group => {
    let db: KyselyDatabaseAdapter
    let store: SubscriptionStore

    group.each.setup(async () => {
        db = await createDb()
        store = new SubscriptionStore(db)
        await store.runMigration()
    })

    group.each.teardown(async () => {
        await db.close()
    })

    test('success: increments timesSent and sets lastSuccessAt', async ({ assert }) => {
        const sub = await store.create(makeInput())
        const at = new Date().toISOString()

        await store.recordNotification(sub.id, true, at)

        const updated = await store.findById(sub.id)
        assert.equal(updated!.timesSent, 1)
        assert.equal(updated!.lastSuccessAt, at)
        assert.equal(updated!.lastNotificationAt, at)
    })

    test('failure: increments timesSent and timesFailed, does not set lastSuccessAt', async ({ assert }) => {
        const sub = await store.create(makeInput())
        const at = new Date().toISOString()

        await store.recordNotification(sub.id, false, at)

        const updated = await store.findById(sub.id)
        assert.equal(updated!.timesSent, 1)
        assert.equal(updated!.timesFailed, 1)
        assert.isUndefined(updated!.lastSuccessAt)
        assert.equal(updated!.lastNotificationAt, at)
    })

    test('multiple calls accumulate counters', async ({ assert }) => {
        const sub = await store.create(makeInput())
        const at = new Date().toISOString()

        await store.recordNotification(sub.id, true, at)
        await store.recordNotification(sub.id, false, at)
        await store.recordNotification(sub.id, true, at)

        const updated = await store.findById(sub.id)
        assert.equal(updated!.timesSent, 3)
        assert.equal(updated!.timesFailed, 1)
    })

    test('is a no-op for unknown id', async ({ assert }) => {
        await assert.doesNotReject(() =>
            store.recordNotification('00000000-0000-0000-0000-000000000000', true, new Date().toISOString())
        )
    })
})
