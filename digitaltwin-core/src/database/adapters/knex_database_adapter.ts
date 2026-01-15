import type { Knex } from 'knex'
import knex from 'knex'
import type { MetadataRow } from '../database_adapter.js'
import { DatabaseAdapter } from '../database_adapter.js'
import type { DataRecord } from '../../types/data_record.js'
import type { StorageService } from '../../storage/storage_service.js'
import { mapToDataRecord } from '../../utils/map_to_data_record.js'

export interface PostgreSQLConfig {
    host: string
    port?: number
    user: string
    password: string
    database: string
    ssl?: boolean
}

export interface SQLiteConfig {
    filename: string
    client?: 'sqlite3' | 'better-sqlite3'
    enableForeignKeys?: boolean
    busyTimeout?: number
}

/**
 * Knex-based implementation with extended querying capabilities.
 */
export class KnexDatabaseAdapter extends DatabaseAdapter {
    #knex: Knex
    #storage: StorageService

    constructor(config: Knex.Config, storage: StorageService) {
        super()
        this.#knex = knex(config)
        this.#storage = storage
    }

    /**
     * Create a KnexDatabaseAdapter for PostgreSQL with simplified configuration
     */
    static forPostgreSQL(
        pgConfig: PostgreSQLConfig,
        storage: StorageService,
        _tableName: string = 'data_index'
    ): KnexDatabaseAdapter {
        const knexConfig: Knex.Config = {
            client: 'pg',
            connection: {
                host: pgConfig.host,
                port: pgConfig.port || 5432,
                user: pgConfig.user,
                password: pgConfig.password,
                database: pgConfig.database,
                ssl: pgConfig.ssl || false
            },
            pool: {
                min: 2,
                max: 15,
                acquireTimeoutMillis: 30000,
                createTimeoutMillis: 30000,
                destroyTimeoutMillis: 5000,
                idleTimeoutMillis: 30000,
                reapIntervalMillis: 1000
            }
        }

        return new KnexDatabaseAdapter(knexConfig, storage)
    }

    /**
     * Create a KnexDatabaseAdapter for SQLite with simplified configuration
     */
    static forSQLite(
        sqliteConfig: SQLiteConfig,
        storage: StorageService,
        _tableName: string = 'data_index'
    ): KnexDatabaseAdapter {
        const client = sqliteConfig.client || 'sqlite3'

        const knexConfig: Knex.Config = {
            client,
            connection: {
                filename: sqliteConfig.filename
            },
            pool: {
                min: 1,
                max: 5,
                acquireTimeoutMillis: sqliteConfig.busyTimeout || 30000,
                afterCreate: (conn: any, cb: any) => {
                    if (sqliteConfig.enableForeignKeys !== false) {
                        // Both sqlite3 and better-sqlite3 support PRAGMA
                        if (client === 'better-sqlite3') {
                            conn.pragma('foreign_keys = ON')
                            conn.pragma('journal_mode = WAL')
                            conn.pragma('synchronous = NORMAL')
                            conn.pragma('cache_size = 10000')
                            cb()
                        } else {
                            conn.run('PRAGMA foreign_keys = ON', () => {
                                conn.run('PRAGMA journal_mode = WAL', () => {
                                    conn.run('PRAGMA synchronous = NORMAL', () => {
                                        conn.run('PRAGMA cache_size = 10000', cb)
                                    })
                                })
                            })
                        }
                    } else {
                        cb()
                    }
                }
            },
            useNullAsDefault: true
        }

        return new KnexDatabaseAdapter(knexConfig, storage)
    }

    // ========== Basic methods ==========

