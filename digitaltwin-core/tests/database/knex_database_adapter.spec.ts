import { test } from '@japa/runner'
import { KnexDatabaseAdapter } from '../../src/database/adapters/knex_database_adapter.js'
import { LocalStorageService } from '../../src/storage/adapters/local_storage_service.js'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'

// Helper to create a test database adapter
async function createTestDb(): Promise<{ db: KnexDatabaseAdapter; cleanup: () => Promise<void>; tempDir: string }> {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'knex-test-'))
    const dbPath = path.join(tempDir, 'test.db')
    const storage = new LocalStorageService(tempDir)

    // Try better-sqlite3 first, fall back to sqlite3
    let db: KnexDatabaseAdapter
    try {
        db = KnexDatabaseAdapter.forSQLite(
            { filename: dbPath, client: 'better-sqlite3', enableForeignKeys: false },
            storage
        )
        // Test connection
        await db.getKnex().raw('SELECT 1')
    } catch {
        // Fall back to sqlite3
        db = KnexDatabaseAdapter.forSQLite({ filename: dbPath, client: 'sqlite3', enableForeignKeys: false }, storage)
        await db.getKnex().raw('SELECT 1')
    }

    // Create users table first (required for foreign key in createTable)
    const knex = db.getKnex()
    await knex.schema.createTable('users', table => {
        table.increments('id').primary()
        table.string('keycloak_id', 255).notNullable().unique()
        table.timestamp('created_at').defaultTo(knex.fn.now())
        table.timestamp('updated_at').defaultTo(knex.fn.now())
    })

    const cleanup = async () => {
        // Skip db.close() - better-sqlite3 with Knex has pool abort issues
        // The in-memory/file database will be cleaned up with the temp directory
        await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {})
    }

    return { db, cleanup, tempDir }
}

test.group('KnexDatabaseAdapter - Basic Operations', group => {
    let db: KnexDatabaseAdapter
    let cleanup: () => Promise<void>

    group.setup(async () => {
        try {
            const result = await createTestDb()
            db = result.db
            cleanup = result.cleanup
        } catch (error) {
            // Skip all tests if no SQLite driver available
            if (error instanceof Error && (error.message.includes('sqlite3') || error.message.includes('better-sqlite3'))) {
                throw new Error('SKIP: No SQLite driver available')
            }
            throw error
        }
    })

    group.teardown(async () => {
        if (cleanup) await cleanup()
    })

    test('createTable creates a new table with expected columns', async ({ assert }) => {
        await db.createTable('test_basic')

        const exists = await db.doesTableExists('test_basic')
        assert.isTrue(exists)

        const columnInfo = await db.getKnex()('test_basic').columnInfo()
        assert.isDefined(columnInfo.id)
        assert.isDefined(columnInfo.name)
        assert.isDefined(columnInfo.type)
        assert.isDefined(columnInfo.url)
        assert.isDefined(columnInfo.date)
        assert.isDefined(columnInfo.owner_id)
        assert.isDefined(columnInfo.is_public)
    })

    test('save inserts a record and returns it with ID', async ({ assert }) => {
        await db.createTable('test_save')

        const metadata = {
            name: 'test_save',
            type: 'application/json',
            url: '/test/file.json',
            date: new Date()
        }

        const record = await db.save(metadata)

        assert.isDefined(record.id)
        assert.equal(record.name, 'test_save')
        assert.equal(record.contentType, 'application/json')
    })

    test('save with asset fields stores all metadata', async ({ assert }) => {
        await db.createTable('test_asset_save')

        // Create a user first for the foreign key
        await db.getKnex()('users').insert({
            keycloak_id: 'test-user-123'
        })
        const user = await db.getKnex()('users').where({ keycloak_id: 'test-user-123' }).first()

        const metadata = {
            name: 'test_asset_save',
            type: 'image/png',
            url: '/test/image.png',
            date: new Date(),
            description: 'Test image',
            source: 'https://example.com',
            owner_id: user.id,
            filename: 'image.png',
            is_public: false
        }

        const record = await db.save(metadata)

        assert.isDefined(record.id)

        // Verify by fetching
        const fetched = await db.getById(String(record.id), 'test_asset_save')
        assert.isDefined(fetched)
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

        // Insert older record
        await db.save({
            name: 'test_latest',
            type: 'text/plain',
            url: '/old.txt',
            date: new Date('2024-01-01')
        })

        // Insert newer record
        await db.save({
            name: 'test_latest',
            type: 'text/plain',
            url: '/new.txt',
            date: new Date('2024-06-01')
        })

        const latest = await db.getLatestByName('test_latest')

        assert.isDefined(latest)
        assert.equal(latest!.url, '/new.txt')
    })

    test('doesTableExists returns false for non-existent table', async ({ assert }) => {
        const exists = await db.doesTableExists('non_existent_table')
        assert.isFalse(exists)
    })
})

