import { test } from '@japa/runner'
import Database from 'better-sqlite3'
import { KyselyDatabaseAdapter } from '../src/adapters/kysely_database_adapter.js'
import type { DataResolver } from '@digitaltwin/shared'

function createTestDb(): { db: KyselyDatabaseAdapter; cleanup: () => Promise<void> } {
    const sqliteDb = new Database(':memory:')
    const dataResolver: DataResolver = async () => Buffer.alloc(0)

    const db = KyselyDatabaseAdapter.fromSQLiteDatabase(
        sqliteDb, dataResolver, { enableForeignKeys: false }
    )

    // Create users table (needed for FK in createTable)
    sqliteDb.exec(`
        CREATE TABLE users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            keycloak_id VARCHAR(255) NOT NULL UNIQUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `)

    const cleanup = async () => {
        await db.close()
    }

    return { db, cleanup }
}

test.group('KyselyDatabaseAdapter - Basic Operations', (group) => {
    let db: KyselyDatabaseAdapter
    let cleanup: () => Promise<void>

    group.setup(async () => {
        const result = createTestDb()
        db = result.db
        cleanup = result.cleanup
    })

    group.teardown(async () => {
        await cleanup()
    })

    test('createTable creates table with expected columns', async ({ assert }) => {
        await db.createTable('test_basic')
        const exists = await db.doesTableExists('test_basic')
        assert.isTrue(exists)
    })

    test('save inserts a record and returns it with ID', async ({ assert }) => {
        await db.createTable('test_save')

        const record = await db.save({
            name: 'test_save',
            type: 'application/json',
            url: '/test/file.json',
            date: new Date()
        })

        assert.isDefined(record.id)
        assert.equal(record.name, 'test_save')
        assert.equal(record.contentType, 'application/json')
    })

    test('getById retrieves record by ID', async ({ assert }) => {
        await db.createTable('test_getbyid')

        const saved = await db.save({
            name: 'test_getbyid',
            type: 'text/plain',
            url: '/test.txt',
            date: new Date()
        })

        const fetched = await db.getById(String(saved.id), 'test_getbyid')
        assert.isDefined(fetched)
        assert.equal(fetched!.id, saved.id)
    })

    test('getById returns undefined for non-existent ID', async ({ assert }) => {
        await db.createTable('test_getbyid_none')
        const fetched = await db.getById('99999', 'test_getbyid_none')
        assert.isUndefined(fetched)
    })

    test('delete removes a record', async ({ assert }) => {
        await db.createTable('test_delete')
        const saved = await db.save({
            name: 'test_delete',
            type: 'text/plain',
            url: '/test.txt',
            date: new Date()
        })

        await db.delete(String(saved.id), 'test_delete')
        const fetched = await db.getById(String(saved.id), 'test_delete')
        assert.isUndefined(fetched)
    })

    test('getLatestByName returns most recent record', async ({ assert }) => {
        await db.createTable('test_latest')

        await db.save({ name: 'test_latest', type: 'text/plain', url: '/old.txt', date: new Date('2024-01-01') })
        await db.save({ name: 'test_latest', type: 'text/plain', url: '/new.txt', date: new Date('2024-06-01') })

        const latest = await db.getLatestByName('test_latest')
        assert.isDefined(latest)
        assert.equal(latest!.url, '/new.txt')
    })

    test('doesTableExists returns false for non-existent table', async ({ assert }) => {
        const exists = await db.doesTableExists('non_existent_table')
        assert.isFalse(exists)
    })
})

