/**
 * @fileoverview Database abstraction layer for digital twin data persistence
 *
 * This module defines the abstract DatabaseAdapter interface that provides
 * unified database operations across different database backends (SQLite, PostgreSQL).
 * Implementations handle component data storage, metadata management, and querying.
 */

import type { DataRecord, MetadataRow } from '@digitaltwin/shared'

// Re-export MetadataRow for backward compatibility
export type { MetadataRow } from '@digitaltwin/shared'

/**
 * Abstract database adapter providing unified data operations for all components.
 *
 * DatabaseAdapter defines the contract for database operations used throughout the
 * digital twin system. Implementations provide concrete database access using specific
 * backends (SQLite, PostgreSQL) while maintaining a consistent API.
 *
 * The adapter handles:
 * - Table creation and schema migration for components
 * - CRUD operations for collected data and assets
 * - Time-based and count-based queries for harvesters
 * - Custom table operations for CustomTableManager components
 *
 * @abstract
 * @class DatabaseAdapter
 *
 * @example
 * ```typescript
 * // Using KnexDatabaseAdapter (concrete implementation)
 * const database = KnexDatabaseAdapter.forSQLite({
 *   filename: './data/digitaltwin.db'
 * }, storage)
 *
 * // Save collector data
 * await database.save({
 *   name: 'weather-collector',
 *   type: 'application/json',
 *   url: await storage.save(buffer, 'weather-collector'),
 *   date: new Date()
 * })
 *
 * // Query latest data
 * const latest = await database.getLatestByName('weather-collector')
 * const data = await latest?.data()
 * ```
 */
export abstract class DatabaseAdapter {
    // ========== Basic CRUD Methods ==========

    /**
     * Saves metadata and returns the created DataRecord.
     * @param meta - Metadata to save
     * @returns The created DataRecord with data() function for lazy loading
     */
    abstract save(meta: MetadataRow): Promise<DataRecord>

    /**
     * Deletes a record by ID from a specific component's table.
     * @param id - Record ID to delete
     * @param name - Component/table name
     */
    abstract delete(id: string, name: string): Promise<void>

    /**
     * Retrieves a specific record by ID from a component's table.
     * @param id - Record ID to retrieve
     * @param name - Component/table name
     * @returns The DataRecord or undefined if not found
     */
    abstract getById(id: string, name: string): Promise<DataRecord | undefined>

    /**
     * Gets the most recent record for a component.
     * @param name - Component/table name
     * @returns The latest DataRecord or undefined if table is empty
     */
    abstract getLatestByName(name: string): Promise<DataRecord | undefined>

    /**
     * Checks if a table exists in the database.
     * @param name - Table name to check
     * @returns true if table exists, false otherwise
     */
    abstract doesTableExists(name: string): Promise<boolean>

    /**
     * Creates a standard component table with default columns.
     * @param name - Table name to create
     */
    abstract createTable(name: string): Promise<void>

    /**
     * Create a table with custom columns for CustomTableManager components
     * @param name - Table name
     * @param columns - Column definitions (name -> SQL type)
     */
    abstract createTableWithColumns(name: string, columns: Record<string, string>): Promise<void>

    /**
     * Migrate existing table schema to add missing columns and indexes.
     *
     * Only performs safe operations like adding columns with defaults or nullable.
     * Returns an array of migration messages describing what was done.
     *
     * @param name - Table name to migrate
     * @returns Array of migration messages
     */
    abstract migrateTableSchema(name: string): Promise<string[]>

    // ========== Extended methods for Harvester ==========

    /**
     * Get the first (oldest) record for a given component name.
     * @param name - The component name
     * @returns The oldest DataRecord or undefined if none found
     */
    abstract getFirstByName(name: string): Promise<DataRecord | undefined>

    /**
     * Get records between two dates for a given component.
     * @param name - The component name
     * @param startDate - Start date (inclusive)
     * @param endDate - End date (exclusive), optional
     * @param limit - Maximum number of records to return, optional
     * @param order - Sort order by date ('asc' or 'desc'), default: 'asc'
     * @returns Array of DataRecords matching the criteria
     */
    abstract getByDateRange(
        name: string,
        startDate: Date,
        endDate?: Date,
        limit?: number,
        order?: 'asc' | 'desc'
    ): Promise<DataRecord[]>