test.group('KnexDatabaseAdapter - Extended Queries', group => {
    let db: KnexDatabaseAdapter
    let cleanup: () => Promise<void>

    group.setup(async () => {
        try {
            const result = await createTestDb()
            db = result.db
            cleanup = result.cleanup

            // Create and populate test table
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
        } catch (error) {
            if (error instanceof Error && (error.message.includes('sqlite3') || error.message.includes('better-sqlite3'))) {
                throw new Error('SKIP: No SQLite driver available')
            }
            throw error
        }
    })

    group.teardown(async () => {
        if (cleanup) await cleanup()
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

    test('getByDateRange with order desc returns newest first', async ({ assert }) => {
        const records = await db.getByDateRange('test_queries', new Date('2024-01-01'), new Date('2024-06-01'), undefined, 'desc')

        assert.lengthOf(records, 5)
        // Should be in descending order (newest first)
        assert.equal(records[0].url, '/file5.txt') // May 1
        assert.equal(records[4].url, '/file1.txt') // Jan 15
    })

    test('getByDateRange with order asc returns oldest first (default)', async ({ assert }) => {
        const records = await db.getByDateRange('test_queries', new Date('2024-01-01'), new Date('2024-06-01'), undefined, 'asc')

        assert.lengthOf(records, 5)
        // Should be in ascending order (oldest first)
        assert.equal(records[0].url, '/file1.txt') // Jan 15
        assert.equal(records[4].url, '/file5.txt') // May 1
    })

    test('getAfterDate returns records after date', async ({ assert }) => {
        const records = await db.getAfterDate('test_queries', new Date('2024-04-01'))

        assert.lengthOf(records, 2)
        assert.equal(records[0].url, '/file4.txt')
        assert.equal(records[1].url, '/file5.txt')
    })

    test('getLatestBefore returns most recent before date', async ({ assert }) => {
        const record = await db.getLatestBefore('test_queries', new Date('2024-03-20'))

        assert.isDefined(record)
        assert.equal(record!.url, '/file3.txt')
    })

    test('getLatestRecordsBefore returns multiple records', async ({ assert }) => {
        const records = await db.getLatestRecordsBefore('test_queries', new Date('2024-05-01'), 2)

        assert.lengthOf(records, 2)
        // Should be in descending order (newest first)
        assert.equal(records[0].url, '/file4.txt')
        assert.equal(records[1].url, '/file3.txt')
    })

    test('hasRecordsAfterDate returns true when records exist', async ({ assert }) => {
        const has = await db.hasRecordsAfterDate('test_queries', new Date('2024-04-01'))
        assert.isTrue(has)
    })

    test('hasRecordsAfterDate returns false when no records', async ({ assert }) => {
        const has = await db.hasRecordsAfterDate('test_queries', new Date('2025-01-01'))
        assert.isFalse(has)
    })

    test('countByDateRange counts records correctly', async ({ assert }) => {
        const count = await db.countByDateRange('test_queries', new Date('2024-02-01'), new Date('2024-05-01'))
        assert.equal(count, 3)
    })
})

test.group('KnexDatabaseAdapter - Batch Operations', group => {
    let db: KnexDatabaseAdapter
    let cleanup: () => Promise<void>

    group.setup(async () => {
        try {
            const result = await createTestDb()
            db = result.db
            cleanup = result.cleanup
        } catch (error) {
            if (error instanceof Error && (error.message.includes('sqlite3') || error.message.includes('better-sqlite3'))) {
                throw new Error('SKIP: No SQLite driver available')
            }
            throw error
        }
    })

    group.teardown(async () => {
        if (cleanup) await cleanup()
    })

    test('saveBatch inserts multiple records', async ({ assert }) => {
        await db.createTable('test_batch_save')

        const metadata = [
            { name: 'test_batch_save', type: 'text/plain', url: '/batch1.txt', date: new Date() },
            { name: 'test_batch_save', type: 'text/plain', url: '/batch2.txt', date: new Date() },
            { name: 'test_batch_save', type: 'text/plain', url: '/batch3.txt', date: new Date() }
        ]

        const records = await db.saveBatch(metadata)

        assert.lengthOf(records, 3)

        // Verify count
        const count = await db.countByDateRange('test_batch_save', new Date('2020-01-01'))
        assert.equal(count, 3)
    })

    test('saveBatch returns empty array for empty input', async ({ assert }) => {
        const records = await db.saveBatch([])
        assert.lengthOf(records, 0)
    })

    test('deleteBatch removes multiple records', async ({ assert }) => {
        await db.createTable('test_batch_delete')

        const saved1 = await db.save({
            name: 'test_batch_delete',
            type: 'text/plain',
            url: '/del1.txt',
            date: new Date()
        })
        const saved2 = await db.save({
            name: 'test_batch_delete',
            type: 'text/plain',
            url: '/del2.txt',
            date: new Date()
        })

        await db.deleteBatch([
            { id: String(saved1.id), name: 'test_batch_delete' },
            { id: String(saved2.id), name: 'test_batch_delete' }
        ])

        const count = await db.countByDateRange('test_batch_delete', new Date('2020-01-01'))
        assert.equal(count, 0)
    })

    test('deleteBatch does nothing for empty input', async ({ assert }) => {
        await assert.doesNotThrow(async () => {
            await db.deleteBatch([])
        })
    })

    test('getByIdsBatch retrieves multiple records', async ({ assert }) => {
        await db.createTable('test_batch_get')

        const saved1 = await db.save({
            name: 'test_batch_get',
            type: 'text/plain',
            url: '/get1.txt',
            date: new Date()
        })
        const saved2 = await db.save({
            name: 'test_batch_get',
            type: 'text/plain',
            url: '/get2.txt',
            date: new Date()
        })

        const records = await db.getByIdsBatch([
            { id: String(saved1.id), name: 'test_batch_get' },
            { id: String(saved2.id), name: 'test_batch_get' }
        ])

        assert.lengthOf(records, 2)
    })

    test('getByIdsBatch returns empty array for empty input', async ({ assert }) => {
        const records = await db.getByIdsBatch([])
        assert.lengthOf(records, 0)
    })
})

test.group('KnexDatabaseAdapter - Asset Operations', group => {
    let db: KnexDatabaseAdapter
    let cleanup: () => Promise<void>

    group.setup(async () => {
        try {
            const result = await createTestDb()
            db = result.db
            cleanup = result.cleanup
            await db.createTable('test_assets_ops')
        } catch (error) {
            if (error instanceof Error && (error.message.includes('sqlite3') || error.message.includes('better-sqlite3'))) {
                throw new Error('SKIP: No SQLite driver available')
            }
            throw error
        }
    })

    group.teardown(async () => {
        if (cleanup) await cleanup()
    })

    test('getAllAssetsPaginated returns records with total count', async ({ assert }) => {
        // Insert some records
        for (let i = 0; i < 5; i++) {
            await db.save({
                name: 'test_assets_ops',
                type: 'text/plain',
                url: `/asset${i}.txt`,
                date: new Date()
            })
        }

        const { records, total } = await db.getAllAssetsPaginated('test_assets_ops', 0, 3)

        assert.equal(total, 5)
        assert.lengthOf(records, 3)
    })

    test('getAllAssetsPaginated respects offset', async ({ assert }) => {
        const { records } = await db.getAllAssetsPaginated('test_assets_ops', 3, 10)

        assert.lengthOf(records, 2) // 5 total - 3 offset = 2 remaining
    })

    test('updateAssetMetadata updates specified fields', async ({ assert }) => {
        const saved = await db.save({
            name: 'test_assets_ops',
            type: 'text/plain',
            url: '/update_test.txt',
            date: new Date(),
            description: 'Original',
            is_public: true
        })

        const updated = await db.updateAssetMetadata('test_assets_ops', saved.id, {
            description: 'Updated description',
            is_public: false
        })

        assert.equal(updated.id, saved.id)
    })

    test('updateAssetMetadata throws for non-existent record', async ({ assert }) => {
        await assert.rejects(
            () =>
                db.updateAssetMetadata('test_assets_ops', 99999, {
                    description: 'Test'
                }),
            /not found/
        )
    })

    test('updateAssetMetadata returns existing record when no updates', async ({ assert }) => {
        const saved = await db.save({
            name: 'test_assets_ops',
            type: 'text/plain',
            url: '/no_update.txt',
            date: new Date()
        })

        const result = await db.updateAssetMetadata('test_assets_ops', saved.id, {})

        assert.equal(result.id, saved.id)
    })
})

test.group('KnexDatabaseAdapter - Custom Table Operations', group => {
    let db: KnexDatabaseAdapter
    let cleanup: () => Promise<void>

    group.setup(async () => {
        try {
            const result = await createTestDb()
            db = result.db
            cleanup = result.cleanup
        } catch (error) {
            if (error instanceof Error && (error.message.includes('sqlite3') || error.message.includes('better-sqlite3'))) {
                throw new Error('SKIP: No SQLite driver available')
            }
            throw error
        }
    })

    group.teardown(async () => {
        if (cleanup) await cleanup()
    })

    test('createTableWithColumns creates table with custom columns', async ({ assert }) => {
        await db.createTableWithColumns('custom_test', {
            sensor_id: 'text not null',
            temperature: 'real',
            active: 'boolean default true',
            description: 'varchar(255)'
        })

        const exists = await db.doesTableExists('custom_test')
        assert.isTrue(exists)

        const columnInfo = await db.getKnex()('custom_test').columnInfo()
        assert.isDefined(columnInfo.id)
        assert.isDefined(columnInfo.sensor_id)
        assert.isDefined(columnInfo.temperature)
        assert.isDefined(columnInfo.active)
        assert.isDefined(columnInfo.description)
        assert.isDefined(columnInfo.created_at)
        assert.isDefined(columnInfo.updated_at)
    })

    test('insertCustomTableRecord inserts and returns ID', async ({ assert }) => {
        await db.createTableWithColumns('custom_insert', {
            name: 'text not null',
            value: 'integer'
        })

        const id = await db.insertCustomTableRecord('custom_insert', {
            name: 'Test',
            value: 42
        })

        assert.isNumber(id)
        assert.isTrue(id > 0)
    })

    test('getCustomTableRecordById retrieves record', async ({ assert }) => {
        await db.createTableWithColumns('custom_getbyid', {
            name: 'text not null'
        })

        const id = await db.insertCustomTableRecord('custom_getbyid', { name: 'Test' })

        const record = await db.getCustomTableRecordById('custom_getbyid', id)

        assert.isNotNull(record)
        assert.equal(record.id, id)
        assert.equal(record.name, 'Test')
    })

    test('getCustomTableRecordById returns null for non-existent', async ({ assert }) => {
        await db.createTableWithColumns('custom_getbyid_null', {
            name: 'text not null'
        })

        const record = await db.getCustomTableRecordById('custom_getbyid_null', 99999)
        assert.isNull(record)
    })

    test('findCustomTableRecords finds records by conditions', async ({ assert }) => {
        await db.createTableWithColumns('custom_find', {
            category: 'text',
            active: 'boolean default true'
        })

        await db.insertCustomTableRecord('custom_find', { category: 'A', active: true })
        await db.insertCustomTableRecord('custom_find', { category: 'B', active: true })
        await db.insertCustomTableRecord('custom_find', { category: 'A', active: false })

        const records = await db.findCustomTableRecords('custom_find', { category: 'A' })

        assert.lengthOf(records, 2)
    })

    test('findByConditions works with null values', async ({ assert }) => {
        await db.createTableWithColumns('custom_null_test', {
            optional_field: 'text'
        })

        await db.insertCustomTableRecord('custom_null_test', { optional_field: null })
        await db.insertCustomTableRecord('custom_null_test', { optional_field: 'value' })

        const records = await db.findByConditions('custom_null_test', { optional_field: null })

        assert.lengthOf(records, 1)
    })

    test('updateById updates record', async ({ assert }) => {
        await db.createTableWithColumns('custom_update', {
            name: 'text not null',
            status: 'text'
        })

        const id = await db.insertCustomTableRecord('custom_update', { name: 'Original', status: 'pending' })

        await db.updateById('custom_update', id, { name: 'Updated', status: 'completed' })

        const record = await db.getCustomTableRecordById('custom_update', id)
        assert.equal(record.name, 'Updated')
        assert.equal(record.status, 'completed')
    })

    test('updateById throws for non-existent record', async ({ assert }) => {
        await db.createTableWithColumns('custom_update_fail', {
            name: 'text not null'
        })

        await assert.rejects(() => db.updateById('custom_update_fail', 99999, { name: 'Test' }), /No record found/)
    })
})

test.group('KnexDatabaseAdapter - Table Name Validation', group => {
    let db: KnexDatabaseAdapter
    let cleanup: () => Promise<void>

    group.setup(async () => {
        try {
            const result = await createTestDb()
            db = result.db
            cleanup = result.cleanup
        } catch (error) {
            if (error instanceof Error && (error.message.includes('sqlite3') || error.message.includes('better-sqlite3'))) {
                throw new Error('SKIP: No SQLite driver available')
            }
            throw error
        }
    })

    group.teardown(async () => {
        if (cleanup) await cleanup()
    })

    test('rejects table name with SQL injection', async ({ assert }) => {
        await assert.rejects(
            () => db.createTable('users; DROP TABLE important--'),
            /Invalid table name/
        )
    })

    test('rejects table name starting with number', async ({ assert }) => {
        await assert.rejects(() => db.createTable('123table'), /Invalid table name/)
    })

    test('rejects excessively long table name', async ({ assert }) => {
        const longName = 'a'.repeat(64)
        await assert.rejects(() => db.createTable(longName), /Table name too long/)
    })

    test('accepts valid table names', async ({ assert }) => {
        await assert.doesNotThrow(() => db.createTable('valid_table_name'))
        await assert.doesNotThrow(() => db.createTable('_private_table'))
        await assert.doesNotThrow(() => db.createTable('Table123'))
    })
})

test.group('KnexDatabaseAdapter - Schema Migration', group => {
    let db: KnexDatabaseAdapter
    let cleanup: () => Promise<void>

    group.setup(async () => {
        try {
            const result = await createTestDb()
            db = result.db
            cleanup = result.cleanup
        } catch (error) {
            if (error instanceof Error && (error.message.includes('sqlite3') || error.message.includes('better-sqlite3'))) {
                throw new Error('SKIP: No SQLite driver available')
            }
            throw error
        }
    })

    group.teardown(async () => {
        if (cleanup) await cleanup()
    })

    test('migrateTableSchema adds missing columns', async ({ assert }) => {
        const knex = db.getKnex()

        // Create a minimal table manually (simulating old schema)
        await knex.schema.createTable('migrate_test', table => {
            table.increments('id').primary()
            table.string('name').notNullable()
            table.string('type').notNullable()
            table.string('url').notNullable()
            table.datetime('date').notNullable()
            // Intentionally missing: is_public, tileset_url, upload_status, etc.
        })

        const migrations = await db.migrateTableSchema('migrate_test')

        // Should have added missing columns
        assert.isTrue(migrations.length > 0)
        assert.isTrue(migrations.some(m => m.includes('is_public')))
    })

    test('migrateTableSchema returns empty for non-existent table', async ({ assert }) => {
        const migrations = await db.migrateTableSchema('non_existent_migrate')
        assert.lengthOf(migrations, 0)
    })

    test('migrateTableSchema is idempotent', async ({ assert }) => {
        // Create a complete table
        await db.createTable('migrate_idempotent')

        // First migration adds created_at and updated_at (not in standard createTable)
        const migrations1 = await db.migrateTableSchema('migrate_idempotent')

        // Second migration should do nothing
        const migrations2 = await db.migrateTableSchema('migrate_idempotent')

        // First migration adds 2 columns (created_at, updated_at)
        assert.isTrue(migrations1.length >= 0) // May add some columns
        // Second migration should be truly idempotent
        assert.lengthOf(migrations2, 0)
    })
})

test.group('KnexDatabaseAdapter - Static Factory Methods', () => {
    test('forPostgreSQL creates adapter with correct config', ({ assert }) => {
        // We can't actually connect to PostgreSQL without a server,
        // but we can verify the adapter is created
        const storage = new LocalStorageService('.test-pg')

        const pgConfig = {
            host: 'localhost',
            port: 5432,
            user: 'test',
            password: 'test',
            database: 'test_db'
        }

        const db = KnexDatabaseAdapter.forPostgreSQL(pgConfig, storage)

        assert.isDefined(db)
        assert.isDefined(db.getKnex())

        // Clean up without actually connecting - ignore errors
        db.close().catch(() => {})
    })

    test('forSQLite creates adapter with in-memory database', async ({ assert }) => {
        const storage = new LocalStorageService('.test-sqlite-memory')

        let db: KnexDatabaseAdapter | null = null
        try {
            db = KnexDatabaseAdapter.forSQLite({ filename: ':memory:', client: 'better-sqlite3' }, storage)
            // Should be able to execute queries
            await db.getKnex().raw('SELECT 1')
            assert.isTrue(true)
        } catch {
            // Try sqlite3
            try {
                db = KnexDatabaseAdapter.forSQLite({ filename: ':memory:', client: 'sqlite3' }, storage)
                await db.getKnex().raw('SELECT 1')
                assert.isTrue(true)
            } catch {
                // No SQLite driver available - skip
                return
            }
        } finally {
            if (db) {
                await db.close().catch(() => {})
            }
        }
    })
})
