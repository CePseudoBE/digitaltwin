# Digital Twin Framework

A TypeScript framework for building Digital Twin applications with scheduled data collection, processing pipelines, and asset management.

## Packages

| Package | Version | Description |
|---------|---------|-------------|
| [digitaltwin-core](./digitaltwin-core) | 1.0.0 | Core framework for Digital Twin applications |
| [digitaltwin-cli](./digitaltwin-cli) | 0.3.2 | CLI tools for generating components |
| [create-digitaltwin](./create-digitaltwin) | 0.6.2 | Project scaffolding tool |

## Quick Start

```bash
# Create a new project
npx create-digitaltwin my-project

# Or install the core package
pnpm add digitaltwin-core
```

## Development

This project supports both **npm** and **pnpm** as package managers.

```bash
# Install dependencies
npm install    # or: pnpm install

# Build all packages
npm run build  # or: pnpm build

# Run tests
npm test       # or: pnpm test

# Lint
npm run lint   # or: pnpm lint
```

## Architecture

- **Collectors**: Scheduled components that fetch data from external APIs
- **Harvesters**: Process and transform collected data
- **Handlers**: HTTP endpoints for real-time operations
- **Assets Managers**: File uploads with metadata and CRUD operations

## License

MIT
