import Database from 'better-sqlite3'
import { Kysely, SqliteDialect, PostgresDialect } from 'kysely'
import { KyselyDatabaseAdapter } from '../../src/adapters/kysely_database_adapter.js'
import type { DataResolver } from '@digitaltwin/shared'

const dataResolver: DataResolver = async () => Buffer.alloc(0)

export type AdapterFactory = () => Promise<{ db: KyselyDatabaseAdapter; cleanup: () => Promise<void> }>
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type KyselyFactory = () => Promise<{ db: Kysely<any>; cleanup: () => Promise<void> }>

function pgConfig() {
    return {
        host: process.env.TEST_PG_HOST!,
        port: Number(process.env.TEST_PG_PORT),
        user: process.env.TEST_PG_USER!,
        password: process.env.TEST_PG_PASSWORD!,
        database: process.env.TEST_PG_DATABASE!,
    }
}

export const sqliteAdapterFactory: AdapterFactory = async () => {
    const sqliteDb = new Database(':memory:')
    const db = KyselyDatabaseAdapter.fromSQLiteDatabase(sqliteDb, dataResolver, { enableForeignKeys: false })
    sqliteDb.exec(`
        CREATE TABLE users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            keycloak_id VARCHAR(255) NOT NULL UNIQUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `)
    return { db, cleanup: () => db.close() }
}

export const postgresAdapterFactory: AdapterFactory = async () => {
    const db = await KyselyDatabaseAdapter.forPostgreSQL(pgConfig(), dataResolver)
    await db.getUserRepository().initializeTables()
    return { db, cleanup: () => db.close() }
}

export const sqliteKyselyFactory: KyselyFactory = async () => {
    const sqliteDb = new Database(':memory:')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = new Kysely<any>({ dialect: new SqliteDialect({ database: sqliteDb }) })
    return { db, cleanup: () => db.destroy() }
}

export const postgresKyselyFactory: KyselyFactory = async () => {
    const pg = await import('pg')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Pool = (pg.default as any)?.Pool ?? pg.Pool
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pool = new Pool(pgConfig())
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = new Kysely<any>({ dialect: new PostgresDialect({ pool: pool as any }) })
    return { db, cleanup: () => db.destroy() }
}