test.group('KyselyDatabaseAdapter - Extended Queries', (group) => {
    let db: KyselyDatabaseAdapter
    let cleanup: () => Promise<void>

    group.setup(async () => {
        const result = createTestDb()
        db = result.db
        cleanup = result.cleanup

        await db.createTable('test_queries')
        const dates = [
            new Date('2024-01-15'),
            new Date('2024-02-15'),
            new Date('2024-03-15'),
            new Date('2024-04-15'),
            new Date('2024-05-15')
        ]

        for (let i = 0; i < dates.length; i++) {
            await db.save({
                name: 'test_queries',
                type: 'text/plain',
                url: `/file${i + 1}.txt`,
                date: dates[i]
            })
        }
    })

    group.teardown(async () => {
        await cleanup()
    })

    test('getFirstByName returns oldest record', async ({ assert }) => {
        const first = await db.getFirstByName('test_queries')
        assert.isDefined(first)
        assert.equal(first!.url, '/file1.txt')
    })

    test('getByDateRange returns records in range', async ({ assert }) => {
        const records = await db.getByDateRange('test_queries', new Date('2024-02-01'), new Date('2024-04-01'))
        assert.lengthOf(records, 2)
        assert.equal(records[0].url, '/file2.txt')
        assert.equal(records[1].url, '/file3.txt')
    })

    test('getByDateRange with limit restricts results', async ({ assert }) => {
        const records = await db.getByDateRange('test_queries', new Date('2024-01-01'), undefined, 2)
        assert.lengthOf(records, 2)
    })

    test('getByDateRange with desc order returns newest first', async ({ assert }) => {
        const records = await db.getByDateRange('test_queries', new Date('2024-01-01'), new Date('2024-06-01'), undefined, 'desc')
        assert.lengthOf(records, 5)
        assert.equal(records[0].url, '/file5.txt')
        assert.equal(records[4].url, '/file1.txt')
    })

    test('getAfterDate returns records after date', async ({ assert }) => {
        const records = await db.getAfterDate('test_queries', new Date('2024-04-01'))
        assert.lengthOf(records, 2)
        assert.equal(records[0].url, '/file4.txt')
    })

    test('getLatestBefore returns most recent before date', async ({ assert }) => {
        const record = await db.getLatestBefore('test_queries', new Date('2024-03-20'))
        assert.isDefined(record)
        assert.equal(record!.url, '/file3.txt')
    })

    test('getLatestRecordsBefore returns multiple records', async ({ assert }) => {
        const records = await db.getLatestRecordsBefore('test_queries', new Date('2024-05-01'), 2)
        assert.lengthOf(records, 2)
        assert.equal(records[0].url, '/file4.txt')
        assert.equal(records[1].url, '/file3.txt')
    })

    test('hasRecordsAfterDate returns true when records exist', async ({ assert }) => {
        assert.isTrue(await db.hasRecordsAfterDate('test_queries', new Date('2024-04-01')))
    })

    test('hasRecordsAfterDate returns false when no records', async ({ assert }) => {
        assert.isFalse(await db.hasRecordsAfterDate('test_queries', new Date('2025-01-01')))
    })

    test('countByDateRange counts records correctly', async ({ assert }) => {
        const count = await db.countByDateRange('test_queries', new Date('2024-02-01'), new Date('2024-05-01'))
        assert.equal(count, 3)
    })
})

test.group('KyselyDatabaseAdapter - Batch Operations', (group) => {
    let db: KyselyDatabaseAdapter
    let cleanup: () => Promise<void>

    group.setup(async () => {
        const result = createTestDb()
        db = result.db
        cleanup = result.cleanup
    })

    group.teardown(async () => {
        await cleanup()
    })

    test('saveBatch inserts multiple records', async ({ assert }) => {
        await db.createTable('test_batch_save')
        const metadata = [
            { name: 'test_batch_save', type: 'text/plain', url: '/b1.txt', date: new Date() },
            { name: 'test_batch_save', type: 'text/plain', url: '/b2.txt', date: new Date() },
            { name: 'test_batch_save', type: 'text/plain', url: '/b3.txt', date: new Date() }
        ]

        const records = await db.saveBatch(metadata)
        assert.lengthOf(records, 3)

        const count = await db.countByDateRange('test_batch_save', new Date('2020-01-01'))
        assert.equal(count, 3)
    })

    test('saveBatch returns empty array for empty input', async ({ assert }) => {
        assert.lengthOf(await db.saveBatch([]), 0)
    })

    test('deleteBatch removes multiple records', async ({ assert }) => {
        await db.createTable('test_batch_delete')
        const s1 = await db.save({ name: 'test_batch_delete', type: 'text/plain', url: '/d1.txt', date: new Date() })
        const s2 = await db.save({ name: 'test_batch_delete', type: 'text/plain', url: '/d2.txt', date: new Date() })

        await db.deleteBatch([
            { id: String(s1.id), name: 'test_batch_delete' },
            { id: String(s2.id), name: 'test_batch_delete' }
        ])

        assert.equal(await db.countByDateRange('test_batch_delete', new Date('2020-01-01')), 0)
    })

    test('deleteBatch does nothing for empty input', async ({ assert }) => {
        await assert.doesNotThrow(() => db.deleteBatch([]))
    })

    test('getByIdsBatch retrieves multiple records', async ({ assert }) => {
        await db.createTable('test_batch_get')
        const s1 = await db.save({ name: 'test_batch_get', type: 'text/plain', url: '/g1.txt', date: new Date() })
        const s2 = await db.save({ name: 'test_batch_get', type: 'text/plain', url: '/g2.txt', date: new Date() })

        const records = await db.getByIdsBatch([
            { id: String(s1.id), name: 'test_batch_get' },
            { id: String(s2.id), name: 'test_batch_get' }
        ])
        assert.lengthOf(records, 2)
    })
})

