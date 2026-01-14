# Digital Twin Framework

A TypeScript framework for building Digital Twin applications with scheduled data collection, processing pipelines, and asset management.

## Packages

| Package | Version | Description |
|---------|---------|-------------|
| [digitaltwin-core](./digitaltwin-core) | 0.14.1 | Core framework for Digital Twin applications |
| [digitaltwin-cli](./digitaltwin-cli) | 0.3.1 | CLI tools for generating components |
| [create-digitaltwin](./create-digitaltwin) | 0.6.1 | Project scaffolding tool |

## Quick Start

```bash
# Create a new project
npx create-digitaltwin my-project

# Or install the core package
pnpm add digitaltwin-core
```

## Development

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run tests
pnpm test

# Lint
pnpm lint
```

## Architecture

- **Collectors**: Scheduled components that fetch data from external APIs
- **Harvesters**: Process and transform collected data
- **Handlers**: HTTP endpoints for real-time operations
- **Assets Managers**: File uploads with metadata and CRUD operations

## License

MIT
