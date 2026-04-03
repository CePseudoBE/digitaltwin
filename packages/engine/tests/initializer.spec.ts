import { test } from '@japa/runner'
import { initializeComponents } from '../src/initializer.js'
import { TestCollector, TestHarvester } from './fixtures/mock_components.js'
import { MockDatabaseAdapter } from './fixtures/mock_database.js'
import { MockStorageService } from './fixtures/mock_storage.js'

test.group('initializeComponents', () => {
    test('collector can save and retrieve data after initialization', async ({ assert }) => {
        const db = new MockDatabaseAdapter()
        const storage = new MockStorageService()
        const collector = new TestCollector('sensor-data')

        await initializeComponents([collector], db, storage)

        await collector.run()

        const saved = await db.getLatestByName('sensor-data')
        assert.isNotNull(saved)
        assert.equal(saved!.name, 'sensor-data')
    })

    test('component table is created when it did not previously exist', async ({ assert }) => {
        const db = new MockDatabaseAdapter()
        const storage = new MockStorageService()
        const collector = new TestCollector('fresh-table')

        assert.isFalse(await db.doesTableExists('fresh-table'))

        await initializeComponents([collector], db, storage)

        assert.isTrue(await db.doesTableExists('fresh-table'))
    })

    test('initializing a component whose table already exists does not discard existing records', async ({ assert }) => {
        const db = new MockDatabaseAdapter()
        const storage = new MockStorageService()

        await db.createTable('existing-data')
        await db.save({ name: 'existing-data', url: 'storage/path', type: 'application/json', date: new Date() })

        const collector = new TestCollector('existing-data')

        await initializeComponents([collector], db, storage)

        const records = await db.getAllByName('existing-data')
        assert.lengthOf(records, 1)
    })

    test('all components in the array get their tables and can run', async ({ assert }) => {
        const db = new MockDatabaseAdapter()
        const storage = new MockStorageService()
        const c1 = new TestCollector('alpha')
        const c2 = new TestCollector('beta')
        const h1 = new TestHarvester('gamma')

        await initializeComponents([c1, c2, h1], db, storage)

        assert.isTrue(await db.doesTableExists('alpha'))
        assert.isTrue(await db.doesTableExists('beta'))
        assert.isTrue(await db.doesTableExists('gamma'))

        await c1.run()
        await c2.run()

        assert.isNotNull(await db.getLatestByName('alpha'))
        assert.isNotNull(await db.getLatestByName('beta'))
    })

    test('initialization fails when the database is unreachable', async ({ assert }) => {
        const db = new MockDatabaseAdapter({ shouldThrow: { doesTableExists: true } })
        const storage = new MockStorageService()
        const collector = new TestCollector('fail')

        await assert.rejects(
            () => initializeComponents([collector], db, storage),
            /Mock doesTableExists error/
        )
    })

    test('does nothing when the component array is empty', async ({ assert }) => {
        const db = new MockDatabaseAdapter()
        const storage = new MockStorageService()

        await assert.doesNotReject(() => initializeComponents([], db, storage))
    })
})
