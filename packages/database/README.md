# @cepseudo/database

[![npm version](https://img.shields.io/npm/v/@cepseudo/database)](https://www.npmjs.com/package/@cepseudo/database)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8+-blue)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Database abstraction layer for the Digital Twin Framework. Provides a `DatabaseAdapter` interface implemented with [Kysely](https://kysely.dev/) for PostgreSQL and SQLite.

## Installation

```bash
pnpm add @cepseudo/database
```

You must also install Kysely and the driver of your database:

```bash
pnpm add kysely better-sqlite3        # SQLite
pnpm add kysely pg                    # PostgreSQL
```

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

### Kysely with SQLite (development)

```typescript
import { KyselyDatabaseAdapter } from '@cepseudo/database'

const database = await KyselyDatabaseAdapter.forSQLite(
    {
        filename: './data/digitaltwin.db',
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

| Peer dependency | Version | Required when |
|---|---|---|
| `kysely` | >= 0.29.0 | Always |
| `pg` | -- | PostgreSQL |
| `better-sqlite3` | -- | SQLite |

## License

MIT
