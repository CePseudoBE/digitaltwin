# Digital Twin Framework

[![TypeScript](https://img.shields.io/badge/TypeScript-5.8+-blue)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20+-green)](https://nodejs.org/)
[![License](https://img.shields.io/badge/license-MIT-green)](./LICENSE)
[![pnpm](https://img.shields.io/badge/pnpm-workspace-orange)](https://pnpm.io/)

A component-based TypeScript framework for building Digital Twin applications with scheduled data collection, processing pipelines, and asset management.

## Packages

| Package | Description | Layer |
|---------|-------------|-------|
| [@cepseudo/shared](./packages/shared) | Types, errors, utilities, validation, environment helpers | 0 |
| [@cepseudo/database](./packages/database) | Database abstraction (Kysely, PostgreSQL/SQLite) | 1 |
| [@cepseudo/storage](./packages/storage) | Storage abstraction (local filesystem, S3-compatible object storage) | 1 |
| [@cepseudo/auth](./packages/auth) | Authentication providers and middleware | 1 |
| [@cepseudo/components](./packages/components) | Component base classes (Collector, Harvester, Handler, CustomTableManager) | 2 |
| [@cepseudo/assets](./packages/assets) | Asset management (files, tilesets, maps, presigned uploads) | 2 |
| [@cepseudo/engine](./packages/engine) | Engine, scheduler, queues, loader, OpenAPI | 3 |
| [digitaltwin-cli](./digitaltwin-cli) | CLI tools for generating components | - |
| [create-digitaltwin](./create-digitaltwin) | Project scaffolding tool | - |

### Layer Architecture

```
LAYER 3  engine          → orchestrates everything
LAYER 2  components      → base classes users extend
         assets          → file/tileset/map management
LAYER 1  database        → DB adapter (Kysely)
         storage         → file storage (local, S3)
         auth            → authentication & middleware
LAYER 0  shared          → types, errors, utils (no internal deps)
```

Each layer can only depend on layers below it. Circular dependencies are forbidden.

## Quick Start

```bash
# Create a new project
npx create-digitaltwin my-project
cd my-project
pnpm install

# Generate components
node dt make:collector WeatherCollector --description "Weather data collector"
node dt make:handler ApiHandler --method post
node dt make:harvester DataProcessor --source weather-collector
node dt make:assets-manager ImageManager --content-type "image/jpeg"

# Run in development
pnpm run dev
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      DigitalTwinEngine                          │
├─────────────────────────────────────────────────────────────────┤
│  ┌───────────┐  ┌───────────┐  ┌──────────┐  ┌──────────────┐  │
│  │ Collectors│  │ Harvesters│  │ Handlers │  │AssetManagers │  │
│  │ (scheduled│  │ (process  │  │ (custom  │  │ (file CRUD)  │  │
│  │  fetchers)│  │ & transform│  │ endpoints)│  │              │  │
│  └─────┬─────┘  └─────┬─────┘  └────┬─────┘  └──────┬───────┘  │
├────────┼──────────────┼─────────────┼───────────────┼──────────┤
│        │              │             │               │           │
│  ┌─────▼──────────────▼─────────────▼───────────────▼─────┐    │
│  │              QueueManager (BullMQ + Redis)             │    │
│  └────────────────────────────────────────────────────────┘    │
│                                                                 │
│  ┌────────────────────────┐    ┌────────────────────────────┐  │
│  │    DatabaseAdapter     │    │      StorageService        │  │
│  │   (Kysely: PG/SQLite)  │    │    (Local / S3)            │  │
│  └────────────────────────┘    └────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### Components

- **Collectors**: Scheduled components that fetch data from external APIs on cron schedules
- **Harvesters**: Process and transform data from collectors with dependency management
- **Handlers**: Custom HTTP endpoints with full request/response control
- **Assets Managers**: File upload/download with metadata, presigned URLs, and CRUD operations
- **Custom Table Managers**: Structured data management with automatic CRUD endpoints

## Development

```bash
# Clone the repo
git clone https://github.com/CePseudoBE/digitaltwin.git
cd digitaltwin

# Install dependencies (pnpm workspaces)
pnpm install

# Build all packages
pnpm build

# Run tests
pnpm test

# Lint
pnpm lint
```

## Features

- **Scheduled Data Collection**: Cron-based collectors with automatic retry
- **Data Processing Pipelines**: Harvesters with dependency chains and event triggers
- **Asset Management**: File uploads with metadata, presigned URL uploads for large files
- **Authentication**: OIDC resource server (Keycloak, Auth0, Microsoft Entra ID, ...), trusted gateway headers, or disabled for development
- **Queue Management**: BullMQ with Redis for reliable background processing
- **Health Checks**: Kubernetes-ready liveness and readiness probes
- **OpenAPI Generation**: Auto-generate API specs from components
- **Graceful Shutdown**: Proper cleanup on SIGTERM/SIGINT

## Authentication

The framework validates `Authorization: Bearer` tokens issued by any OIDC provider; it never logs users in itself.

```env
AUTH_MODE=oidc
OIDC_ISSUER=https://id.example.org/realms/city
OIDC_AUDIENCE=digitaltwin
```

`AUTH_MODE` is required in production. Use `trusted-headers` behind a gateway that passes the identity in headers, and `none` for local development. The [authentication guide](./packages/auth/README.md) covers Keycloak, Auth0 and Microsoft Entra ID, who is admin, and running behind a gateway safely.

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DIGITALTWIN_ENABLE_COMPRESSION` | Enable HTTP gzip compression | `false` |
| `AUTH_MODE` | Auth mode: `oidc`, `trusted-headers`, `gateway` (legacy), `none`. Required in production | `none` outside production |
| `CORS_ORIGIN` | CORS allowed origins | `*` |

## License

MIT - see [LICENSE](./LICENSE) for details.

## Author

Built by [Axel Hoffmann](https://github.com/CePseudoBE)