    /**
     * Get records after a specific date for a given component.
     * @param name - The component name
     * @param afterDate - Date to search after (exclusive)
     * @param limit - Maximum number of records to return
     * @returns Array of DataRecords after the specified date
     */
    abstract getAfterDate(name: string, afterDate: Date, limit?: number): Promise<DataRecord[]>

    /**
     * Get the latest record before a specific date for a given component.
     * @param name - The component name
     * @param beforeDate - Date to search before (exclusive)
     * @returns The latest DataRecord before the date, or undefined if none found
     */
    abstract getLatestBefore(name: string, beforeDate: Date): Promise<DataRecord | undefined>

    /**
     * Get the latest N records before a specific date for a given component.
     * @param name - The component name
     * @param beforeDate - Date to search before (exclusive)
     * @param limit - Number of records to return
     * @returns Array of the latest DataRecords before the date
     */
    abstract getLatestRecordsBefore(name: string, beforeDate: Date, limit: number): Promise<DataRecord[]>

    /**
     * Check if any records exist after a specific date for a given component.
     * @param name - The component name
     * @param afterDate - Date to check after (exclusive)
     * @returns True if records exist after the date, false otherwise
     */
    abstract hasRecordsAfterDate(name: string, afterDate: Date): Promise<boolean>

    /**
     * Count records for a given component within a date range.
     * @param name - The component name
     * @param startDate - Start date (inclusive)
     * @param endDate - End date (exclusive), optional
     * @returns Number of records in the range
     */
    abstract countByDateRange(name: string, startDate: Date, endDate?: Date): Promise<number>

    // ========== Methods for AssetsManager ==========

    /**
     * Updates asset metadata fields directly without changing the record ID.
     * This is preferred over delete+insert for updating metadata.
     *
     * @param tableName - Component/table name
     * @param id - Record ID to update
     * @param data - Partial metadata to update (description, source, is_public)
     * @returns The updated DataRecord
     * @throws Error if record not found
     */
    abstract updateAssetMetadata(
        tableName: string,
        id: number,
        data: Partial<Pick<MetadataRow, 'description' | 'source' | 'is_public'>>
    ): Promise<DataRecord>

    // ========== Methods for CustomTableManager ==========

    /**
     * Find records by column conditions for CustomTableManager components.
     * @param tableName - Table name to query
     * @param conditions - Key-value pairs to match
     * @returns Array of matching records
     */
    abstract findByConditions(tableName: string, conditions: Record<string, any>): Promise<DataRecord[]>

    /**
     * Update a record by ID for CustomTableManager components.
     * @param tableName - Table name to update
     * @param id - Record ID to update
     * @param data - Data to update (excluding id, created_at, updated_at)
     * @returns Promise that resolves when update is complete
     */
    abstract updateById(tableName: string, id: number, data: Record<string, any>): Promise<void>

    /**
     * Find records for custom tables (returns raw database rows, not DataRecords)
     * This bypasses mapToDataRecord() which assumes standard table structure
     * @param tableName - Table name to query
     * @param conditions - Key-value pairs to match (empty for all records)
     * @returns Array of raw database rows
     */
    abstract findCustomTableRecords(tableName: string, conditions?: Record<string, any>): Promise<any[]>

    /**
     * Get a single custom table record by ID (returns raw database row, not DataRecord)
     * @param tableName - Table name to query
     * @param id - Record ID
     * @returns Raw database row or null if not found
     */
    abstract getCustomTableRecordById(tableName: string, id: number): Promise<any | null>

    /**
     * Insert a record into a custom table (returns the new record ID)
     * @param tableName - Table name to insert into
     * @param data - Data to insert (created_at/updated_at will be added automatically)
     * @returns The ID of the new record
     */
    abstract insertCustomTableRecord(tableName: string, data: Record<string, any>): Promise<number>

    /**
     * Closes all database connections gracefully.
     * This method should be called when shutting down the application
     * to ensure proper cleanup of connection pools.
     * @returns Promise that resolves when all connections are closed
     */
    abstract close(): Promise<void>
}
