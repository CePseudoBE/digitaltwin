// Engine
export { DigitalTwinEngine } from './digital_twin_engine.js'
export type { EngineOptions, ComponentValidationResult } from './digital_twin_engine.js'

// Scheduler
export { scheduleComponents } from './scheduler.js'

// Queue Manager
export { QueueManager } from './queue_manager.js'
export type { QueueConfig } from './queue_manager.js'

// Component Types & Guards
export {
    detectComponentType,
    isCollector,
    isHarvester,
    isHandler,
    isAssetsManager,
    isCustomTableManager,
    isActiveComponent
} from './component_types.js'
export type {
    AnyComponent,
    ComponentTypeName,
    SchedulableComponent,
    ActiveComponent,
    ComponentTypeMap,
    LoadedComponents
} from './component_types.js'

// Initializer
export { initializeComponents, initializeAssetsManagers } from './initializer.js'

// Endpoints
export { exposeEndpoints } from './endpoints.js'

// Health
export {
    HealthChecker,
    createDatabaseCheck,
    createRedisCheck,
    createStorageCheck,
    performHealthCheck,
    livenessCheck
} from './health.js'
export type { HealthCheckFn, HealthCheck, HealthStatus, ComponentCounts } from './health.js'

// Error Handler
export { errorHandler, asyncHandler, notFoundHandler } from './error_handler.js'

// Graceful Shutdown
export { setupGracefulShutdown } from './graceful_shutdown.js'
export type { ShutdownOptions } from './graceful_shutdown.js'

// Global Assets Handler
export { GlobalAssetsHandler } from './global_assets_handler.js'

// Component Loader
export { loadComponents } from './loader/component_loader.js'
export type { LoadComponentsOptions, LoadComponentsResult } from './loader/component_loader.js'

// OpenAPI Generator
export { OpenAPIGenerator } from './openapi/generator.js'
