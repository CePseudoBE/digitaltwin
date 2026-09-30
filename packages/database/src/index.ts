// Database adapter base class
export { DatabaseAdapter } from './database_adapter.js'
export type { MetadataRow } from './database_adapter.js'

// Kysely implementation
export { KyselyDatabaseAdapter } from './adapters/kysely_database_adapter.js'
export type { KyselyPostgreSQLConfig, KyselySQLiteConfig } from './adapters/kysely_database_adapter.js'
export { KyselyUserRepository } from './kysely_user_repository.js'

// Data record mapping utility
export { mapToDataRecord } from './map_to_data_record.js'
