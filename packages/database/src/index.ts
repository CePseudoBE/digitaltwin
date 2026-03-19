// Database adapter base class
export { DatabaseAdapter } from './database_adapter.js'
export type { MetadataRow } from './database_adapter.js'

// Knex implementation (legacy)
export { KnexDatabaseAdapter } from './adapters/knex_database_adapter.js'
export type { PostgreSQLConfig, SQLiteConfig } from './adapters/knex_database_adapter.js'
export { KnexUserRepository } from './knex_user_repository.js'

// Kysely implementation
export { KyselyDatabaseAdapter } from './adapters/kysely_database_adapter.js'
export type { KyselyPostgreSQLConfig, KyselySQLiteConfig } from './adapters/kysely_database_adapter.js'
export { KyselyUserRepository } from './kysely_user_repository.js'

// Data record mapping utility
export { mapToDataRecord } from './map_to_data_record.js'