    /**
     * Validates that a table name is safe for SQL operations.
     * Prevents SQL injection via table names.
     * @param name - The table name to validate
     * @throws Error if the table name is invalid
     */
    #validateTableName(name: string): void {
        // Must start with letter or underscore, followed by alphanumeric or underscores
        if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
            throw new Error(
                `Invalid table name: "${name}". Must start with a letter or underscore and contain only alphanumeric characters and underscores.`
            )
        }

        // PostgreSQL max identifier length is 63, SQLite has no practical limit
        if (name.length > 63) {
            throw new Error(`Table name too long: "${name}". Maximum 63 characters allowed.`)
        }
    }

    async save(meta: MetadataRow): Promise<DataRecord> {
        this.#validateTableName(meta.name)
        const insertData: any = {
            id: meta.id,
            name: meta.name,
            type: meta.type,
            url: meta.url,
            date: meta.date.toISOString()
        }

        // Add asset-specific fields if present (for AssetMetadataRow)
        if ('description' in meta) insertData.description = meta.description
        if ('source' in meta) insertData.source = meta.source
        if ('owner_id' in meta) insertData.owner_id = meta.owner_id
        if ('filename' in meta) insertData.filename = meta.filename
        if ('is_public' in meta) insertData.is_public = meta.is_public

        // TilesetManager support (public URL)
        if ('tileset_url' in meta) insertData.tileset_url = meta.tileset_url

        // Async upload support
        if ('upload_status' in meta) insertData.upload_status = meta.upload_status
        if ('upload_error' in meta) insertData.upload_error = meta.upload_error
        if ('upload_job_id' in meta) insertData.upload_job_id = meta.upload_job_id

        // Insert and get the auto-generated ID
        const [insertedId] = await this.#knex(meta.name).insert(insertData).returning('id')

        // Handle different return formats (PostgreSQL returns object, SQLite returns number)
        const newId = typeof insertedId === 'object' ? insertedId.id : insertedId

        // Return record with the generated ID
        return mapToDataRecord({ ...meta, id: newId }, this.#storage)
    }

    async delete(id: string, name: string): Promise<void> {
        this.#validateTableName(name)
        await this.#knex(name).where({ id }).delete()
    }

    async getById(id: string, name: string): Promise<DataRecord | undefined> {
        this.#validateTableName(name)
        const row = await this.#knex(name).where({ id }).first()
        return row ? mapToDataRecord(row, this.#storage) : undefined
    }

    async getLatestByName(name: string): Promise<DataRecord | undefined> {
        this.#validateTableName(name)
        const row = await this.#knex(name).select('*').orderBy('date', 'desc').limit(1).first()
        return row ? mapToDataRecord(row, this.#storage) : undefined
    }

    async doesTableExists(name: string): Promise<boolean> {
        this.#validateTableName(name)
        return this.#knex.schema.hasTable(name)
    }

    async createTable(name: string): Promise<void> {
        this.#validateTableName(name)
        const tableExists = await this.#knex.schema.hasTable(name)

        if (!tableExists) {
            await this.#knex.schema.createTable(name, table => {
                table.increments('id').primary()
                table.string('name').notNullable()
                table.string('type').notNullable()
                table.string('url').notNullable()
                table.datetime('date').notNullable()

                // Asset-specific fields (optional, for AssetsManager components)
                table.text('description').nullable()
                table.string('source').nullable()
                table.integer('owner_id').unsigned().nullable()
                table.string('filename').nullable()
                table.boolean('is_public').defaultTo(true).notNullable()

                // TilesetManager support (public URL for Cesium)
                table.text('tileset_url').nullable()

                // Async upload support (for large file processing)
                table.string('upload_status', 20).nullable() // pending, processing, completed, failed
                table.text('upload_error').nullable()
                table.string('upload_job_id', 100).nullable() // BullMQ job ID for status tracking

                // Foreign key constraint to users table (if it exists)
                // Note: This will only work if users table exists first
                try {
                    table.foreign('owner_id').references('id').inTable('users').onDelete('SET NULL')
                } catch {
                    // Ignore foreign key creation if users table doesn't exist yet
                    // This allows backward compatibility for non-authenticated assets
                }

                // Optimized indexes for most frequent queries
                table.index('name', `${name}_idx_name`)
                table.index('date', `${name}_idx_date`)
                table.index(['name', 'date'], `${name}_idx_name_date`)
                table.index(['date', 'name'], `${name}_idx_date_name`) // For date range queries
                table.index('owner_id', `${name}_idx_owner_id`) // For asset filtering and foreign key
                table.index('is_public', `${name}_idx_is_public`) // For visibility filtering
            })
        }
    }

    async createTableWithColumns(name: string, columns: Record<string, string>): Promise<void> {
        this.#validateTableName(name)
        const tableExists = await this.#knex.schema.hasTable(name)

        if (!tableExists) {
            await this.#knex.schema.createTable(name, table => {
                // Standard columns for CustomTableManager
                table.increments('id').primary()
                table.datetime('created_at').defaultTo(this.#knex.fn.now()).notNullable()
                table.datetime('updated_at').defaultTo(this.#knex.fn.now()).notNullable()

                // Custom columns from StoreConfiguration
                for (const [columnName, columnType] of Object.entries(columns)) {
                    // Parse SQL type and apply it to the table
                    this.#addColumnToTable(table, columnName, columnType)
                }

                // Indexes for performance
                table.index('created_at', `${name}_idx_created_at`)
                table.index('updated_at', `${name}_idx_updated_at`)
            })
        }
    }

    /**
     * Helper method to add a column to a Knex table based on SQL type string
     * @private
     */
    #addColumnToTable(table: any, columnName: string, sqlType: string): void {
        const lowerType = sqlType.toLowerCase()

        if (lowerType.includes('text')) {
            const col = table.text(columnName)
            if (lowerType.includes('not null')) col.notNullable()
            else col.nullable()
        } else if (lowerType.includes('integer')) {
            const col = table.integer(columnName)
            if (lowerType.includes('not null')) col.notNullable()
            else col.nullable()
        } else if (lowerType.includes('boolean')) {
            const col = table.boolean(columnName)
            if (lowerType.includes('not null')) col.notNullable()
            else col.nullable()
            if (lowerType.includes('default true')) col.defaultTo(true)
            else if (lowerType.includes('default false')) col.defaultTo(false)
        } else if (lowerType.includes('timestamp') || lowerType.includes('datetime')) {
            const col = table.datetime(columnName)
            if (lowerType.includes('not null')) col.notNullable()
            else col.nullable()
            if (lowerType.includes('default current_timestamp')) col.defaultTo(this.#knex.fn.now())
        } else if (lowerType.includes('real') || lowerType.includes('decimal') || lowerType.includes('float')) {
            const col = table.decimal(columnName)
            if (lowerType.includes('not null')) col.notNullable()
            else col.nullable()
        } else if (lowerType.includes('varchar')) {
            // Extract length from varchar(255)
            const match = lowerType.match(/varchar\((\d+)\)/)
            const length = match ? parseInt(match[1]) : 255
            const col = table.string(columnName, length)
            if (lowerType.includes('not null')) col.notNullable()
            else col.nullable()
        } else {
            // Default to string for unknown types
            const col = table.string(columnName)
            if (lowerType.includes('not null')) col.notNullable()
            else col.nullable()
        }
    }

    /**
     * Migrate existing table schema to match expected schema.
     *
     * Automatically adds missing columns and indexes for asset tables.
     * Only performs safe operations (adding columns with defaults or nullable).
     *
     * @param {string} name - Table name to migrate
     * @returns {Promise<string[]>} Array of migration messages describing what was done
     */
    async migrateTableSchema(name: string): Promise<string[]> {
        this.#validateTableName(name)
        const tableExists = await this.#knex.schema.hasTable(name)
        if (!tableExists) {
            return [] // Table doesn't exist, nothing to migrate
        }

        const migrations: string[] = []

        // Define expected columns for asset tables (those created by createTable)
        const expectedColumns = {
            is_public: {
                exists: await this.#knex.schema.hasColumn(name, 'is_public'),
                add: async () => {
                    await this.#knex.schema.alterTable(name, table => {
                        table.boolean('is_public').defaultTo(true).notNullable()
                    })
                    migrations.push(`Added column 'is_public' (BOOLEAN DEFAULT true NOT NULL)`)
                }
            },
            tileset_url: {
                exists: await this.#knex.schema.hasColumn(name, 'tileset_url'),
                add: async () => {
                    await this.#knex.schema.alterTable(name, table => {
                        table.text('tileset_url').nullable()
                    })
                    migrations.push(`Added column 'tileset_url' (TEXT nullable)`)
                }
            },
            upload_status: {
                exists: await this.#knex.schema.hasColumn(name, 'upload_status'),
                add: async () => {
                    await this.#knex.schema.alterTable(name, table => {
                        table.string('upload_status', 20).nullable().defaultTo(null)
                    })
                    migrations.push(`Added column 'upload_status' (VARCHAR(20) nullable)`)
                }
            },
            upload_error: {
                exists: await this.#knex.schema.hasColumn(name, 'upload_error'),
                add: async () => {
                    await this.#knex.schema.alterTable(name, table => {
                        table.text('upload_error').nullable()
                    })
                    migrations.push(`Added column 'upload_error' (TEXT nullable)`)
                }
            },
            upload_job_id: {
                exists: await this.#knex.schema.hasColumn(name, 'upload_job_id'),
                add: async () => {
                    await this.#knex.schema.alterTable(name, table => {
                        table.string('upload_job_id', 100).nullable()
                    })
                    migrations.push(`Added column 'upload_job_id' (VARCHAR(100) nullable)`)
                }
            },
            created_at: {
                exists: await this.#knex.schema.hasColumn(name, 'created_at'),
                add: async () => {
                    await this.#knex.schema.alterTable(name, table => {
                        table.datetime('created_at').defaultTo(this.#knex.fn.now()).nullable()
                    })
                    migrations.push(`Added column 'created_at' (DATETIME nullable)`)
                }
            },
            updated_at: {
                exists: await this.#knex.schema.hasColumn(name, 'updated_at'),
                add: async () => {
                    await this.#knex.schema.alterTable(name, table => {
                        table.datetime('updated_at').defaultTo(this.#knex.fn.now()).nullable()
                    })
                    migrations.push(`Added column 'updated_at' (DATETIME nullable)`)
                }
            }
        }

        // Expected indexes
        const expectedIndexes = {
            [`${name}_idx_is_public`]: {
                exists: await this.#hasIndex(name, `${name}_idx_is_public`),
                add: async () => {
                    await this.#knex.schema.alterTable(name, table => {
                        table.index('is_public', `${name}_idx_is_public`)
                    })
                    migrations.push(`Added index '${name}_idx_is_public'`)
                }
            }
        }

        // Add missing columns
        for (const [_columnName, config] of Object.entries(expectedColumns)) {
            if (!config.exists) {
                await config.add()
            }
        }

        // Add missing indexes
        for (const [_indexName, config] of Object.entries(expectedIndexes)) {
            if (!config.exists) {
                await config.add()
            }
        }

        return migrations
    }

    /**
     * Check if an index exists on a table
     * @private
     */
    async #hasIndex(tableName: string, indexName: string): Promise<boolean> {
        try {
            // PostgreSQL
            if (this.#knex.client.config.client === 'pg') {
                const result = await this.#knex.raw(`SELECT 1 FROM pg_indexes WHERE tablename = ? AND indexname = ?`, [
                    tableName,
                    indexName
                ])
                return result.rows.length > 0
            }

            // SQLite - query sqlite_master
            if (this.#knex.client.config.client === 'sqlite3' || this.#knex.client.config.client === 'better-sqlite3') {
                const result = await this.#knex.raw(`SELECT name FROM sqlite_master WHERE type='index' AND name=?`, [
                    indexName
                ])
                return result.length > 0
            }

            // Unknown database, assume index doesn't exist
            return false
        } catch {
            // If query fails, assume index doesn't exist
            return false
        }
    }

    // ========== Extended methods ==========

    async getFirstByName(name: string): Promise<DataRecord | undefined> {
        this.#validateTableName(name)
        const row = await this.#knex(name).orderBy('date', 'asc').first()
        return row ? mapToDataRecord(row, this.#storage) : undefined
    }

    async getByDateRange(name: string, startDate: Date, endDate?: Date, limit?: number): Promise<DataRecord[]> {
        this.#validateTableName(name)
        let query = this.#knex(name).select('*').where('date', '>=', startDate.toISOString())

        if (endDate) {
            query = query.where('date', '<', endDate.toISOString())
        }

        query = query.orderBy('date', 'asc')

        if (limit) {
            query = query.limit(limit)
        }

        const rows = await query
        return rows.map(row => mapToDataRecord(row, this.#storage))
    }

    async getAfterDate(name: string, afterDate: Date, limit?: number): Promise<DataRecord[]> {
        this.#validateTableName(name)
        let query = this.#knex(name).where('date', '>', afterDate.toISOString()).orderBy('date', 'asc')

        if (limit) {
            query = query.limit(limit)
        }

        const rows = await query
        return rows.map(row => mapToDataRecord(row, this.#storage))
    }

    async getLatestBefore(name: string, beforeDate: Date): Promise<DataRecord | undefined> {
        this.#validateTableName(name)
        const row = await this.#knex(name).where('date', '<', beforeDate.toISOString()).orderBy('date', 'desc').first()
        return row ? mapToDataRecord(row, this.#storage) : undefined
    }

    async getLatestRecordsBefore(name: string, beforeDate: Date, limit: number): Promise<DataRecord[]> {
        this.#validateTableName(name)
        const rows = await this.#knex(name)
            .where('date', '<', beforeDate.toISOString())
            .orderBy('date', 'desc')
            .limit(limit)

        return rows.map(row => mapToDataRecord(row, this.#storage))
    }

    async hasRecordsAfterDate(name: string, afterDate: Date): Promise<boolean> {
        this.#validateTableName(name)
        const result = await this.#knex(name)
            .where('date', '>', afterDate.toISOString())
            .select(this.#knex.raw('1'))
            .limit(1)
            .first()

        return !!result
    }

    async countByDateRange(name: string, startDate: Date, endDate?: Date): Promise<number> {
        this.#validateTableName(name)
        let query = this.#knex(name).where('date', '>=', startDate.toISOString())

        if (endDate) {
            query = query.where('date', '<', endDate.toISOString())
        }

        const result = await query.count('* as count').first()
        return Number(result?.count) || 0
    }

    // ========== Batch operations for performance ==========

    async saveBatch(metadataList: MetadataRow[]): Promise<DataRecord[]> {
        if (metadataList.length === 0) return []

        // Validate all table names upfront
        for (const meta of metadataList) {
            this.#validateTableName(meta.name)
        }

        // Group by table name for efficient batch inserts
        const groupedByTable = new Map<string, MetadataRow[]>()

        for (const meta of metadataList) {
            const group = groupedByTable.get(meta.name)
            if (group) {
                group.push(meta)
            } else {
                groupedByTable.set(meta.name, [meta])
            }
        }

        // Use transaction for atomicity - all or nothing
        return this.#knex.transaction(async trx => {
            const results: DataRecord[] = []

            for (const [tableName, metas] of groupedByTable) {
                const insertData = metas.map(meta => {
                    const data: any = {
                        name: meta.name,
                        type: meta.type,
                        url: meta.url,
                        date: meta.date.toISOString()
                    }

                    // Only include ID if it's explicitly set (for updates)
                    if (meta.id !== undefined) {
                        data.id = meta.id
                    }

                    // Add asset-specific fields if present
                    if ('description' in meta) data.description = meta.description
                    if ('source' in meta) data.source = meta.source
                    if ('owner_id' in meta) data.owner_id = meta.owner_id
                    if ('filename' in meta) data.filename = meta.filename

                    return data
                })

                await trx(tableName).insert(insertData)

                // Convert to DataRecords
                for (const meta of metas) {
                    results.push(mapToDataRecord(meta, this.#storage))
                }
            }

            return results
        })
    }

    async deleteBatch(deleteRequests: Array<{ id: string; name: string }>): Promise<void> {
        if (deleteRequests.length === 0) return

        // Validate all table names upfront
        for (const req of deleteRequests) {
            this.#validateTableName(req.name)
        }

        // Group by table name for efficient batch deletes
        const groupedByTable = new Map<string, string[]>()

        for (const req of deleteRequests) {
            const group = groupedByTable.get(req.name)
            if (group) {
                group.push(req.id)
            } else {
                groupedByTable.set(req.name, [req.id])
            }
        }

        // Use transaction for atomicity - all or nothing
        await this.#knex.transaction(async trx => {
            for (const [tableName, ids] of groupedByTable) {
                await trx(tableName).whereIn('id', ids).delete()
            }
        })
    }

    async getByIdsBatch(requests: Array<{ id: string; name: string }>): Promise<DataRecord[]> {
        if (requests.length === 0) return []

        // Validate all table names upfront
        for (const req of requests) {
            this.#validateTableName(req.name)
        }

        const results: DataRecord[] = []

        // Group by table name for efficient queries
        const groupedByTable = new Map<string, string[]>()

        for (const req of requests) {
            const group = groupedByTable.get(req.name)
            if (group) {
                group.push(req.id)
            } else {
                groupedByTable.set(req.name, [req.id])
            }
        }

        // Query each table
        for (const [tableName, ids] of groupedByTable) {
            const rows = await this.#knex(tableName).whereIn('id', ids)
            for (const row of rows) {
                results.push(mapToDataRecord(row, this.#storage))
            }
        }

        return results
    }

    // ========== Optimized query for assets manager ==========

    async getAllAssetsPaginated(
        name: string,
        offset: number = 0,
        limit: number = 100
    ): Promise<{
        records: DataRecord[]
        total: number
    }> {
        this.#validateTableName(name)
        // Get total count efficiently
        const countResult = await this.#knex(name).count('* as count').first()
        const total = Number(countResult?.count) || 0

        // Get paginated results
        const rows = await this.#knex(name).select('*').orderBy('date', 'desc').offset(offset).limit(limit)

        const records = rows.map(row => mapToDataRecord(row, this.#storage))

        return { records, total }
    }

    async updateAssetMetadata(
        tableName: string,
        id: number,
        data: Partial<{ description: string; source: string; is_public: boolean }>
    ): Promise<DataRecord> {
        this.#validateTableName(tableName)

        const updateData: Record<string, unknown> = {}

        // Only update fields that are explicitly provided
        if (data.description !== undefined) updateData.description = data.description
        if (data.source !== undefined) updateData.source = data.source
        if (data.is_public !== undefined) updateData.is_public = data.is_public

        if (Object.keys(updateData).length === 0) {
            // Nothing to update, just return the existing record
            const existing = await this.getById(String(id), tableName)
            if (!existing) {
                throw new Error(`Record with ID ${id} not found in table ${tableName}`)
            }
            return existing
        }

        const rowsAffected = await this.#knex(tableName).where('id', id).update(updateData)

        if (rowsAffected === 0) {
            throw new Error(`Record with ID ${id} not found in table ${tableName}`)
        }

        // Return the updated record
        const updated = await this.getById(String(id), tableName)
        if (!updated) {
            throw new Error(`Failed to retrieve updated record ${id} from table ${tableName}`)
        }

        return updated
    }

    // ========== Methods for CustomTableManager ==========

    async findByConditions(tableName: string, conditions: Record<string, any>): Promise<DataRecord[]> {
        this.#validateTableName(tableName)
        let query = this.#knex(tableName).select('*')

        // Apply each condition
        for (const [column, value] of Object.entries(conditions)) {
            if (value === null) {
                query = query.whereNull(column)
            } else if (value === undefined) {
                // Skip undefined values
                continue
            } else {
                query = query.where(column, value)
            }
        }

        // Check if table has 'date' column, otherwise use 'created_at'
        const hasDateColumn = await this.#knex.schema.hasColumn(tableName, 'date')
        const sortColumn = hasDateColumn ? 'date' : 'created_at'

        const rows = await query.orderBy(sortColumn, 'desc')
        return rows.map(row => mapToDataRecord(row, this.#storage))
    }

    async updateById(tableName: string, id: number, data: Record<string, any>): Promise<void> {
        this.#validateTableName(tableName)
        // Create a clean update object with updated_at timestamp
        const updateData: Record<string, any> = {
            ...data,
            updated_at: new Date()
        }

        // Remove system fields that shouldn't be updated
        delete updateData.id
        delete updateData.created_at
        delete updateData.date

        // Serialize file_index to JSON string if present (stored as TEXT in DB)
        if ('file_index' in updateData && updateData.file_index) {
            updateData.file_index =
                typeof updateData.file_index === 'string'
                    ? updateData.file_index
                    : JSON.stringify(updateData.file_index)
        }

        const rowsAffected = await this.#knex(tableName).where({ id }).update(updateData)

        if (rowsAffected === 0) {
            throw new Error(`No record found with ID ${id} in table ${tableName}`)
        }
    }

    async close(): Promise<void> {
        await this.#knex.destroy()
    }

    /**
     * Find records for custom tables (returns raw database rows, not DataRecords)
     * This bypasses mapToDataRecord() which assumes standard table structure
     */
    async findCustomTableRecords(tableName: string, conditions: Record<string, any> = {}): Promise<any[]> {
        this.#validateTableName(tableName)
        let query = this.#knex(tableName).select('*')

        // Apply each condition
        for (const [column, value] of Object.entries(conditions)) {
            if (value === null) {
                query = query.whereNull(column)
            } else if (value === undefined) {
                // Skip undefined values
                continue
            } else {
                query = query.where(column, value)
            }
        }

        // Always sort by created_at for custom tables
        const rows = await query.orderBy('created_at', 'desc')
        return rows
    }

    /**
     * Get a single custom table record by ID (returns raw database row, not DataRecord)
     */
    async getCustomTableRecordById(tableName: string, id: number): Promise<any | null> {
        this.#validateTableName(tableName)
        const row = await this.#knex(tableName).where({ id }).first()
        return row || null
    }

    /**
     * Insert a record into a custom table (returns the new record ID)
     */
    async insertCustomTableRecord(tableName: string, data: Record<string, any>): Promise<number> {
        this.#validateTableName(tableName)
        const now = new Date()
        const insertData = {
            ...data,
            created_at: now,
            updated_at: now
        }

        const result = await this.#knex(tableName).insert(insertData).returning('id')
        const insertedId = result[0]
        return typeof insertedId === 'object' ? (insertedId as { id: number }).id : insertedId
    }

    /**
     * Get the underlying Knex instance for advanced operations
     */
    getKnex(): Knex {
        return this.#knex
    }
}