test.group('KyselyDatabaseAdapter - Asset Operations', (group) => {
    let db: KyselyDatabaseAdapter
    let cleanup: () => Promise<void>

    group.setup(async () => {
        const result = createTestDb()
        db = result.db
        cleanup = result.cleanup
        await db.createTable('test_assets')

        for (let i = 0; i < 5; i++) {
            await db.save({ name: 'test_assets', type: 'text/plain', url: `/a${i}.txt`, date: new Date() })
        }
    })

    group.teardown(async () => {
        await cleanup()
    })

    test('getAllAssetsPaginated returns records with total count', async ({ assert }) => {
        const { records, total } = await db.getAllAssetsPaginated('test_assets', 0, 3)
        assert.equal(total, 5)
        assert.lengthOf(records, 3)
    })

    test('getAllAssetsPaginated respects offset', async ({ assert }) => {
        const { records } = await db.getAllAssetsPaginated('test_assets', 3, 10)
        assert.lengthOf(records, 2)
    })

    test('updateAssetMetadata updates specified fields', async ({ assert }) => {
        const saved = await db.save({
            name: 'test_assets',
            type: 'text/plain',
            url: '/upd.txt',
            date: new Date(),
            description: 'Original',
            is_public: true
        })

        const updated = await db.updateAssetMetadata('test_assets', saved.id, {
            description: 'Updated',
            is_public: false
        })
        assert.equal(updated.id, saved.id)
    })

    test('updateAssetMetadata throws for non-existent record', async ({ assert }) => {
        await assert.rejects(
            () => db.updateAssetMetadata('test_assets', 99999, { description: 'Test' }),
            /not found/
        )
    })
})

test.group('KyselyDatabaseAdapter - Custom Table Operations', (group) => {
    let db: KyselyDatabaseAdapter
    let cleanup: () => Promise<void>

    group.setup(async () => {
        const result = createTestDb()
        db = result.db
        cleanup = result.cleanup
    })

    group.teardown(async () => {
        await cleanup()
    })

    test('createTableWithColumns creates table with custom columns', async ({ assert }) => {
        await db.createTableWithColumns('custom_test', {
            sensor_id: 'text not null',
            temperature: 'real',
            active: 'boolean default true',
            description: 'varchar(255)'
        })

        assert.isTrue(await db.doesTableExists('custom_test'))
    })

    test('insertCustomTableRecord inserts and returns ID', async ({ assert }) => {
        await db.createTableWithColumns('custom_insert', { name: 'text not null', value: 'integer' })
        const id = await db.insertCustomTableRecord('custom_insert', { name: 'Test', value: 42 })
        assert.isNumber(id)
        assert.isTrue(id > 0)
    })

    test('getCustomTableRecordById retrieves record', async ({ assert }) => {
        await db.createTableWithColumns('custom_getbyid', { name: 'text not null' })
        const id = await db.insertCustomTableRecord('custom_getbyid', { name: 'Test' })

        const record = await db.getCustomTableRecordById('custom_getbyid', id)
        assert.isNotNull(record)
        assert.equal(record.name, 'Test')
    })

    test('getCustomTableRecordById returns null for non-existent', async ({ assert }) => {
        await db.createTableWithColumns('custom_getbyid_null', { name: 'text not null' })
        assert.isNull(await db.getCustomTableRecordById('custom_getbyid_null', 99999))
    })

    test('findCustomTableRecords finds records by conditions', async ({ assert }) => {
        await db.createTableWithColumns('custom_find', { category: 'text', active: 'boolean default true' })
        await db.insertCustomTableRecord('custom_find', { category: 'A', active: true })
        await db.insertCustomTableRecord('custom_find', { category: 'B', active: true })
        await db.insertCustomTableRecord('custom_find', { category: 'A', active: false })

        const records = await db.findCustomTableRecords('custom_find', { category: 'A' })
        assert.lengthOf(records, 2)
    })

    test('findByConditions works with null values', async ({ assert }) => {
        await db.createTableWithColumns('custom_null', { optional_field: 'text' })
        await db.insertCustomTableRecord('custom_null', { optional_field: null })
        await db.insertCustomTableRecord('custom_null', { optional_field: 'value' })

        const records = await db.findByConditions('custom_null', { optional_field: null })
        assert.lengthOf(records, 1)
    })

    test('updateById updates record', async ({ assert }) => {
        await db.createTableWithColumns('custom_update', { name: 'text not null', status: 'text' })
        const id = await db.insertCustomTableRecord('custom_update', { name: 'Original', status: 'pending' })

        await db.updateById('custom_update', id, { name: 'Updated', status: 'completed' })

        const record = await db.getCustomTableRecordById('custom_update', id)
        assert.equal(record.name, 'Updated')
        assert.equal(record.status, 'completed')
    })

    test('updateById throws for non-existent record', async ({ assert }) => {
        await db.createTableWithColumns('custom_update_fail', { name: 'text not null' })
        await assert.rejects(() => db.updateById('custom_update_fail', 99999, { name: 'Test' }), /No record found/)
    })
})

