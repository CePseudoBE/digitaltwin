# Digital Twin Framework

[![TypeScript](https://img.shields.io/badge/TypeScript-5.8+-blue)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20+-green)](https://nodejs.org/)
[![License](https://img.shields.io/badge/license-MIT-green)](./LICENSE)
[![pnpm](https://img.shields.io/badge/pnpm-workspace-orange)](https://pnpm.io/)

A component-based TypeScript framework for building Digital Twin applications with scheduled data collection, processing pipelines, and asset management.

## Packages

| Package | Description | Version |
|---------|-------------|---------|
| [digitaltwin-core](./digitaltwin-core) | Core framework with collectors, harvesters, handlers, and asset managers | 1.0.1 |
| [digitaltwin-cli](./digitaltwin-cli) | CLI tools for generating components | 0.4.0 |
| [create-digitaltwin](./create-digitaltwin) | Project scaffolding tool | 0.7.0 |

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
│  │  (Knex: SQLite/PG/MySQL)│   │    (Local / OVH S3)        │  │
│  └────────────────────────┘    └────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### Components

- **Collectors**: Scheduled components that fetch data from external APIs on cron schedules
- **Harvesters**: Process and transform data from collectors with dependency management
- **Handlers**: Custom HTTP endpoints with full request/response control
- **Assets Managers**: File upload/download with metadata and CRUD operations
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

## Project Structure

```
digitaltwin/
├── digitaltwin-core/      # Main framework
│   ├── src/
│   │   ├── components/    # Base classes (Collector, Harvester, Handler, etc.)
│   │   ├── engine/        # DigitalTwinEngine, QueueManager, Scheduler
│   │   ├── database/      # Knex adapters
│   │   ├── storage/       # Local and S3 storage services
│   │   ├── auth/          # Authentication (Gateway, JWT, NoAuth)
│   │   └── utils/         # Logging, errors, helpers
│   └── tests/
├── digitaltwin-cli/       # CLI code generator
│   ├── src/commands/      # make:collector, make:handler, etc.
│   └── stubs/             # Component templates
├── create-digitaltwin/    # Project scaffolding
│   └── src/templates/     # Project templates
└── TODO/                  # Task tracking
```

## Documentation

- [Core Framework Documentation](./digitaltwin-core/README.md)
- [Full API Documentation](./digitaltwin-core/DOCUMENTATION.md)
- [CLI Usage](./digitaltwin-cli/README.md)
- [Contributing Guide](./CONTRIBUTING.md)

## Features

- **Scheduled Data Collection**: Cron-based collectors with automatic retry
- **Data Processing Pipelines**: Harvesters with dependency chains
- **Asset Management**: File uploads with metadata, validation, and streaming
- **Authentication**: Pluggable auth (API Gateway headers, JWT, or disabled)
- **Queue Management**: BullMQ with Redis for reliable background processing
- **Health Checks**: Kubernetes-ready liveness and readiness probes
- **OpenAPI Generation**: Auto-generate API specs from components
- **Graceful Shutdown**: Proper cleanup on SIGTERM/SIGINT

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DIGITALTWIN_ENABLE_COMPRESSION` | Enable HTTP gzip compression | `false` |
| `DIGITALTWIN_DISABLE_AUTH` | Disable authentication | `false` |
| `AUTH_MODE` | Auth mode: `gateway`, `jwt`, `none` | `gateway` |
| `CORS_ORIGIN` | CORS allowed origins | `*` |

## License

MIT - see [LICENSE](./LICENSE) for details.

## Author

Built by [Axel Hoffmann](https://github.com/CePseudoBE)
