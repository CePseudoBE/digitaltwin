import { test } from '@japa/runner'
import { KyselyDatabaseAdapter } from '@digitaltwin/database'
import { SubscriptionStore } from '../src/subscriptions/subscription_store.js'
import type { SubscriptionCreate } from '../src/types/subscription.js'

const dataResolver = async (_url: string): Promise<Buffer> => Buffer.alloc(0)

type StoreFactory = () => Promise<{ db: KyselyDatabaseAdapter; store: SubscriptionStore; cleanup: () => Promise<void> }>

const sqliteFactory: StoreFactory = async () => {
    const db = await KyselyDatabaseAdapter.forSQLite({ filename: ':memory:', enableForeignKeys: false }, dataResolver)
    const store = new SubscriptionStore(db)
    return { db, store, cleanup: () => db.close() }
}

const postgresFactory: StoreFactory = async () => {
    const db = await KyselyDatabaseAdapter.forPostgreSQL({
        host: process.env.TEST_PG_HOST!,
        port: Number(process.env.TEST_PG_PORT),
        user: process.env.TEST_PG_USER!,
        password: process.env.TEST_PG_PASSWORD!,
        database: process.env.TEST_PG_DATABASE!,
    }, dataResolver)
    const store = new SubscriptionStore(db)
    // PG shares the same database across tests — clean slate each time
    if (await db.doesTableExists('ngsi_ld_subscriptions')) {
        await db.getKysely().deleteFrom('ngsi_ld_subscriptions').execute()
    }
    return { db, store, cleanup: () => db.close() }
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

function registerSubscriptionStoreTests(label: string, factory: StoreFactory) {
    test.group(`SubscriptionStore [${label}] — migration`, group => {
        let db: KyselyDatabaseAdapter
        let store: SubscriptionStore
        let cleanup: () => Promise<void>

        group.each.setup(async () => ({ db, store, cleanup } = await factory()))
        group.each.teardown(async () => cleanup())

        test('runMigration() creates the table if absent', async ({ assert }) => {
            await store.runMigration()
            assert.isTrue(await db.doesTableExists('ngsi_ld_subscriptions'))
        })

        test('runMigration() is idempotent', async ({ assert }) => {
            await store.runMigration()
            await assert.doesNotReject(() => store.runMigration())
            assert.isTrue(await db.doesTableExists('ngsi_ld_subscriptions'))
        })

        test('runMigration() adds missing columns to an existing table', async ({ assert }) => {
            await db.createTableWithColumns('ngsi_ld_subscriptions', {
                sub_id: 'text not null',
                notification_endpoint: 'text not null',
                entity_types: 'text not null',
                is_active: 'integer',
                // times_failed intentionally absent — simulates old schema
            })
            await store.runMigration()
            const sub = await store.create(makeInput())
            await store.recordNotification(sub.id, false, new Date().toISOString())
            const updated = await store.findById(sub.id)
            assert.equal(updated!.timesFailed, 1)
        })
    })

    test.group(`SubscriptionStore [${label}] — create`, group => {
        let store: SubscriptionStore
        let cleanup: () => Promise<void>

        group.each.setup(async () => {
            ({ store, cleanup } = await factory())
            await store.runMigration()
        })
        group.each.teardown(async () => cleanup())

        test('create() returns a subscription with a UUID id', async ({ assert }) => {
            const sub = await store.create(makeInput())
            assert.isString(sub.id)
            assert.match(sub.id, /^[0-9a-f-]{36}$/)
        })

        test('entityTypes are correctly serialized and deserialized', async ({ assert }) => {
            const sub = await store.create(makeInput({ entities: [{ type: 'WeatherObserved' }, { type: 'AirQualityObserved' }] }))
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

    test.group(`SubscriptionStore [${label}] — findAll`, group => {
        let store: SubscriptionStore
        let cleanup: () => Promise<void>

        group.each.setup(async () => {
            ({ store, cleanup } = await factory())
            await store.runMigration()
        })
        group.each.teardown(async () => cleanup())

        test('returns all active subscriptions', async ({ assert }) => {
            await store.create(makeInput())
            await store.create(makeInput())
            assert.lengthOf(await store.findAll(), 2)
        })

        test('does not return soft-deleted subscriptions', async ({ assert }) => {
            const sub = await store.create(makeInput())
            await store.delete(sub.id)
            assert.lengthOf(await store.findAll(), 0)
        })
    })

    test.group(`SubscriptionStore [${label}] — findById`, group => {
        let store: SubscriptionStore
        let cleanup: () => Promise<void>

        group.each.setup(async () => {
            ({ store, cleanup } = await factory())
            await store.runMigration()
        })
        group.each.teardown(async () => cleanup())

        test('returns the subscription by UUID', async ({ assert }) => {
            const created = await store.create(makeInput())
            const found = await store.findById(created.id)
            assert.isNotNull(found)
            assert.equal(found!.id, created.id)
        })

        test('returns null for unknown id', async ({ assert }) => {
            assert.isNull(await store.findById('00000000-0000-0000-0000-000000000000'))
        })
    })

    test.group(`SubscriptionStore [${label}] — update`, group => {
        let store: SubscriptionStore
        let cleanup: () => Promise<void>

        group.each.setup(async () => {
            ({ store, cleanup } = await factory())
            await store.runMigration()
        })
        group.each.teardown(async () => cleanup())

        test('updates the name field', async ({ assert }) => {
            const sub = await store.create(makeInput({ name: 'original' }))
            const updated = await store.update(sub.id, { name: 'updated' })
            assert.equal(updated!.name, 'updated')
        })

        test('updates entityTypes with re-serialization', async ({ assert }) => {
            const sub = await store.create(makeInput({ entities: [{ type: 'AirQualityObserved' }] }))
            const updated = await store.update(sub.id, { entities: [{ type: 'WeatherObserved' }] })
            assert.deepEqual(updated!.entityTypes, ['WeatherObserved'])
        })

        test('returns null for unknown id', async ({ assert }) => {
            assert.isNull(await store.update('00000000-0000-0000-0000-000000000000', { name: 'x' }))
        })
    })

    test.group(`SubscriptionStore [${label}] — delete`, group => {
        let store: SubscriptionStore
        let cleanup: () => Promise<void>

        group.each.setup(async () => {
            ({ store, cleanup } = await factory())
            await store.runMigration()
        })
        group.each.teardown(async () => cleanup())

        test('soft-delete: findAll no longer returns the subscription', async ({ assert }) => {
            const sub = await store.create(makeInput())
            assert.isTrue(await store.delete(sub.id))
            const ids = (await store.findAll()).map(s => s.id)
            assert.notInclude(ids, sub.id)
        })

        test('soft-delete: findById returns null after delete', async ({ assert }) => {
            const sub = await store.create(makeInput())
            await store.delete(sub.id)
            assert.isNull(await store.findById(sub.id))
        })

        test('delete returns false for unknown id', async ({ assert }) => {
            assert.isFalse(await store.delete('00000000-0000-0000-0000-000000000000'))
        })
    })

    test.group(`SubscriptionStore [${label}] — recordNotification`, group => {
        let store: SubscriptionStore
        let cleanup: () => Promise<void>

        group.each.setup(async () => {
            ({ store, cleanup } = await factory())
            await store.runMigration()
        })
        group.each.teardown(async () => cleanup())

        test('success: increments timesSent and sets lastSuccessAt', async ({ assert }) => {
            const sub = await store.create(makeInput())
            const at = new Date().toISOString()
            await store.recordNotification(sub.id, true, at)
            const updated = await store.findById(sub.id)
            assert.equal(updated!.timesSent, 1)
            assert.equal(updated!.lastSuccessAt, at)
        })

        test('failure: increments timesFailed, does not set lastSuccessAt', async ({ assert }) => {
            const sub = await store.create(makeInput())
            await store.recordNotification(sub.id, false, new Date().toISOString())
            const updated = await store.findById(sub.id)
            assert.equal(updated!.timesSent, 1)
            assert.equal(updated!.timesFailed, 1)
            assert.isUndefined(updated!.lastSuccessAt)
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
}

registerSubscriptionStoreTests('SQLite', sqliteFactory)

if (process.env.TEST_PG_HOST) {
    registerSubscriptionStoreTests('PostgreSQL', postgresFactory)
}