test.group('KyselyDatabaseAdapter - Table Name Validation', (group) => {
    let db: KyselyDatabaseAdapter
    let cleanup: () => Promise<void>

    group.setup(async () => {
        const result = createTestDb()
        db = result.db
        cleanup = result.cleanup
    })

    group.teardown(async () => {
        await cleanup()
    })

    test('rejects table name with SQL injection', async ({ assert }) => {
        await assert.rejects(() => db.createTable('users; DROP TABLE important--'), /Invalid table name/)
    })

    test('rejects table name starting with number', async ({ assert }) => {
        await assert.rejects(() => db.createTable('123table'), /Invalid table name/)
    })

    test('rejects excessively long table name', async ({ assert }) => {
        await assert.rejects(() => db.createTable('a'.repeat(64)), /Table name too long/)
    })

    test('accepts valid table names', async ({ assert }) => {
        // Use doesTableExists (which also validates) to avoid async index creation during teardown
        await db.doesTableExists('valid_table')
        await db.doesTableExists('_private')
        await db.doesTableExists('Table123')
        // If we got here without throwing, validation passed
        assert.isTrue(true)
    })
})

test.group('KyselyDatabaseAdapter - Schema Migration', (group) => {
    let db: KyselyDatabaseAdapter
    let cleanup: () => Promise<void>

    group.setup(async () => {
        const result = createTestDb()
        db = result.db
        cleanup = result.cleanup
    })

    group.teardown(async () => {
        await cleanup()
    })

    test('migrateTableSchema adds missing columns', async ({ assert }) => {
        // Create minimal table manually (simulating old schema)
        const kysely = db.getKysely()
        await kysely.schema
            .createTable('migrate_test')
            .addColumn('id', 'integer', col => col.primaryKey().autoIncrement())
            .addColumn('name', 'varchar(255)', col => col.notNull())
            .addColumn('type', 'varchar(255)', col => col.notNull())
            .addColumn('url', 'varchar(255)', col => col.notNull())
            .addColumn('date', 'datetime', col => col.notNull())
            .execute()

        const migrations = await db.migrateTableSchema('migrate_test')

        assert.isTrue(migrations.length > 0)
        assert.isTrue(migrations.some(m => m.includes('is_public')))
    })

    test('migrateTableSchema returns empty for non-existent table', async ({ assert }) => {
        const migrations = await db.migrateTableSchema('non_existent')
        assert.lengthOf(migrations, 0)
    })

    test('migrateTableSchema is idempotent', async ({ assert }) => {
        await db.createTable('migrate_idempotent')
        await db.migrateTableSchema('migrate_idempotent')
        const migrations2 = await db.migrateTableSchema('migrate_idempotent')
        assert.lengthOf(migrations2, 0)
    })
})
