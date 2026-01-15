# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2025-01-15

### Added

#### Authentication System
- Pluggable authentication provider system supporting multiple modes:
  - **Gateway mode**: API gateway headers (`x-user-id`, `x-user-roles`)
  - **JWT mode**: Direct JWT token validation (HS256, RS256)
  - **None mode**: Disabled for development/testing
- User service with automatic user creation and role synchronization
- Asset ownership enforcement (users can only modify their own assets)
- Admin role override for privileged access

#### Request Validation
- VineJS integration for type-safe request validation
- Built-in validation schemas for assets, IDs, and common patterns
- `ValidationError` returns HTTP 422 Unprocessable Entity
- Custom validation rules support

#### Error Handling
- Custom error classes: `CollectorError`, `HarvesterError`, `HandlerError`, `StorageError`, `DatabaseError`, `ValidationError`
- Structured error logging with context (component name, stack traces)
- `safeAsync` utility for non-critical operations that shouldn't crash the app
- Try/catch protection in all component `run()` methods and event listeners

#### Production Readiness
- Graceful shutdown with configurable timeout
- `isShuttingDown()` method to check engine state
- Extensible health check system with `registerHealthCheck()` / `removeHealthCheck()`
- Deep health checks for database and Redis connections
- Signal handlers for SIGTERM/SIGINT

#### Security
- Path traversal protection in LocalStorageService
- SQL injection protection with table name validation
- True UPDATE operations for assets (no more DELETE+INSERT)
- Request body size limits

#### Testing & Quality
- Code coverage with c8 (79%+ coverage)
- Comprehensive test suites for:
  - KnexDatabaseAdapter (93% coverage)
  - TilesetManager (86% coverage)
  - OpenAPI Generator (98% coverage)
  - Security (path traversal, SQL injection)
  - Authentication and ownership
  - Graceful shutdown

#### CI/CD
- GitHub Actions workflows for testing and publishing
- NPM Trusted Publishing via OIDC
- Automated builds on PR and push to develop/main

#### OpenAPI
- Automatic OpenAPI 3.0.3 specification generation
- Component-level spec contribution via `getOpenAPISpec()`
- JSON and YAML output formats
- Common schemas (Error, GeoJSON types)

### Changed
- Monorepo structure with pnpm workspaces
- Node.js 20+ required (was 18+)
- Improved TypeScript configuration with project references
- Better error messages with context information

### Fixed
- Silent catch blocks now log errors via `safeAsync`
- Event listeners properly handle async errors
- Asset updates preserve record IDs
- Pool connection cleanup on shutdown

## [0.14.x] - Previous Versions

### 0.14.3
- Fix npm publish configuration
- Fix clean script to remove tsbuildinfo

### 0.14.0 - 0.14.2
- Initial public releases
- Core components: Collectors, Harvesters, Handlers, Assets Manager
- Storage adapters: Local filesystem, OVH Object Storage
- Database adapter: Knex (SQLite, PostgreSQL)
- BullMQ job scheduling
- TilesetManager and MapManager for 3D content
- CustomTableManager for structured data

---

[1.0.0]: https://github.com/CePseudoBE/digitaltwin/releases/tag/v1.0.0
