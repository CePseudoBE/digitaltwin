// Re-exported from @digitaltwin/engine for backward compatibility
export {
    HealthChecker,
    createDatabaseCheck,
    createRedisCheck,
    createStorageCheck,
    performHealthCheck,
    livenessCheck
} from '@digitaltwin/engine'
export type { HealthCheckFn, HealthCheck, HealthStatus, ComponentCounts } from '@digitaltwin/engine'
