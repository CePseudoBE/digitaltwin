/**
 * @fileoverview Component initialization utilities for the digital twin engine
 *
 * This module handles the setup and initialization of digital twin components,
 * including database table creation and dependency injection.
 */

import type { Collector } from '../components/collector.js'
import type { Harvester } from '../components/harvester.js'
import type { AssetsManager } from '../components/assets_manager.js'
import type { DatabaseAdapter } from '../database/database_adapter.js'
import type { StorageService } from '../storage/storage_service.js'

/**
 * Initializes data collection and processing components with required dependencies.
 *
 * This function sets up collectors and harvesters by:
 * 1. Creating necessary database tables for each component
 * 2. Running automatic schema migrations if enabled
 * 3. Injecting database and storage service dependencies
 *
 * @param components - Array of collectors and harvesters to initialize
 * @param database - Database adapter instance for data storage
 * @param storage - Storage service instance for file operations
 * @param autoMigration - Enable automatic schema migration (default: true)
 *
 * @throws {Error} When database table creation fails
 *
 * @example
 * ```typescript
 * const components = [weatherCollector, trafficHarvester];
 * const database = new KnexDatabaseAdapter(config);
 * const storage = new LocalStorageService();
 *
 * await initializeComponents(components, database, storage, true);
 * // Components are now ready to process data
 * ```
 */
export async function initializeComponents(
    components: Array<Collector | Harvester>,
    database: DatabaseAdapter,
    storage: StorageService,
    autoMigration: boolean = true
): Promise<void> {
    // Create all tables in parallel for faster startup
    await Promise.all(components.map(comp => ensureTableExists(database, comp.getConfiguration().name, autoMigration)))

    // Inject dependencies (synchronous, fast)
    for (const comp of components) {
        comp.setDependencies(database, storage)
    }
}

/**
 * Initializes asset management components with required dependencies.
 *
 * Asset managers handle file-based resources (like 3D models, tilesets, maps)
 * and require both database access for metadata and storage for file operations.
 *
 * @param assetsManagers - Array of asset managers to initialize
 * @param database - Database adapter instance for metadata storage
 * @param storage - Storage service instance for asset file operations
 * @param autoMigration - Enable automatic schema migration (default: true)
 *
 * @throws {Error} When database table creation fails
 *
 * @example
 * ```typescript
 * const managers = [tilesetManager, pointCloudManager];
 * const database = new KnexDatabaseAdapter(config);
 * const storage = new OvhS3StorageService(credentials);
 *
 * await initializeAssetsManagers(managers, database, storage, true);
 * // Asset managers are now ready to handle file operations
 * ```
 */
export async function initializeAssetsManagers(
    assetsManagers: AssetsManager[],
    database: DatabaseAdapter,
    storage: StorageService,
    autoMigration: boolean = true
): Promise<void> {
    // Create all tables in parallel for faster startup
    await Promise.all(
        assetsManagers.map(manager => ensureTableExists(database, manager.getConfiguration().name, autoMigration))
    )

    // Inject dependencies (synchronous, fast)
    for (const manager of assetsManagers) {
        manager.setDependencies(database, storage)
    }
}

/**
 * Ensures a database table exists for the specified component.
 *
 * Checks if a table exists in the database and creates it if missing.
 * If autoMigration is enabled and table exists, runs schema migration.
 * This function is called during component initialization to ensure
 * each component has its required storage table available.
 *
 * @param database - Database adapter to check/create table with
 * @param tableName - Name of the table to ensure exists
 * @param autoMigration - Enable automatic schema migration for existing tables
 *
 * @throws {Error} When table creation or migration fails
 *
 * @example
 * ```typescript
 * // Internal usage during component initialization
 * await ensureTableExists(database, 'weather_data_collector', true);
 * // Table now exists and schema is up-to-date
 * ```
 *
 * @internal This function is used internally by initialization functions
 */
async function ensureTableExists(
    database: DatabaseAdapter,
    tableName: string,
    autoMigration: boolean = true
): Promise<void> {
    const exists = await database.doesTableExists(tableName)
    if (!exists) {
        await database.createTable(tableName)
        if (process.env.NODE_ENV !== 'test') {
            console.log(`[DigitalTwin] Created table "${tableName}"`)
        }
    } else if (autoMigration) {
        // Table exists, run migration to add missing columns/indexes
        const migrations = await database.migrateTableSchema(tableName)
        if (migrations.length > 0 && process.env.NODE_ENV !== 'test') {
            console.log(`[DigitalTwin] Migrated "${tableName}": ${migrations.join(', ')}`)
        }
    }
}
