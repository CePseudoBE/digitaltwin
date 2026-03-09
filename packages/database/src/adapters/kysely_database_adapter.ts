import { Kysely, SqliteDialect, PostgresDialect, sql } from 'kysely'
import type { DataRecord, DataResolver, MetadataRow, UserRepository } from '@digitaltwin/shared'
import { DatabaseAdapter } from '../database_adapter.js'
import { mapToDataRecord } from '../map_to_data_record.js'
import { KyselyUserRepository } from '../kysely_user_repository.js'

export interface KyselyPostgreSQLConfig {
    host: string
    port?: number
    user: string
    password: string
    database: string
    ssl?: boolean
    /** Max pool size (default: 15) */
    maxConnections?: number
}

export interface KyselySQLiteConfig {
    filename: string
    enableForeignKeys?: boolean
    busyTimeout?: number
}

// Minimal type for dynamic tables — Kysely requires a DB interface
// but we use dynamic table names, so we use a loose type
interface DynamicDatabase {
    [key: string]: Record<string, unknown>
}

/**
 * Kysely-based implementation of DatabaseAdapter.
 *
 * Type-safe SQL query builder with support for PostgreSQL and SQLite.
 */
export class KyselyDatabaseAdapter extends DatabaseAdapter {
    readonly #db: Kysely<DynamicDatabase>
    readonly #dataResolver: DataResolver
    readonly #dialect: 'postgres' | 'sqlite'

    constructor(db: Kysely<DynamicDatabase>, dataResolver: DataResolver, dialect: 'postgres' | 'sqlite') {
        super()
        this.#db = db
        this.#dataResolver = dataResolver
        this.#dialect = dialect
    }

    /**
     * Create a KyselyDatabaseAdapter for PostgreSQL.
     *
     * Uses the same config shape as KnexDatabaseAdapter.forPostgreSQL().
     * Requires `pg` to be installed as a peer dependency.
     *
     * @example
     * ```typescript
     * const adapter = await KyselyDatabaseAdapter.forPostgreSQL(
     *     { host: 'localhost', user: 'admin', password: 'secret', database: 'mydb' },
     *     dataResolver
     * )
     * ```
     */
    static async forPostgreSQL(
        config: KyselyPostgreSQLConfig,
        dataResolver: DataResolver
    ): Promise<KyselyDatabaseAdapter> {
        // Dynamic import — pg is an optional peer dependency
        const pg = await import('pg').catch(() => {
            throw new Error('pg is required for PostgreSQL. Install it: pnpm add pg')
        })
        const Pool = pg.default?.Pool ?? pg.Pool
        const pool = new Pool({
            host: config.host,
            port: config.port ?? 5432,
            user: config.user,
            password: config.password,
            database: config.database,
            ssl: config.ssl ? { rejectUnauthorized: false } : false,
            max: config.maxConnections ?? 15
        })

        const dialect = new PostgresDialect({ pool: pool as any })
        const db = new Kysely<DynamicDatabase>({ dialect })
        return new KyselyDatabaseAdapter(db, dataResolver, 'postgres')
    }

    /**
     * Create a KyselyDatabaseAdapter for SQLite.
     *
     * Uses the same config shape as KnexDatabaseAdapter.forSQLite().
     * Requires `better-sqlite3` to be installed as a peer dependency.
     *
     * @example
     * ```typescript
     * const adapter = await KyselyDatabaseAdapter.forSQLite(
     *     { filename: './data/digitaltwin.db' },
     *     dataResolver
     * )
     * ```
     */
    static async forSQLite(
        config: KyselySQLiteConfig,
        dataResolver: DataResolver
    ): Promise<KyselyDatabaseAdapter> {
        const BetterSqlite3 = await import('better-sqlite3')
        const Database = BetterSqlite3.default ?? BetterSqlite3
        const sqliteDb = new Database(config.filename)

        // Set PRAGMAs for performance and integrity
        if (config.enableForeignKeys !== false) {
            sqliteDb.pragma('foreign_keys = ON')
        }
        sqliteDb.pragma('journal_mode = WAL')
        sqliteDb.pragma('synchronous = NORMAL')
        sqliteDb.pragma('cache_size = 10000')

        if (config.busyTimeout) {
            sqliteDb.pragma(`busy_timeout = ${config.busyTimeout}`)
        }

        const dialect = new SqliteDialect({ database: sqliteDb as any })
        const db = new Kysely<DynamicDatabase>({ dialect })

        return new KyselyDatabaseAdapter(db, dataResolver, 'sqlite')
    }

