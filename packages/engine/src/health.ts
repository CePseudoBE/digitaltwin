import type { DatabaseAdapter } from '@cepseudo/database'
import type { QueueManager } from './queue_manager.js'
import type { StorageService } from '@cepseudo/storage'

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

export interface HealthCheckOptions {
    /** A critical check that is down makes the whole status 'unhealthy' (readiness 503), not just 'degraded' */
    critical?: boolean
}

export interface HealthCheckerOptions {
    /** A check that has not answered after this delay is reported down (default 3 s) */
    checkTimeoutMs?: number
}

export const DEFAULT_CHECK_TIMEOUT_MS = 3000

/**
 * Rejects when `promise` has not settled after `ms`. The pending promise itself is not
 * cancelled; callers use this to stay responsive when a backend stops answering.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms} ms`)), ms)
    })
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

interface RegisteredCheck {
    fn: HealthCheckFn
    critical: boolean
}

/**
 * Health checker with support for custom checks, a per-check timeout and critical checks
 */
export class HealthChecker {
    readonly #checks = new Map<string, RegisteredCheck>()
    readonly #timeoutMs: number
    #componentCounts?: ComponentCounts
    #version?: string

    constructor(options: HealthCheckerOptions = {}) {
        this.#timeoutMs = options.checkTimeoutMs ?? DEFAULT_CHECK_TIMEOUT_MS
    }

    /** Changes whether an already registered check decides readiness. */
    setCritical(name: string, critical: boolean): void {
        const check = this.#checks.get(name)
        if (check) check.critical = critical
    }

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
    registerCheck(name: string, checkFn: HealthCheckFn, options: HealthCheckOptions = {}): void {
        this.#checks.set(name, { fn: checkFn, critical: options.critical ?? false })
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
            entries.map(async ([name, { fn }]) => {
                const start = Date.now()
                try {
                    const result = await withTimeout(fn(), this.#timeoutMs, `Health check "${name}"`)
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
        // The database and any check registered as critical decide readiness
        const criticalDown = entries.some(([name, { critical }]) => (critical || name === 'database') && checks[name]?.status === 'down')

        let status: HealthStatus['status']
        if (criticalDown) {
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
