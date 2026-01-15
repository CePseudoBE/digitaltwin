import type { DatabaseAdapter } from '../database/database_adapter.js'
import type { QueueManager } from './queue_manager.js'
import type { StorageService } from '../storage/storage_service.js'

/**
 * Individual health check result
 */
export interface HealthCheck {
    /** Status of the check */
    status: 'up' | 'down'
    /** Response latency in milliseconds */
    latency?: number
    /** Error message if status is down */
    error?: string
}

/**
 * Component counts for health status
 */
export interface ComponentCounts {
    collectors: number
    harvesters: number
    handlers: number
    assetsManagers: number
}

/**
 * Full health status response
 */
export interface HealthStatus {
    /** Overall status */
    status: 'healthy' | 'degraded' | 'unhealthy'
    /** ISO timestamp of the check */
    timestamp: string
    /** Process uptime in seconds */
    uptime: number
    /** Package version if available */
    version?: string
    /** Individual service checks */
    checks: Record<string, HealthCheck>
    /** Component counts */
    components?: ComponentCounts
}

/**
 * Custom health check function type
 */
export type HealthCheckFn = () => Promise<HealthCheck>

/**
 * Health checker with support for custom checks
 */
export class HealthChecker {
    readonly #checks = new Map<string, HealthCheckFn>()
    #componentCounts?: ComponentCounts
    #version?: string

    /**
     * Register a custom health check
     * @param name Unique name for the check
     * @param checkFn Function that performs the check
     *
     * @example
     * ```typescript
     * healthChecker.registerCheck('external-api', async () => {
     *     try {
     *         await fetch('https://api.example.com/health')
     *         return { status: 'up' }
     *     } catch (error) {
     *         return { status: 'down', error: error.message }
     *     }
     * })
     * ```
     */
    registerCheck(name: string, checkFn: HealthCheckFn): void {
        this.#checks.set(name, checkFn)
    }

    /**
     * Remove a health check
     * @param name Name of the check to remove
     */
    removeCheck(name: string): boolean {
        return this.#checks.delete(name)
    }

    /**
     * Get list of registered check names
     */
    getCheckNames(): string[] {
        return Array.from(this.#checks.keys())
    }

    /**
     * Set component counts for health status
     */
    setComponentCounts(counts: ComponentCounts): void {
        this.#componentCounts = counts
    }

    /**
     * Set version for health status
     */
    setVersion(version: string): void {
        this.#version = version
    }

    /**
     * Perform all registered health checks
     */
    async performCheck(): Promise<HealthStatus> {
        const checks: Record<string, HealthCheck> = {}

        // Run all checks in parallel
        const entries = Array.from(this.#checks.entries())
        const results = await Promise.all(
            entries.map(async ([name, checkFn]) => {
                const start = Date.now()
                try {
                    const result = await checkFn()
                    return [name, { ...result, latency: result.latency ?? Date.now() - start }] as const
                } catch (error) {
                    return [
                        name,
                        {
                            status: 'down' as const,
                            latency: Date.now() - start,
                            error: error instanceof Error ? error.message : 'Unknown error'
                        }
                    ] as const
                }
            })
        )

        results.forEach(([name, result]) => {
            checks[name] = result
        })

        // Determine overall status
        const allChecks = Object.values(checks)
        const anyDown = allChecks.some(c => c.status === 'down')
        const databaseDown = checks['database']?.status === 'down'

        let status: HealthStatus['status']
        if (databaseDown) {
            status = 'unhealthy'
        } else if (anyDown) {
            status = 'degraded'
        } else {
            status = 'healthy'
        }

        return {
            status,
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            ...(this.#version && { version: this.#version }),
            checks,
            ...(this.#componentCounts && { components: this.#componentCounts })
        }
    }
}

/**
 * Create a database health check function
 */
export function createDatabaseCheck(db: DatabaseAdapter): HealthCheckFn {
    return async () => {
        const start = Date.now()
        try {
            // Use doesTableExists as a ping - it will fail if DB is unreachable
            await db.doesTableExists('_health_check_ping')
            return { status: 'up', latency: Date.now() - start }
        } catch (error) {
            return {
                status: 'down',
                latency: Date.now() - start,
                error: error instanceof Error ? error.message : 'Unknown error'
            }
        }
    }
}

/**
 * Create a Redis health check function via QueueManager
 */
export function createRedisCheck(qm: QueueManager): HealthCheckFn {
    return async () => {
        const start = Date.now()
        try {
            await qm.getQueueStats()
            return { status: 'up', latency: Date.now() - start }
        } catch (error) {
            return {
                status: 'down',
                latency: Date.now() - start,
                error: error instanceof Error ? error.message : 'Unknown error'
            }
        }
    }
}

/**
 * Create a storage health check function
 */
export function createStorageCheck(storage: StorageService): HealthCheckFn {
    return async () => {
        const start = Date.now()
        try {
            if ('checkConnection' in storage && typeof storage.checkConnection === 'function') {
                await (storage as { checkConnection(): Promise<void> }).checkConnection()
            }
            return { status: 'up', latency: Date.now() - start }
        } catch (error) {
            return {
                status: 'down',
                latency: Date.now() - start,
                error: error instanceof Error ? error.message : 'Unknown error'
            }
        }
    }
}

/**
 * Perform deep health check on all services (convenience function)
 */
export async function performHealthCheck(
    database: DatabaseAdapter,
    queueManager?: QueueManager | null,
    storage?: StorageService,
    componentCounts?: ComponentCounts,
    version?: string
): Promise<HealthStatus> {
    const checker = new HealthChecker()

    checker.registerCheck('database', createDatabaseCheck(database))

    if (queueManager) {
        checker.registerCheck('redis', createRedisCheck(queueManager))
    }

    if (storage) {
        checker.registerCheck('storage', createStorageCheck(storage))
    }

    if (componentCounts) {
        checker.setComponentCounts(componentCounts)
    }

    if (version) {
        checker.setVersion(version)
    }

    return checker.performCheck()
}

/**
 * Simple liveness check - always returns ok if process is running
 */
export function livenessCheck(): { status: 'ok' } {
    return { status: 'ok' }
}
