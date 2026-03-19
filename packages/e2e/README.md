# @cepseudo/e2e

End-to-end integration tests for the Digital Twin Framework. Verifies the full pipeline from component initialization through database persistence, object storage, authentication, and HTTP serving -- using real infrastructure (PostgreSQL, MinIO, Redis) rather than mocks.

This package is **private** and not published to npm. It exists solely for testing.

## Infrastructure

Tests run against real services, provisioned in one of two ways:

- **Locally** -- [testcontainers](https://testcontainers.com/) starts PostgreSQL 16, MinIO, and Redis 7 in Docker containers automatically. Requires a running Docker daemon.
- **CI** -- GitHub Actions provides the services via job-level containers. The test suite detects CI infrastructure through environment variables and skips container startup.

| Service    | Image               | Purpose                                   |
|------------|----------------------|-------------------------------------------|
| PostgreSQL | `postgres:16-alpine` | Metadata storage, component tables, users |
| MinIO      | `minio/minio`        | S3-compatible object storage              |
| Redis      | `redis:7-alpine`     | BullMQ queues (HTTP integration tests)    |

### CI environment variables

When these are set, the corresponding testcontainer is not started:

| Variable                 | Example                  |
|--------------------------|--------------------------|
| `TEST_PG_HOST`           | `localhost`              |
| `TEST_PG_PORT`           | `5432`                   |
| `TEST_PG_USER`           | `test`                   |
| `TEST_PG_PASSWORD`       | `test`                   |
| `TEST_PG_DATABASE`       | `test`                   |
| `TEST_MINIO_ENDPOINT`    | `http://localhost:9000`  |
| `TEST_MINIO_ACCESS_KEY`  | `minioadmin`             |
| `TEST_MINIO_SECRET_KEY`  | `minioadmin`             |
| `TEST_MINIO_BUCKET`      | `test-bucket`            |

## Test categories

### Component-level tests

Each test group starts its own PostgreSQL and MinIO infrastructure, injects dependencies into the component under test, and exercises the full collect/harvest/handle cycle.

| File                          | Description                                                                                      |
|-------------------------------|--------------------------------------------------------------------------------------------------|
| `collector.spec.ts`           | Collector `run()` persists data to PostgreSQL + MinIO, then retrieves it                         |
| `harvester.spec.ts`           | Harvester reads source data written by a collector, computes aggregates, and stores results       |
| `handler.spec.ts`             | Handler endpoint discovery and direct method invocation (no HTTP server needed)                   |
| `custom_table_manager.spec.ts`| CRUD operations with owner-based access control on a custom table                                |
| `assets_presigned.spec.ts`    | Presigned URL upload flow: request, direct S3 upload, confirmation, and metadata retrieval        |
| `tileset_manager.spec.ts`     | Tileset ZIP upload, extraction, and tile serving via presigned URLs                               |
| `map_manager.spec.ts`         | GeoJSON map upload, metadata extraction, and retrieval                                           |

### HTTP integration tests

| File                          | Description                                                                                      |
|-------------------------------|--------------------------------------------------------------------------------------------------|
| `http_integration.spec.ts`    | Boots a full `DigitalTwinEngine` with Express, Redis queues, and registered components. Sends real HTTP requests with `x-user-id` / `x-user-roles` headers (simulating the APISIX gateway) and validates status codes, response bodies, and ownership enforcement (401, 403, 404). |

## Running tests

### Prerequisites

- Node.js >= 20
- pnpm
- Docker (for testcontainers, not needed if CI env vars are set)

### Locally

```bash
# From the repository root
pnpm --filter @cepseudo/e2e test
```

### In CI

The GitHub Actions workflow sets up PostgreSQL and MinIO as service containers and exports the `TEST_*` environment variables. No Docker-in-Docker is required.

## Test timeout

The default timeout is **60 seconds** per test (configured in `bin/test.ts`). Infrastructure startup (pulling images, waiting for health checks) can take 30+ seconds on the first run. Subsequent runs reuse cached images.

## Project structure

```
packages/e2e/
├── bin/
│   ├── test.ts              Japa test runner entry point
│   └── set-test-env.cjs     CommonJS preload for env setup
├── tests/
│   ├── helpers/
│   │   ├── setup.ts              Infrastructure bootstrap (PostgreSQL, MinIO, DB adapter, storage, auth)
│   │   ├── test_components.ts    Concrete component classes for testing
│   │   ├── auth_helpers.ts       Fake authenticated request builder
│   │   └── fixtures.ts           GeoJSON, tileset ZIP, and other test data generators
│   ├── collector.spec.ts
│   ├── harvester.spec.ts
│   ├── handler.spec.ts
│   ├── custom_table_manager.spec.ts
│   ├── assets_presigned.spec.ts
│   ├── tileset_manager.spec.ts
│   ├── map_manager.spec.ts
│   └── http_integration.spec.ts
├── package.json
└── tsconfig.test.json
```

## Test components

The `tests/helpers/test_components.ts` file defines concrete component subclasses used across all test files:

| Class                      | Base class          | Purpose                                                   |
|----------------------------|---------------------|-----------------------------------------------------------|
| `WeatherCollector`         | `Collector`         | Produces static weather JSON (temperature, humidity, pressure) |
| `WeatherAverageHarvester`  | `Harvester`         | Reads weather data, computes temperature averages          |
| `CalculatorHandler`        | `Handler`           | Exposes POST `/e2e-calculator/sum` and GET `/e2e-calculator/health` |
| `E2EAssetsManager`         | `AssetsManager`     | Generic binary asset management                            |
| `E2ETilesetManager`        | `TilesetManager`    | 3D tileset ZIP management                                  |
| `E2EMapManager`            | `MapManager`        | GeoJSON map management                                     |
| `E2ECustomTableManager`    | `CustomTableManager` | CRUD table with `title`, `value`, `active` columns        |

## Adding new tests

1. If testing a new component type, add a concrete subclass to `tests/helpers/test_components.ts`.

2. Create a new spec file in `tests/` following the existing pattern:

```typescript
import { test } from '@japa/runner'
import { setupInfrastructure, type E2EInfrastructure } from './helpers/setup.js'

test.group('MyComponent E2E', (group) => {
    let infra: E2EInfrastructure

    group.setup(async () => {
        infra = await setupInfrastructure()
        // Initialize your component with infra.db, infra.storage, infra.authMiddleware
    })

    group.teardown(async () => {
        await infra.cleanup()
    })

    test('does the expected thing', async ({ assert }) => {
        // ...
    })
})
```

3. For authenticated requests, use `makeAuthRequest` from `tests/helpers/auth_helpers.ts`.

4. For HTTP-level tests, add cases to `http_integration.spec.ts` or create a new group that boots `DigitalTwinEngine` with Redis.

## License

MIT
