// Database adapter base class
export { DatabaseAdapter } from './database_adapter.js'
export type { MetadataRow } from './database_adapter.js'

// Knex implementation
export { KnexDatabaseAdapter } from './adapters/knex_database_adapter.js'
export type { PostgreSQLConfig, SQLiteConfig } from './adapters/knex_database_adapter.js'

// User repository
export { KnexUserRepository } from './knex_user_repository.js'

// Data record mapping utility
export { mapToDataRecord } from './map_to_data_record.js'
