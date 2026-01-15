/**
 * @fileoverview Main entry point for the digitaltwin-core package
 *
 * This module provides the core functionality for building digital twin applications,
 * including data collection, processing, asset management, and real-time synchronization.
 *
 * @version 1.0.0
 * @author FARI Team
 *
 * @example
 * ```typescript
 * import { DigitalTwinEngine, Collector, AssetsManager } from 'digitaltwin-core';
 *
 * const engine = new DigitalTwinEngine({ ... });
 * await engine.start();
 * ```
 */

// Core Engine
export { DigitalTwinEngine } from './engine/digital_twin_engine.js'

// Base Components
export { Collector } from './components/collector.js'
export { Harvester } from './components/harvester.js'
export { Handler } from './components/handler.js'
export { AssetsManager } from './components/assets_manager.js'
export { GlobalAssetsHandler } from './components/global_assets_handler.js'
export {
    CustomTableManager,
    type CustomTableRecord,
    type QueryValidationOptions
} from './components/custom_table_manager.js'
export { TilesetManager } from './components/tileset_manager.js'
export { type AsyncUploadable, isAsyncUploadable } from './components/async_upload.js'

// Storage Services
export { StorageService } from './storage/storage_service.js'
export { LocalStorageService } from './storage/adapters/local_storage_service.js'
export { OvhS3StorageService } from './storage/adapters/ovh_storage_service.js'
export { StorageServiceFactory } from './storage/storage_factory.js'

// Database Services
export { DatabaseAdapter } from './database/database_adapter.js'
export { KnexDatabaseAdapter, PostgreSQLConfig, SQLiteConfig } from './database/adapters/knex_database_adapter.js'

// Types and Interfaces
export * from './components/types.js'
export * from './components/interfaces.js'
export * from './types/data_record.js'
export * from './types/http.js'

// Authentication
export * from './auth/index.js'

// Errors
export * from './errors/index.js'

// Validation
export * from './validation/index.js'

// Utilities
export { Logger, LogLevel } from './utils/logger.js'
export { safeAsync, tryAsync, safeCleanup, retryAsync } from './utils/safe_async.js'
export { setupGracefulShutdown, type ShutdownOptions } from './utils/graceful_shutdown.js'
export { mapToDataRecord } from './utils/map_to_data_record.js'
export { servableEndpoint } from './utils/servable_endpoint.js'
export {
    HttpStatus,
    jsonResponse,
    successResponse,
    errorResponse,
    badRequestResponse,
    unauthorizedResponse,
    forbiddenResponse,
    notFoundResponse,
    textResponse,
    fileResponse,
    multiStatusResponse
} from './utils/http_responses.js'
export type { HttpStatusCode } from './utils/http_responses.js'

// Engine Components
export { QueueManager } from './engine/queue_manager.js'
export { errorHandler, asyncHandler, notFoundHandler } from './engine/error_handler.js'
export {
    HealthChecker,
    createDatabaseCheck,
    createRedisCheck,
    createStorageCheck,
    performHealthCheck,
    livenessCheck,
    type HealthCheck,
    type HealthCheckFn,
    type HealthStatus,
    type ComponentCounts
} from './engine/health.js'
export {
    UploadProcessor,
    type TilesetUploadJobData,
    type UploadJobData,
    type UploadStatus
} from './engine/upload_processor.js'
export { initializeComponents } from './engine/initializer.js'
export * from './engine/events.js'
export * from './engine/endpoints.js'

// OpenAPI Documentation Generation
export * from './openapi/index.js'

export { Env } from './env/env.js'
