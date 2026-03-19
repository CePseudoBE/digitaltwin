# @cepseudo/database

[![npm version](https://img.shields.io/npm/v/@cepseudo/database)](https://www.npmjs.com/package/@cepseudo/database)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8+-blue)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Database abstraction layer for the Digital Twin Framework. Provides a unified `DatabaseAdapter` interface with two concrete implementations (Knex and Kysely) supporting PostgreSQL and SQLite.

## Installation

```bash
pnpm add @cepseudo/database
```

You must also install **one** query builder and its database driver:

```bash
# Option A: Kysely (recommended for new projects)
pnpm add kysely better-sqlite3        # SQLite
pnpm add kysely pg                    # PostgreSQL

# Option B: Knex (legacy, stable)
pnpm add knex better-sqlite3          # SQLite
pnpm add knex pg                      # PostgreSQL
```

## Adapters

| | **KyselyDatabaseAdapter** | **KnexDatabaseAdapter** |
|---|---|---|
| Query builder | [Kysely](https://kysely.dev/) >= 0.27.0 | [Knex](https://knexjs.org/) >= 3.0.0 |
| PostgreSQL | Yes (`pg`) | Yes (`pg`) |
| SQLite | Yes (`better-sqlite3`) | Yes (`better-sqlite3` or `sqlite3`) |
| Factory methods | `async` (returns `Promise`) | Synchronous |
| Status | Recommended | Legacy, stable |

Both adapters implement the same abstract `DatabaseAdapter` class. Switching between them requires no changes to component code.

## Usage

### Kysely with PostgreSQL

```typescript
import { KyselyDatabaseAdapter } from '@cepseudo/database'

const database = await KyselyDatabaseAdapter.forPostgreSQL(
    {
        host: 'localhost',
        port: 5432,
        user: 'admin',
        password: 'secret',
        database: 'digitaltwin',
        maxConnections: 15,
    },
    dataResolver
)
```

### Knex with SQLite (development)

```typescript
import { KnexDatabaseAdapter } from '@cepseudo/database'

const database = KnexDatabaseAdapter.forSQLite(
    {
        filename: './data/digitaltwin.db',
        client: 'better-sqlite3',
        enableForeignKeys: true,
    },
    dataResolver
)
```

### Using the abstract interface in components

Components depend on `DatabaseAdapter`, not on a specific implementation. The engine injects the concrete adapter at runtime.

```typescript
import type { DatabaseAdapter } from '@cepseudo/database'

class WeatherCollector {
    #database: DatabaseAdapter

    setDependencies(database: DatabaseAdapter) {
        this.#database = database
    }

    async collect() {
        // Save collected data
        const record = await this.#database.save({
            name: 'weather-collector',
            type: 'application/json',
            url: 'storage://weather-collector/2026-03-06.json',
            date: new Date(),
        })

        // Query latest record
        const latest = await this.#database.getLatestByName('weather-collector')
    }
}
```

## Peer Dependencies

This package requires **at least one** of the following query builders. Both are marked as optional peer dependencies -- install only the one you use.

| Peer dependency | Version | Required when |
|---|---|---|
| `knex` | >= 3.0.0 | Using `KnexDatabaseAdapter` |
| `kysely` | >= 0.27.0 | Using `KyselyDatabaseAdapter` |

Each adapter also requires a database driver (`pg` for PostgreSQL, `better-sqlite3` or `sqlite3` for SQLite).

## License

MIT
