import { test } from '@japa/runner'
import { sql } from 'kysely'
import { KyselyDatabaseAdapter } from '../src/adapters/kysely_database_adapter.js'
import { sqliteAdapterFactory, postgresAdapterFactory } from './helpers/factories.js'
import type { AdapterFactory } from './helpers/factories.js'

const pgAvailable = !!process.env.TEST_PG_HOST

function registerAdapterTests(label: string, factory: AdapterFactory) {
    test.group(`KyselyDatabaseAdapter [${label}] - Basic Operations`, group => {
        let db: KyselyDatabaseAdapter
        let cleanup: () => Promise<void>

        group.setup(async () => {
            const result = await factory()
            db = result.db
            cleanup = result.cleanup
        })
        group.teardown(async () => { await cleanup() })

        test('createTable creates table with expected columns', async ({ assert }) => {
            await db.createTable(`${label}_basic`)
            assert.isTrue(await db.doesTableExists(`${label}_basic`))
        })

        test('save inserts a record and returns it with ID', async ({ assert }) => {
            await db.createTable(`${label}_save`)
            const record = await db.save({ name: `${label}_save`, type: 'application/json', url: '/test/file.json', date: new Date() })
            assert.isDefined(record.id)
            assert.equal(record.name, `${label}_save`)
            assert.equal(record.contentType, 'application/json')
        })

        test('getById retrieves record by ID', async ({ assert }) => {
            await db.createTable(`${label}_getbyid`)
            const saved = await db.save({ name: `${label}_getbyid`, type: 'text/plain', url: '/test.txt', date: new Date() })
            const fetched = await db.getById(String(saved.id), `${label}_getbyid`)
            assert.isDefined(fetched)
            assert.equal(fetched!.id, saved.id)
        })

        test('getById returns undefined for non-existent ID', async ({ assert }) => {
            await db.createTable(`${label}_getbyid_none`)
            assert.isUndefined(await db.getById('99999', `${label}_getbyid_none`))
        })

        test('delete removes a record', async ({ assert }) => {
            await db.createTable(`${label}_delete`)
            const saved = await db.save({ name: `${label}_delete`, type: 'text/plain', url: '/test.txt', date: new Date() })
            await db.delete(String(saved.id), `${label}_delete`)
            assert.isUndefined(await db.getById(String(saved.id), `${label}_delete`))
        })

        test('getLatestByName returns most recent record', async ({ assert }) => {
            await db.createTable(`${label}_latest`)
            await db.save({ name: `${label}_latest`, type: 'text/plain', url: '/old.txt', date: new Date('2024-01-01') })
            await db.save({ name: `${label}_latest`, type: 'text/plain', url: '/new.txt', date: new Date('2024-06-01') })
            const latest = await db.getLatestByName(`${label}_latest`)
            assert.equal(latest!.url, '/new.txt')
        })

        test('doesTableExists returns false for non-existent table', async ({ assert }) => {
            assert.isFalse(await db.doesTableExists('non_existent_table_xyz'))
        })
    })

    test.group(`KyselyDatabaseAdapter [${label}] - Extended Queries`, group => {
        let db: KyselyDatabaseAdapter
        let cleanup: () => Promise<void>

        group.setup(async () => {
            const result = await factory()
            db = result.db
            cleanup = result.cleanup
            await db.createTable(`${label}_queries`)
            const dates = [
                new Date('2024-01-15'), new Date('2024-02-15'), new Date('2024-03-15'),
                new Date('2024-04-15'), new Date('2024-05-15'),
            ]
            for (let i = 0; i < dates.length; i++) {
                await db.save({ name: `${label}_queries`, type: 'text/plain', url: `/file${i + 1}.txt`, date: dates[i] })
            }
        })
        group.teardown(async () => { await cleanup() })

        test('getFirstByName returns oldest record', async ({ assert }) => {
            const first = await db.getFirstByName(`${label}_queries`)
            assert.equal(first!.url, '/file1.txt')
        })

        test('getByDateRange returns records in range', async ({ assert }) => {
            const records = await db.getByDateRange(`${label}_queries`, new Date('2024-02-01'), new Date('2024-04-01'))
            assert.lengthOf(records, 2)
            assert.equal(records[0].url, '/file2.txt')
        })

        test('getByDateRange with limit restricts results', async ({ assert }) => {
            const records = await db.getByDateRange(`${label}_queries`, new Date('2024-01-01'), undefined, 2)
            assert.lengthOf(records, 2)
        })

        test('getByDateRange with desc order returns newest first', async ({ assert }) => {
            const records = await db.getByDateRange(`${label}_queries`, new Date('2024-01-01'), new Date('2024-06-01'), undefined, 'desc')
            assert.lengthOf(records, 5)
            assert.equal(records[0].url, '/file5.txt')
        })

        test('getAfterDate returns records after date', async ({ assert }) => {
            const records = await db.getAfterDate(`${label}_queries`, new Date('2024-04-01'))
            assert.lengthOf(records, 2)
            assert.equal(records[0].url, '/file4.txt')
        })

        test('getLatestBefore returns most recent before date', async ({ assert }) => {
            const record = await db.getLatestBefore(`${label}_queries`, new Date('2024-03-20'))
            assert.equal(record!.url, '/file3.txt')
        })

        test('getLatestRecordsBefore returns multiple records', async ({ assert }) => {
            const records = await db.getLatestRecordsBefore(`${label}_queries`, new Date('2024-05-01'), 2)
            assert.lengthOf(records, 2)
            assert.equal(records[0].url, '/file4.txt')
        })

        test('hasRecordsAfterDate returns true when records exist', async ({ assert }) => {
            assert.isTrue(await db.hasRecordsAfterDate(`${label}_queries`, new Date('2024-04-01')))
        })

        test('hasRecordsAfterDate returns false when no records', async ({ assert }) => {
            assert.isFalse(await db.hasRecordsAfterDate(`${label}_queries`, new Date('2025-01-01')))
        })

        test('countByDateRange counts records correctly', async ({ assert }) => {
            assert.equal(await db.countByDateRange(`${label}_queries`, new Date('2024-02-01'), new Date('2024-05-01')), 3)
        })
    })

    test.group(`KyselyDatabaseAdapter [${label}] - Batch Operations`, group => {
        let db: KyselyDatabaseAdapter
        let cleanup: () => Promise<void>

        group.setup(async () => {
            const result = await factory()
            db = result.db
            cleanup = result.cleanup
        })
        group.teardown(async () => { await cleanup() })

        test('saveBatch inserts multiple records', async ({ assert }) => {
            await db.createTable(`${label}_batch_save`)
            const records = await db.saveBatch([
                { name: `${label}_batch_save`, type: 'text/plain', url: '/b1.txt', date: new Date() },
                { name: `${label}_batch_save`, type: 'text/plain', url: '/b2.txt', date: new Date() },
                { name: `${label}_batch_save`, type: 'text/plain', url: '/b3.txt', date: new Date() },
            ])
            assert.lengthOf(records, 3)
        })

        test('saveBatch returns empty array for empty input', async ({ assert }) => {
            assert.lengthOf(await db.saveBatch([]), 0)
        })

        test('deleteBatch removes multiple records', async ({ assert }) => {
            await db.createTable(`${label}_batch_del`)
            const s1 = await db.save({ name: `${label}_batch_del`, type: 'text/plain', url: '/d1.txt', date: new Date() })
            const s2 = await db.save({ name: `${label}_batch_del`, type: 'text/plain', url: '/d2.txt', date: new Date() })
            await db.deleteBatch([{ id: String(s1.id), name: `${label}_batch_del` }, { id: String(s2.id), name: `${label}_batch_del` }])
            assert.equal(await db.countByDateRange(`${label}_batch_del`, new Date('2020-01-01')), 0)
        })

        test('getByIdsBatch retrieves multiple records', async ({ assert }) => {
            await db.createTable(`${label}_batch_get`)
            const s1 = await db.save({ name: `${label}_batch_get`, type: 'text/plain', url: '/g1.txt', date: new Date() })
            const s2 = await db.save({ name: `${label}_batch_get`, type: 'text/plain', url: '/g2.txt', date: new Date() })
            const records = await db.getByIdsBatch([{ id: String(s1.id), name: `${label}_batch_get` }, { id: String(s2.id), name: `${label}_batch_get` }])
            assert.lengthOf(records, 2)
        })
    })

    test.group(`KyselyDatabaseAdapter [${label}] - Asset Operations`, group => {
        let db: KyselyDatabaseAdapter
        let cleanup: () => Promise<void>

        group.setup(async () => {
            const result = await factory()
            db = result.db
            cleanup = result.cleanup
            await db.createTable(`${label}_assets`)
            for (let i = 0; i < 5; i++) {
                await db.save({ name: `${label}_assets`, type: 'text/plain', url: `/a${i}.txt`, date: new Date() })
            }
        })
        group.teardown(async () => { await cleanup() })

        test('getAllAssetsPaginated returns records with total count', async ({ assert }) => {
            const { records, total } = await db.getAllAssetsPaginated(`${label}_assets`, 0, 3)
            assert.equal(total, 5)
            assert.lengthOf(records, 3)
        })

        test('getAllAssetsPaginated respects offset', async ({ assert }) => {
            const { records } = await db.getAllAssetsPaginated(`${label}_assets`, 3, 10)
            assert.lengthOf(records, 2)
        })

        test('updateAssetMetadata updates specified fields', async ({ assert }) => {
            const saved = await db.save({ name: `${label}_assets`, type: 'text/plain', url: '/upd.txt', date: new Date(), description: 'Original' })
            const updated = await db.updateAssetMetadata(`${label}_assets`, saved.id, { description: 'Updated' })
            assert.equal(updated.id, saved.id)
        })

        test('updateAssetMetadata throws for non-existent record', async ({ assert }) => {
            await assert.rejects(() => db.updateAssetMetadata(`${label}_assets`, 99999, { description: 'Test' }), /not found/i)
        })
    })

    test.group(`KyselyDatabaseAdapter [${label}] - Custom Table Operations`, group => {
        let db: KyselyDatabaseAdapter
        let cleanup: () => Promise<void>

        group.setup(async () => {
            const result = await factory()
            db = result.db
            cleanup = result.cleanup
        })
        group.teardown(async () => { await cleanup() })

        test('createTableWithColumns creates table with custom columns', async ({ assert }) => {
            await db.createTableWithColumns(`${label}_custom`, { sensor_id: 'text not null', temperature: 'real', description: 'varchar(255)' })
            assert.isTrue(await db.doesTableExists(`${label}_custom`))
        })

        test('insertCustomTableRecord inserts and returns ID', async ({ assert }) => {
            await db.createTableWithColumns(`${label}_insert`, { name: 'text not null', value: 'integer' })
            const id = await db.insertCustomTableRecord(`${label}_insert`, { name: 'Test', value: 42 })
            assert.isNumber(id)
            assert.isTrue(id > 0)
        })

        test('getCustomTableRecordById retrieves record', async ({ assert }) => {
            await db.createTableWithColumns(`${label}_getbyid_ct`, { name: 'text not null' })
            const id = await db.insertCustomTableRecord(`${label}_getbyid_ct`, { name: 'Test' })
            const record = await db.getCustomTableRecordById(`${label}_getbyid_ct`, id)
            assert.isNotNull(record)
            assert.equal(record.name, 'Test')
        })

        test('getCustomTableRecordById returns null for non-existent', async ({ assert }) => {
            await db.createTableWithColumns(`${label}_null_ct`, { name: 'text not null' })
            assert.isNull(await db.getCustomTableRecordById(`${label}_null_ct`, 99999))
        })

        test('findCustomTableRecords finds records by conditions', async ({ assert }) => {
            await db.createTableWithColumns(`${label}_find`, { category: 'text' })
            await db.insertCustomTableRecord(`${label}_find`, { category: 'A' })
            await db.insertCustomTableRecord(`${label}_find`, { category: 'B' })
            await db.insertCustomTableRecord(`${label}_find`, { category: 'A' })
            const records = await db.findCustomTableRecords(`${label}_find`, { category: 'A' })
            assert.lengthOf(records, 2)
        })

        test('updateById updates record', async ({ assert }) => {
            await db.createTableWithColumns(`${label}_update`, { name: 'text not null', status: 'text' })
            const id = await db.insertCustomTableRecord(`${label}_update`, { name: 'Original', status: 'pending' })
            await db.updateById(`${label}_update`, id, { name: 'Updated', status: 'completed' })
            const record = await db.getCustomTableRecordById(`${label}_update`, id)
            assert.equal(record.name, 'Updated')
        })

        test('updateById throws for non-existent record', async ({ assert }) => {
            await db.createTableWithColumns(`${label}_update_fail`, { name: 'text not null' })
            await assert.rejects(() => db.updateById(`${label}_update_fail`, 99999, { name: 'Test' }), /No record found/)
        })
    })

    test.group(`KyselyDatabaseAdapter [${label}] - Table Name Validation`, group => {
        let db: KyselyDatabaseAdapter
        let cleanup: () => Promise<void>

        group.setup(async () => {
            const result = await factory()
            db = result.db
            cleanup = result.cleanup
        })
        group.teardown(async () => { await cleanup() })

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
            await db.doesTableExists('valid_table')
            await db.doesTableExists('_private')
            assert.isTrue(true)
        })
    })

    test.group(`KyselyDatabaseAdapter [${label}] - ensureColumns`, group => {
        let db: KyselyDatabaseAdapter
        let cleanup: () => Promise<void>

        group.setup(async () => {
            const result = await factory()
            db = result.db
            cleanup = result.cleanup
        })
        group.teardown(async () => { await cleanup() })

        test('ensureColumns adds missing columns to existing table', async ({ assert }) => {
            await db.createTableWithColumns(`${label}_ensure`, { sensor_id: 'text not null' })
            await db.ensureColumns(`${label}_ensure`, { sensor_id: 'text not null', temperature: 'real' })
            const tables = await db.getKysely().introspection.getTables()
            const table = tables.find(t => t.name === `${label}_ensure`)
            assert.include(table!.columns.map(c => c.name), 'temperature')
        })

        test('ensureColumns is a no-op when all columns exist', async ({ assert }) => {
            await db.createTableWithColumns(`${label}_ensure_noop`, { sensor_id: 'text not null' })
            await assert.doesNotReject(() => db.ensureColumns(`${label}_ensure_noop`, { sensor_id: 'text not null' }))
        })

        test('migrateTableSchema is idempotent on current schema', async ({ assert }) => {
            await db.createTable(`${label}_migrate_idem`)
            await db.migrateTableSchema(`${label}_migrate_idem`)
            assert.lengthOf(await db.migrateTableSchema(`${label}_migrate_idem`), 0)
        })

        test('migrateTableSchema returns empty for non-existent table', async ({ assert }) => {
            assert.lengthOf(await db.migrateTableSchema('non_existent_xyz'), 0)
        })
    })

    // SQLite-specific: uses autoIncrement + datetime (SQLite-only syntax)
    if (label === 'sl') {
        test.group('KyselyDatabaseAdapter [SQLite] - migrateTableSchema (legacy)', group => {
            let db: KyselyDatabaseAdapter
            let cleanup: () => Promise<void>

            group.setup(async () => {
                const result = await factory()
                db = result.db
                cleanup = result.cleanup
            })
            group.teardown(async () => { await cleanup() })

            test('migrateTableSchema adds missing columns to legacy table', async ({ assert }) => {
                const kysely = db.getKysely()
                await kysely.schema
                    .createTable('migrate_legacy_sqlite')
                    .addColumn('id', 'integer', col => col.primaryKey().autoIncrement())
                    .addColumn('name', 'varchar(255)', col => col.notNull())
                    .addColumn('type', 'varchar(255)', col => col.notNull())
                    .addColumn('url', 'varchar(255)', col => col.notNull())
                    .addColumn('date', 'datetime', col => col.notNull())
                    .execute()
                const migrations = await db.migrateTableSchema('migrate_legacy_sqlite')
                assert.isTrue(migrations.length > 0)
                assert.isTrue(migrations.some(m => m.includes('is_public')))
            })
        })
    } else {
        test.group('KyselyDatabaseAdapter [PostgreSQL] - migrateTableSchema (legacy)', group => {
            let db: KyselyDatabaseAdapter
            let cleanup: () => Promise<void>

            group.setup(async () => {
                const result = await factory()
                db = result.db
                cleanup = result.cleanup
            })
            group.teardown(async () => { await cleanup() })

            test('migrateTableSchema adds missing columns to legacy table', async ({ assert }) => {
                await sql`
                    CREATE TABLE migrate_legacy_pg (
                        id SERIAL PRIMARY KEY,
                        name VARCHAR(255) NOT NULL,
                        type VARCHAR(255) NOT NULL,
                        url VARCHAR(255) NOT NULL,
                        date TIMESTAMPTZ NOT NULL
                    )
                `.execute(db.getKysely())
                const migrations = await db.migrateTableSchema('migrate_legacy_pg')
                assert.isTrue(migrations.length > 0)
                assert.isTrue(migrations.some(m => m.includes('is_public')))
            })
        })
    }
}

registerAdapterTests('sl', sqliteAdapterFactory)

if (pgAvailable) {
    registerAdapterTests('pg', postgresAdapterFactory)
}
