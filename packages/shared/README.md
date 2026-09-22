# @cepseudo/shared

[![npm version](https://img.shields.io/npm/v/@cepseudo/shared)](https://www.npmjs.com/package/@cepseudo/shared)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8+-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/npm/l/@cepseudo/shared)](./LICENSE)

Foundation package for the Digital Twin Framework. Provides shared types, error hierarchy, validation schemas, utilities, and event bus used across all packages.

**Layer 0** -- no internal dependencies. Every other `@cepseudo/*` package depends on this one.

## Installation

```bash
pnpm add @cepseudo/shared
```

## API Overview

### Types

Request and response types for building type-safe HTTP handlers.

| Export | Description |
|---|---|
| `TypedRequest<P, Q, B>` | Generic typed Express request with params, query, and body |
| `AuthenticatedTypedRequest` | `TypedRequest` enriched with authenticated user context |
| `EndpointHandler` | Function signature for route handlers |
| `DataRecord` | Core data structure for collected/harvested data |
| `DataResolver` | Function that resolves data for a component |
| `UserRepository` | Interface for user persistence (implemented in `@cepseudo/database`) |
| `AuthResult`, `AuthenticatedUser` | Authentication-related types |
| `HttpMethod` | Union type of HTTP methods |
| `OpenAPIDocument`, `OpenAPIDocumentable`, ... | OpenAPI 3.x specification types |
| `Component`, `Servable`, `ScheduleRunnable` | Component model interfaces |
| `ComponentConfiguration`, `CollectorConfiguration`, ... | Configuration types per component kind |
| `EndpointDefinition` | Route definition structure |

Pre-built request types (`IdParamRequest`, `AssetUploadRequest`, `PresignedUploadRequest`, etc.) cover common endpoint signatures so you don't have to re-declare params/body shapes.

### Errors

A structured error hierarchy extending `DigitalTwinError`. All errors carry a machine-readable `code` and an HTTP-friendly `statusCode`.

| Error | Status | Use case |
|---|---|---|
| `ValidationError` | 422 | Invalid input data |
| `NotFoundError` | 404 | Resource not found |
| `AuthenticationError` | 401 | Missing or invalid credentials |
| `AuthorizationError` | 403 | Insufficient permissions |
| `StorageError` | 500 | Object storage failures |
| `DatabaseError` | 500 | Database operation failures |
| `ExternalServiceError` | 502 | Third-party API failures |
| `ConfigurationError` | 500 | Invalid configuration |
| `QueueError` | 500 | Queue operation failures |
| `FileOperationError` | 500 | File system failures |

Helpers: `isDigitalTwinError(err)` type guard, `wrapError(err)` to normalize unknown errors.

### Validation

TypeBox schemas and compiled validators for common inputs. The schemas are JSON Schema objects, so they can also be attached to a route's `EndpointSchema`.

| Export | Description |
|---|---|
| `paginationSchema` | `page` + `limit` query params |
| `idParamSchema` | Numeric `:id` route param |
| `assetUploadSchema`, `assetUpdateSchema` | Asset CRUD payloads |
| `presignedUploadRequestSchema` | Presigned URL request body |
| `validateData(validator, data)` | Validate and return typed result or throw `ValidationError` |
| `safeValidate(validator, data)` | Validate and return `{ success, data }` or `{ success, errors }` |
| `validateQuery(validator, query)` | Convert query strings to the schema's types, then validate |
| `validateParams(validator, params)` | Convert path params to the schema's types, then validate |

### Utils

| Export | Description |
|---|---|
| `Logger` | Structured logger with configurable `LogLevel` |
| `safeAsync(fn)` | Express-compatible async wrapper (catches and forwards errors) |
| `tryAsync<T>(fn)` | Returns `[error, result]` tuple instead of throwing |
| `retryAsync(fn, opts)` | Retry with configurable attempts and backoff |
| `safeCleanup(fn)` | Run cleanup logic, swallow errors |
| `servableEndpoint(config)` | Build an `EndpointDefinition` from a config object |
| `HttpStatus` | Enum of HTTP status codes |
| `jsonResponse`, `successResponse`, `errorResponse`, ... | Standardized HTTP response helpers |

### Events

| Export | Description |
|---|---|
| `EngineEventBus` | Typed event emitter for inter-component communication |
| `engineEventBus` | Singleton instance |
| `ComponentEvent` | Event payload type |

### Environment

| Export | Description |
|---|---|
| `Env` | Type-safe environment variable access with validation and defaults |

## Usage Examples

### Type-safe HTTP handlers

```typescript
import type { TypedRequest, EndpointHandler } from '@cepseudo/shared'
import { successResponse, notFoundResponse } from '@cepseudo/shared'

interface GetSensorParams { id: string }
interface SensorQuery { includeHistory?: string }

const getSensor: EndpointHandler = async (
  req: TypedRequest<GetSensorParams, SensorQuery>,
  res
) => {
  const { id } = req.params
  const sensor = await findSensor(id)

  if (!sensor) {
    return notFoundResponse(res, `Sensor ${id} not found`)
  }

  return successResponse(res, sensor)
}
```

### Error hierarchy

```typescript
import {
  NotFoundError,
  ValidationError,
  isDigitalTwinError,
  wrapError
} from '@cepseudo/shared'

try {
  const record = await db.find(id)
  if (!record) {
    throw new NotFoundError(`Record ${id} does not exist`)
  }
} catch (err) {
  if (isDigitalTwinError(err)) {
    console.error(`[${err.code}] ${err.message} (HTTP ${err.statusCode})`)
  } else {
    const wrapped = wrapError(err)
    console.error('Unexpected error:', wrapped.message)
  }
}
```

### Validation schemas

```typescript
import { validateQuery, validateData, validatePagination } from '@cepseudo/shared'
import { Type } from 'typebox'
import { Compile } from 'typebox/compile'

// Use a built-in validator
const pagination = await validateQuery<{ limit?: number; offset?: number }>(validatePagination, req.query)

// Define a custom schema
const createSensor = Compile(
  Type.Object({
    name: Type.String({ minLength: 1, maxLength: 255 }),
    latitude: Type.Number({ minimum: -90, maximum: 90 }),
    longitude: Type.Number({ minimum: -180, maximum: 180 })
  })
)

const body = await validateData<{ name: string; latitude: number; longitude: number }>(createSensor, req.body)
```

## License

MIT
