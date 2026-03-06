import { test } from '@japa/runner'
import { initializeComponents } from '../src/initializer.js'
import { TestCollector, TestHarvester } from './fixtures/mock_components.js'
import { MockDatabaseAdapter } from './fixtures/mock_database.js'
import { MockStorageService } from './fixtures/mock_storage.js'

test.group('initializeComponents', () => {
    test('injects dependencies into each component', async ({ assert }) => {
        const database = new MockDatabaseAdapter()
        const storage = new MockStorageService()
        const collector = new TestCollector('c1')
        const harvester = new TestHarvester('h1')

        let collectorInjected = false
        let harvesterInjected = false

        collector.setDependencies = (db, st) => {
            collectorInjected = true
            assert.strictEqual(db, database)
            assert.strictEqual(st, storage)
        }
        harvester.setDependencies = (db, st) => {
            harvesterInjected = true
        }

        database.doesTableExists = async () => true

        await initializeComponents([collector, harvester], database, storage)

        assert.isTrue(collectorInjected)
        assert.isTrue(harvesterInjected)
    })

    test('auto-creates tables that do not exist', async ({ assert }) => {
        const database = new MockDatabaseAdapter()
        const storage = new MockStorageService()
        const collector = new TestCollector('new-table')

        const createdTables: string[] = []
        const origCreate = database.createTable.bind(database)
        database.createTable = async (name: string) => {
            createdTables.push(name)
            return origCreate(name)
        }
        database.doesTableExists = async () => false

        await initializeComponents([collector], database, storage)

        assert.include(createdTables, 'new-table')
    })

    test('skips table creation for existing tables', async ({ assert }) => {
        const database = new MockDatabaseAdapter()
        const storage = new MockStorageService()

        await database.createTable('existing')
        const collector = new TestCollector('existing')

        let createCalled = false
        database.createTable = async () => { createCalled = true }

        await initializeComponents([collector], database, storage)

        assert.isFalse(createCalled)
    })

    test('propagates database errors', async ({ assert }) => {
        const database = new MockDatabaseAdapter()
        const storage = new MockStorageService()
        const collector = new TestCollector('fail')

        database.doesTableExists = async () => { throw new Error('DB down') }

        await assert.rejects(
            () => initializeComponents([collector], database, storage),
            /DB down/
        )
    })

    test('handles empty component array', async ({ assert }) => {
        const database = new MockDatabaseAdapter()
        const storage = new MockStorageService()

        let tableChecked = false
        database.doesTableExists = async () => { tableChecked = true; return true }

        await initializeComponents([], database, storage)

        assert.isFalse(tableChecked)
    })
})
