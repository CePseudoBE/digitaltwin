# @cepseudo/engine

[![Node.js](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

Central orchestrator for the Digital Twin Framework. Wires together components, databases, storage, authentication, queues, and HTTP serving into a single runnable application.

## Installation

```bash
pnpm add @cepseudo/engine
```

This package depends on the full stack of `@cepseudo/*` packages (shared, database, storage, auth, assets, components) and requires Redis for queue management.

## Quick Start

```typescript
import { DigitalTwinEngine } from '@cepseudo/engine'
import { KnexDatabaseAdapter } from '@cepseudo/database'
import { StorageServiceFactory } from '@cepseudo/storage'
import { MyCollector } from './collectors/my_collector.js'

const database = new KnexDatabaseAdapter({
    client: 'pg',
    connection: process.env.DATABASE_URL
})

const storage = StorageServiceFactory.create()

const engine = new DigitalTwinEngine({
    storage,
    database,
    collectors: [new MyCollector()],
    server: { port: 3000 }
})

await engine.start()
```

## Features

- **Component lifecycle management** -- registers, validates, and initializes collectors, harvesters, handlers, assets managers, and custom table managers
- **Dependency injection** -- automatically injects database, storage, and auth middleware into components
- **BullMQ scheduling** -- cron-based and event-driven scheduling across 4 queues (collectors, harvesters, priority, uploads)
- **HTTP server** -- Express-compatible server (via ultimate-express) with automatic endpoint registration from components
- **Health checks** -- aggregated health status for Kubernetes readiness/liveness probes (database, Redis, storage)
- **OpenAPI generation** -- auto-generates OpenAPI 3.0.3 specs from registered components
- **Graceful shutdown** -- handles SIGTERM/SIGINT with configurable timeout and ordered resource cleanup
- **Dynamic component loading** -- loads components from user project directories at runtime

## Configuration

The `EngineOptions` interface controls engine behavior:

```typescript
interface EngineOptions {
    // Required
    storage: StorageService
    database: DatabaseAdapter

    // Components (register via constructor or engine.register())
    collectors?: Collector[]
    harvesters?: Harvester[]
    handlers?: Handler[]
    assetsManagers?: AssetsManager[]
    customTableManagers?: CustomTableManager[]

    // Redis & queues
    redis?: ConnectionOptions
    queues?: {
        multiQueue?: boolean                    // default: true
        workers?: {
            collectors?: number                 // default: 1
            harvesters?: number                 // default: 1
        }
        options?: QueueConfig['queueOptions']
    }

    // HTTP server
    server?: {
        port: number                            // default: 3000
        host?: string                           // default: '0.0.0.0'
    }

    // Logging
    logging?: {
        level: LogLevel                         // default: LogLevel.INFO
        format?: 'json' | 'text'               // default: 'text'
    }

    dryRun?: boolean                            // default: false
    autoMigration?: boolean                     // default: true
}
```

## Usage Examples

### Registering components dynamically

Components can be registered after construction, before calling `start()`:

```typescript
const engine = new DigitalTwinEngine({ storage, database })

engine.register(new WeatherCollector())
engine.register(new AirQualityHandler())
engine.registerAll([new TilesetManager(), new MapManager()])

await engine.start()
```

### Health checks

The engine includes built-in health checks for database, Redis, and storage. Custom checks can be added:

```typescript
import {
    HealthChecker,
    createDatabaseCheck,
    createRedisCheck,
    createStorageCheck
} from '@cepseudo/engine'

const checker = new HealthChecker()
checker.register('database', createDatabaseCheck(database))
checker.register('redis', createRedisCheck(queueManager))
checker.register('storage', createStorageCheck(storage))

// Returns { status: 'healthy' | 'degraded' | 'unhealthy', checks: {...} }
const status = await checker.check()
```

The engine automatically registers health endpoints:
- `GET /health` -- full health status (readiness probe)
- `GET /health/live` -- lightweight liveness probe

### OpenAPI spec generation

```typescript
import { OpenAPIGenerator } from '@cepseudo/engine'

const generator = new OpenAPIGenerator({
    title: 'My Digital Twin API',
    version: '1.0.0',
    description: 'Digital twin for city infrastructure'
})

// Components expose their endpoint schemas via getConfiguration()
const spec = generator.generate(components)
// Returns an OpenAPI 3.0.3 JSON object
```

### Graceful shutdown

```typescript
import { setupGracefulShutdown } from '@cepseudo/engine'

// Automatically handles SIGTERM and SIGINT
setupGracefulShutdown({
    engine,
    timeout: 30000 // ms before forced exit
})
```

### Dynamic component loading

Load components from a user project directory at runtime:

```typescript
import { loadComponents } from '@cepseudo/engine'

const result = await loadComponents({
    directory: './src/components',
    recursive: true
})

engine.registerAll([
    ...result.collectors,
    ...result.harvesters,
    ...result.handlers
])
```

## Architecture

`@cepseudo/engine` is the LAYER 3 (top layer) package in the Digital Twin Framework. It depends on all lower layers and acts as the composition root that ties everything together.

```
LAYER 3:  engine          -- orchestration, HTTP, scheduling, health
LAYER 2:  assets, components  -- business logic, file management
LAYER 1:  database, storage, auth  -- infrastructure adapters
LAYER 0:  shared          -- types, errors, utilities, validation
```

On `engine.start()`, the following sequence executes:

1. **Database initialization** -- runs migrations, creates component tables
2. **Component initialization** -- injects dependencies (database, storage, auth middleware) into active components
3. **Endpoint registration** -- maps component HTTP endpoints to Express routes
4. **Queue setup** -- creates BullMQ queues and workers backed by Redis
5. **Scheduling** -- registers cron schedules and event triggers for collectors/harvesters
6. **Server start** -- binds the HTTP server and begins accepting requests

On `engine.stop()`, resources are cleaned up in reverse order with a configurable timeout to allow in-flight requests and queue jobs to complete.

## License

MIT