    /**
     * Create a KyselyDatabaseAdapter from an existing better-sqlite3 Database instance.
     * Useful for testing with in-memory databases.
     */
    static fromSQLiteDatabase(
        sqliteDb: unknown,
        dataResolver: DataResolver,
        options: { enableForeignKeys?: boolean } = {}
    ): KyselyDatabaseAdapter {
        const db = sqliteDb as any

        if (options.enableForeignKeys !== false) {
            db.pragma('foreign_keys = ON')
        }
        db.pragma('journal_mode = WAL')
        db.pragma('synchronous = NORMAL')
        db.pragma('cache_size = 10000')

        const dialect = new SqliteDialect({ database: db })
        const kysely = new Kysely<DynamicDatabase>({ dialect })
        return new KyselyDatabaseAdapter(kysely, dataResolver, 'sqlite')
    }

    /**
     * Create a KyselyDatabaseAdapter from an existing pg.Pool instance.
     * Useful when you manage the pool lifecycle externally.
     */
    static fromPool(
        pool: unknown,
        dataResolver: DataResolver
    ): KyselyDatabaseAdapter {
        const dialect = new PostgresDialect({ pool: pool as any })
        const db = new Kysely<DynamicDatabase>({ dialect })
        return new KyselyDatabaseAdapter(db, dataResolver, 'postgres')
    }

    // ========== Helpers ==========

    #validateTableName(name: string): void {
        if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
            throw new Error(
                `Invalid table name: "${name}". Must start with a letter or underscore and contain only alphanumeric characters and underscores.`
            )
        }
        if (name.length > 63) {
            throw new Error(`Table name too long: "${name}". Maximum 63 characters allowed.`)
        }
    }

    async #tableExists(name: string): Promise<boolean> {
        const tables = await this.#db.introspection.getTables()
        return tables.some(t => t.name === name)
    }

    async #columnExists(tableName: string, columnName: string): Promise<boolean> {
        const tables = await this.#db.introspection.getTables()
        const table = tables.find(t => t.name === tableName)
        if (!table) return false
        return table.columns.some(c => c.name === columnName)
    }

    async #indexExists(tableName: string, indexName: string): Promise<boolean> {
        try {
            if (this.#dialect === 'postgres') {
                const result = await sql<{ count: string }>`SELECT 1 FROM pg_indexes WHERE tablename = ${tableName} AND indexname = ${indexName}`.execute(this.#db)
                return result.rows.length > 0
            }
            // SQLite
            const result = await sql<{ name: string }>`SELECT name FROM sqlite_master WHERE type='index' AND name=${indexName}`.execute(this.#db)
            return result.rows.length > 0
        } catch {
            return false
        }
    }

    /**
     * SQLite cannot bind Date objects or booleans — convert them to ISO strings / 0|1.
     */
    #sanitizeValues(data: Record<string, unknown>): Record<string, unknown> {
        if (this.#dialect !== 'sqlite') return data
        const out: Record<string, unknown> = {}
        for (const [k, v] of Object.entries(data)) {
            if (v instanceof Date) out[k] = v.toISOString()
            else if (typeof v === 'boolean') out[k] = v ? 1 : 0
            else out[k] = v
        }
        return out
    }

    // ========== Basic CRUD ==========

    async save(meta: MetadataRow): Promise<DataRecord> {
        this.#validateTableName(meta.name)

        const insertData: Record<string, unknown> = {
            name: meta.name,
            type: meta.type,
            url: meta.url,
            date: meta.date.toISOString()
        }

        if ('description' in meta) insertData.description = meta.description
        if ('source' in meta) insertData.source = meta.source
        if ('owner_id' in meta) insertData.owner_id = meta.owner_id
        if ('filename' in meta) insertData.filename = meta.filename
        if ('is_public' in meta) insertData.is_public = meta.is_public
        if ('tileset_url' in meta) insertData.tileset_url = meta.tileset_url
        if ('upload_status' in meta) insertData.upload_status = meta.upload_status
        if ('upload_error' in meta) insertData.upload_error = meta.upload_error
        if ('upload_job_id' in meta) insertData.upload_job_id = meta.upload_job_id
        if ('presigned_key' in meta) insertData.presigned_key = meta.presigned_key
        if ('presigned_expires_at' in meta) {
            insertData.presigned_expires_at = meta.presigned_expires_at instanceof Date
                ? meta.presigned_expires_at.toISOString()
                : meta.presigned_expires_at
        }

        const result = await this.#db
            .insertInto(meta.name)
            .values(this.#sanitizeValues(insertData))
            .returning('id')
            .executeTakeFirstOrThrow()

        const newId = (result as any).id
        return mapToDataRecord({ ...meta, id: newId }, this.#dataResolver)
    }

    async delete(id: string, name: string): Promise<void> {
        this.#validateTableName(name)
        await this.#db.deleteFrom(name).where('id', '=', id).execute()
    }

    async getById(id: string, name: string): Promise<DataRecord | undefined> {
        this.#validateTableName(name)
        const row = await this.#db.selectFrom(name).selectAll().where('id', '=', id).executeTakeFirst()
        return row ? mapToDataRecord(row, this.#dataResolver) : undefined
    }

    async getLatestByName(name: string): Promise<DataRecord | undefined> {
        this.#validateTableName(name)
        const row = await this.#db.selectFrom(name).selectAll().orderBy('date', 'desc').limit(1).executeTakeFirst()
        return row ? mapToDataRecord(row, this.#dataResolver) : undefined
    }

    async doesTableExists(name: string): Promise<boolean> {
        this.#validateTableName(name)
        return this.#tableExists(name)
    }

    async createTable(name: string): Promise<void> {
        this.#validateTableName(name)
        if (await this.#tableExists(name)) return

        await this.#db.schema
            .createTable(name)
            .addColumn('id', 'integer', col => col.primaryKey().autoIncrement())
            .addColumn('name', 'varchar(255)', col => col.notNull())
            .addColumn('type', 'varchar(255)', col => col.notNull())
            .addColumn('url', 'varchar(255)', col => col.notNull())
            .addColumn('date', 'datetime', col => col.notNull())
            .addColumn('description', 'text')
            .addColumn('source', 'varchar(255)')
            .addColumn('owner_id', 'integer', col =>
                col.references('users.id').onDelete('set null')
            )
            .addColumn('filename', 'varchar(255)')
            .addColumn('is_public', 'boolean', col => col.defaultTo(true).notNull())
            .addColumn('tileset_url', 'text')
            .addColumn('upload_status', 'varchar(20)')
            .addColumn('upload_error', 'text')
            .addColumn('upload_job_id', 'varchar(100)')
            .addColumn('presigned_key', 'text')
            .addColumn('presigned_expires_at', 'datetime')
            .execute()

        // Create indexes
        await this.#db.schema.createIndex(`${name}_idx_name`).on(name).column('name').execute()
        await this.#db.schema.createIndex(`${name}_idx_date`).on(name).column('date').execute()
        await this.#db.schema.createIndex(`${name}_idx_name_date`).on(name).columns(['name', 'date']).execute()
        await this.#db.schema.createIndex(`${name}_idx_date_name`).on(name).columns(['date', 'name']).execute()
        await this.#db.schema.createIndex(`${name}_idx_owner_id`).on(name).column('owner_id').execute()
        await this.#db.schema.createIndex(`${name}_idx_is_public`).on(name).column('is_public').execute()
    }

    async createTableWithColumns(name: string, columns: Record<string, string>): Promise<void> {
        this.#validateTableName(name)
        if (await this.#tableExists(name)) return

        let builder = this.#db.schema
            .createTable(name)
            .addColumn('id', 'integer', col => col.primaryKey().autoIncrement())
            .addColumn('created_at', 'datetime', col => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
            .addColumn('updated_at', 'datetime', col => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())

        for (const [columnName, sqlType] of Object.entries(columns)) {
            builder = this.#addDynamicColumn(builder, columnName, sqlType)
        }

        await builder.execute()

        await this.#db.schema.createIndex(`${name}_idx_created_at`).on(name).column('created_at').execute()
        await this.#db.schema.createIndex(`${name}_idx_updated_at`).on(name).column('updated_at').execute()
    }

    #addDynamicColumn(builder: any, columnName: string, sqlType: string): any {
        const lower = sqlType.toLowerCase()
        const notNull = lower.includes('not null')

        let dataType: string
        if (lower.includes('text')) dataType = 'text'
        else if (lower.includes('integer')) dataType = 'integer'
        else if (lower.includes('boolean')) dataType = 'boolean'
        else if (lower.includes('timestamp') || lower.includes('datetime')) dataType = 'datetime'
        else if (lower.includes('real') || lower.includes('decimal') || lower.includes('float')) dataType = 'real'
        else if (lower.includes('varchar')) {
            const match = lower.match(/varchar\((\d+)\)/)
            dataType = match ? `varchar(${match[1]})` : 'varchar(255)'
        } else {
            dataType = 'varchar(255)'
        }

        return builder.addColumn(columnName, dataType, (col: any) => {
            if (notNull) col = col.notNull()
            if (lower.includes('default true')) col = col.defaultTo(true)
            else if (lower.includes('default false')) col = col.defaultTo(false)
            else if (lower.includes('default current_timestamp')) col = col.defaultTo(sql`CURRENT_TIMESTAMP`)
            return col
        })
    }

    async migrateTableSchema(name: string): Promise<string[]> {
        this.#validateTableName(name)
        if (!(await this.#tableExists(name))) return []

        const migrations: string[] = []

        const columnsToAdd: Array<{ name: string; type: string; defaultVal?: any; notNull?: boolean; description: string }> = [
            { name: 'is_public', type: 'boolean', defaultVal: true, notNull: true, description: 'BOOLEAN DEFAULT true NOT NULL' },
            { name: 'tileset_url', type: 'text', description: 'TEXT nullable' },
            { name: 'upload_status', type: 'varchar(20)', description: 'VARCHAR(20) nullable' },
            { name: 'upload_error', type: 'text', description: 'TEXT nullable' },
            { name: 'upload_job_id', type: 'varchar(100)', description: 'VARCHAR(100) nullable' },
            { name: 'created_at', type: 'datetime', description: 'DATETIME nullable' },
            { name: 'updated_at', type: 'datetime', description: 'DATETIME nullable' },
            { name: 'presigned_key', type: 'text', description: 'TEXT nullable' },
            { name: 'presigned_expires_at', type: 'datetime', description: 'DATETIME nullable' }
        ]

        for (const col of columnsToAdd) {
            if (!(await this.#columnExists(name, col.name))) {
                let alter = this.#db.schema.alterTable(name).addColumn(col.name, col.type as any, (c: any) => {
                    if (col.defaultVal !== undefined) c = c.defaultTo(col.defaultVal)
                    if (col.notNull) c = c.notNull()
                    return c
                })
                await alter.execute()
                migrations.push(`Added column '${col.name}' (${col.description})`)
            }
        }

        // Add missing indexes
        if (!(await this.#indexExists(name, `${name}_idx_is_public`))) {
            await this.#db.schema.createIndex(`${name}_idx_is_public`).on(name).column('is_public').execute()
            migrations.push(`Added index '${name}_idx_is_public'`)
        }

        return migrations
    }

    // ========== Extended queries ==========

    async getFirstByName(name: string): Promise<DataRecord | undefined> {
        this.#validateTableName(name)
        const row = await this.#db.selectFrom(name).selectAll().orderBy('date', 'asc').executeTakeFirst()
        return row ? mapToDataRecord(row, this.#dataResolver) : undefined
    }

    async getByDateRange(
        name: string,
        startDate: Date,
        endDate?: Date,
        limit?: number,
        order: 'asc' | 'desc' = 'asc'
    ): Promise<DataRecord[]> {
        this.#validateTableName(name)
        let query = this.#db.selectFrom(name).selectAll().where('date', '>=', startDate.toISOString())

        if (endDate) {
            query = query.where('date', '<', endDate.toISOString())
        }

        query = query.orderBy('date', order)

        if (limit) {
            query = query.limit(limit)
        }

        const rows = await query.execute()
        return rows.map(row => mapToDataRecord(row, this.#dataResolver))
    }

    async getAfterDate(name: string, afterDate: Date, limit?: number): Promise<DataRecord[]> {
        this.#validateTableName(name)
        let query = this.#db.selectFrom(name).selectAll().where('date', '>', afterDate.toISOString()).orderBy('date', 'asc')

        if (limit) {
            query = query.limit(limit)
        }

        const rows = await query.execute()
        return rows.map(row => mapToDataRecord(row, this.#dataResolver))
    }

    async getLatestBefore(name: string, beforeDate: Date): Promise<DataRecord | undefined> {
        this.#validateTableName(name)
        const row = await this.#db
            .selectFrom(name)
            .selectAll()
            .where('date', '<', beforeDate.toISOString())
            .orderBy('date', 'desc')
            .executeTakeFirst()
        return row ? mapToDataRecord(row, this.#dataResolver) : undefined
    }

    async getLatestRecordsBefore(name: string, beforeDate: Date, limit: number): Promise<DataRecord[]> {
        this.#validateTableName(name)
        const rows = await this.#db
            .selectFrom(name)
            .selectAll()
            .where('date', '<', beforeDate.toISOString())
            .orderBy('date', 'desc')
            .limit(limit)
            .execute()
        return rows.map(row => mapToDataRecord(row, this.#dataResolver))
    }

    async hasRecordsAfterDate(name: string, afterDate: Date): Promise<boolean> {
        this.#validateTableName(name)
        const row = await this.#db
            .selectFrom(name)
            .select(sql`1`.as('one'))
            .where('date', '>', afterDate.toISOString())
            .limit(1)
            .executeTakeFirst()
        return !!row
    }

    async countByDateRange(name: string, startDate: Date, endDate?: Date): Promise<number> {
        this.#validateTableName(name)
        let query = this.#db
            .selectFrom(name)
            .select(this.#db.fn.countAll().as('count'))
            .where('date', '>=', startDate.toISOString())

        if (endDate) {
            query = query.where('date', '<', endDate.toISOString())
        }

        const result = await query.executeTakeFirst()
        return Number(result?.count) || 0
    }

    // ========== Batch operations ==========

    async saveBatch(metadataList: MetadataRow[]): Promise<DataRecord[]> {
        if (metadataList.length === 0) return []

        for (const meta of metadataList) {
            this.#validateTableName(meta.name)
        }

        const groupedByTable = new Map<string, MetadataRow[]>()
        for (const meta of metadataList) {
            const group = groupedByTable.get(meta.name)
            if (group) group.push(meta)
            else groupedByTable.set(meta.name, [meta])
        }

        return this.#db.transaction().execute(async (trx) => {
            const results: DataRecord[] = []

            for (const [tableName, metas] of groupedByTable) {
                const insertData = metas.map(meta => {
                    const data: Record<string, unknown> = {
                        name: meta.name,
                        type: meta.type,
                        url: meta.url,
                        date: meta.date.toISOString()
                    }
                    if (meta.id !== undefined) data.id = meta.id
                    if ('description' in meta) data.description = meta.description
                    if ('source' in meta) data.source = meta.source
                    if ('owner_id' in meta) data.owner_id = meta.owner_id
                    if ('filename' in meta) data.filename = meta.filename
                    return data
                })

                await trx.insertInto(tableName).values(insertData.map(d => this.#sanitizeValues(d))).execute()

                for (const meta of metas) {
                    results.push(mapToDataRecord(meta, this.#dataResolver))
                }
            }

            return results
        })
    }

    async deleteBatch(deleteRequests: Array<{ id: string; name: string }>): Promise<void> {
        if (deleteRequests.length === 0) return

        for (const req of deleteRequests) {
            this.#validateTableName(req.name)
        }

        const groupedByTable = new Map<string, string[]>()
        for (const req of deleteRequests) {
            const group = groupedByTable.get(req.name)
            if (group) group.push(req.id)
            else groupedByTable.set(req.name, [req.id])
        }

        await this.#db.transaction().execute(async (trx) => {
            for (const [tableName, ids] of groupedByTable) {
                await trx.deleteFrom(tableName).where('id', 'in', ids).execute()
            }
        })
    }

    async getByIdsBatch(requests: Array<{ id: string; name: string }>): Promise<DataRecord[]> {
        if (requests.length === 0) return []

        for (const req of requests) {
            this.#validateTableName(req.name)
        }

        const results: DataRecord[] = []
        const groupedByTable = new Map<string, string[]>()

        for (const req of requests) {
            const group = groupedByTable.get(req.name)
            if (group) group.push(req.id)
            else groupedByTable.set(req.name, [req.id])
        }

        for (const [tableName, ids] of groupedByTable) {
            const rows = await this.#db.selectFrom(tableName).selectAll().where('id', 'in', ids).execute()
            for (const row of rows) {
                results.push(mapToDataRecord(row, this.#dataResolver))
            }
        }

        return results
    }

    // ========== Asset operations ==========

    async getAllAssetsPaginated(
        name: string,
        offset: number = 0,
        limit: number = 100
    ): Promise<{ records: DataRecord[]; total: number }> {
        this.#validateTableName(name)

        const countResult = await this.#db
            .selectFrom(name)
            .select(this.#db.fn.countAll().as('count'))
            .executeTakeFirst()
        const total = Number(countResult?.count) || 0

        const rows = await this.#db
            .selectFrom(name)
            .selectAll()
            .orderBy('date', 'desc')
            .offset(offset)
            .limit(limit)
            .execute()

        const records = rows.map(row => mapToDataRecord(row, this.#dataResolver))
        return { records, total }
    }

    async updateAssetMetadata(
        tableName: string,
        id: number,
        data: Partial<{ description: string; source: string; is_public: boolean }>
    ): Promise<DataRecord> {
        this.#validateTableName(tableName)

        const updateData: Record<string, unknown> = {}
        if (data.description !== undefined) updateData.description = data.description
        if (data.source !== undefined) updateData.source = data.source
        if (data.is_public !== undefined) updateData.is_public = data.is_public

        if (Object.keys(updateData).length === 0) {
            const existing = await this.getById(String(id), tableName)
            if (!existing) throw new Error(`Record with ID ${id} not found in table ${tableName}`)
            return existing
        }

        const result = await this.#db
            .updateTable(tableName)
            .set(this.#sanitizeValues(updateData))
            .where('id', '=', id)
            .executeTakeFirst()

        if (BigInt(result.numUpdatedRows) === 0n) {
            throw new Error(`Record with ID ${id} not found in table ${tableName}`)
        }

        const updated = await this.getById(String(id), tableName)
        if (!updated) throw new Error(`Failed to retrieve updated record ${id} from table ${tableName}`)
        return updated
    }

    // ========== Custom table operations ==========

    async findByConditions(tableName: string, conditions: Record<string, any>): Promise<DataRecord[]> {
        this.#validateTableName(tableName)
        let query = this.#db.selectFrom(tableName).selectAll()

        for (const [column, value] of Object.entries(conditions)) {
            if (value === null) {
                query = query.where(column, 'is', null)
            } else if (value === undefined) {
                continue
            } else {
                const bound = this.#dialect === 'sqlite' && typeof value === 'boolean' ? (value ? 1 : 0) : value
                query = query.where(column, '=', bound)
            }
        }

        const hasDateColumn = await this.#columnExists(tableName, 'date')
        const sortColumn = hasDateColumn ? 'date' : 'created_at'

        const rows = await query.orderBy(sortColumn, 'desc').execute()
        return rows.map(row => mapToDataRecord(row, this.#dataResolver))
    }

    async updateById(tableName: string, id: number, data: Record<string, any>): Promise<void> {
        this.#validateTableName(tableName)

        const updateData: Record<string, any> = {
            ...data,
            updated_at: new Date()
        }

        delete updateData.id
        delete updateData.created_at
        delete updateData.date

        if ('file_index' in updateData && updateData.file_index) {
            updateData.file_index =
                typeof updateData.file_index === 'string'
                    ? updateData.file_index
                    : JSON.stringify(updateData.file_index)
        }

        const result = await this.#db.updateTable(tableName).set(this.#sanitizeValues(updateData)).where('id', '=', id).executeTakeFirst()

        if (BigInt(result.numUpdatedRows) === 0n) {
            throw new Error(`No record found with ID ${id} in table ${tableName}`)
        }
    }

    async findCustomTableRecords(tableName: string, conditions: Record<string, any> = {}): Promise<any[]> {
        this.#validateTableName(tableName)
        let query = this.#db.selectFrom(tableName).selectAll()

        for (const [column, value] of Object.entries(conditions)) {
            if (value === null) {
                query = query.where(column, 'is', null)
            } else if (value === undefined) {
                continue
            } else {
                const bound = this.#dialect === 'sqlite' && typeof value === 'boolean' ? (value ? 1 : 0) : value
                query = query.where(column, '=', bound)
            }
        }

        return query.orderBy('created_at', 'desc').execute()
    }

    async getCustomTableRecordById(tableName: string, id: number): Promise<any | null> {
        this.#validateTableName(tableName)
        const row = await this.#db.selectFrom(tableName).selectAll().where('id', '=', id).executeTakeFirst()
        return row || null
    }

    async insertCustomTableRecord(tableName: string, data: Record<string, any>): Promise<number> {
        this.#validateTableName(tableName)
        const now = new Date()
        const insertData = this.#sanitizeValues({ ...data, created_at: now, updated_at: now })

        const result = await this.#db.insertInto(tableName).values(insertData).returning('id').executeTakeFirstOrThrow()
        return (result as any).id
    }

    async ensureColumns(tableName: string, columns: Record<string, string>): Promise<void> {
        this.#validateTableName(tableName)
        const tables = await this.#db.introspection.getTables()
        const table = tables.find(t => t.name === tableName)
        if (!table) return

        const existingCols = new Set(table.columns.map(c => c.name))

        for (const [colName, colDef] of Object.entries(columns)) {
            if (existingCols.has(colName)) continue

            const lower = colDef.toLowerCase()
            const isNotNull = lower.includes('not null')

            let dataType: string
            if (lower.includes('text')) dataType = 'text'
            else if (lower.includes('integer')) dataType = 'integer'
            else if (lower.includes('boolean')) dataType = 'boolean'
            else if (lower.includes('timestamp') || lower.includes('datetime')) dataType = 'datetime'
            else if (lower.includes('real') || lower.includes('decimal') || lower.includes('float')) dataType = 'real'
            else {
                const varchMatch = lower.match(/varchar\((\d+)\)/)
                dataType = varchMatch ? `varchar(${varchMatch[1]})` : 'text'
            }

            // For NOT NULL on existing tables we must supply a default — SQLite
            // requires it because existing rows can't retroactively have a value.
            const implicitDefault = (dataType === 'integer' || dataType === 'boolean') ? 0 : ''

            await this.#db.schema
                .alterTable(tableName)
                .addColumn(colName, dataType as any, col => {
                    if (isNotNull) col = col.notNull().defaultTo(implicitDefault)
                    return col
                })
                .execute()
        }
    }

    async close(): Promise<void> {
        await this.#db.destroy()
    }

    getUserRepository(): UserRepository {
        return new KyselyUserRepository(this.#db)
    }

    /** Expose the Kysely instance for advanced operations or testing */
    getKysely(): Kysely<DynamicDatabase> {
        return this.#db
    }
}
