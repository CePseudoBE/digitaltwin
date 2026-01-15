import type { DigitalTwinEngine } from '../engine/digital_twin_engine.js'

export interface ShutdownOptions {
    /** Timeout before forcing exit (default: 30000ms) */
    timeout?: number
    /** Signals to handle (default: ['SIGTERM', 'SIGINT']) */
    signals?: NodeJS.Signals[]
    /** Custom cleanup function to run before stopping engine */
    onShutdown?: () => Promise<void>
    /** Custom logger function (default: console.log) */
    logger?: (msg: string) => void
}

/**
 * Setup graceful shutdown handlers for a DigitalTwinEngine
 *
 * This helper registers signal handlers for graceful shutdown in production.
 * It handles SIGTERM (from Kubernetes/Docker) and SIGINT (Ctrl+C) by default.
 *
 * @param engine The DigitalTwinEngine instance to shut down
 * @param options Configuration options
 * @returns Cleanup function to remove signal handlers
 *
 * @example
 * ```typescript
 * import { DigitalTwinEngine, setupGracefulShutdown } from 'digitaltwin-core'
 *
 * const engine = new DigitalTwinEngine({ ... })
 *
 * // Setup graceful shutdown before starting
 * const cleanup = setupGracefulShutdown(engine, {
 *     timeout: 30000,
 *     signals: ['SIGTERM', 'SIGINT', 'SIGQUIT'],
 *     onShutdown: async () => {
 *         console.log('Performing custom cleanup...')
 *     }
 * })
 *
 * await engine.start()
 *
 * // Later, if you need to remove handlers:
 * // cleanup()
 * ```
 */
export function setupGracefulShutdown(engine: DigitalTwinEngine, options: ShutdownOptions = {}): () => void {
    const { timeout = 30000, signals = ['SIGTERM', 'SIGINT'], onShutdown, logger = console.log } = options

    let isShuttingDown = false

    const shutdown = async (signal: string) => {
        if (isShuttingDown) {
            logger(`[Shutdown] Already shutting down, ignoring ${signal}`)
            return
        }

        isShuttingDown = true
        logger(`[Shutdown] Received ${signal}, initiating graceful shutdown...`)

        // Set global timeout for force exit
        const forceExitTimer = setTimeout(() => {
            logger('[Shutdown] Timeout exceeded, forcing exit')
            process.exit(1)
        }, timeout)
        forceExitTimer.unref()

        try {
            // Run custom shutdown logic first
            if (onShutdown) {
                await onShutdown()
            }

            // Stop the engine
            await engine.stop()

            clearTimeout(forceExitTimer)
            logger('[Shutdown] Graceful shutdown completed')
            process.exit(0)
        } catch (error) {
            logger(`[Shutdown] Error during shutdown: ${error instanceof Error ? error.message : String(error)}`)
            process.exit(1)
        }
    }

    // Register signal handlers
    const handlers = new Map<NodeJS.Signals, () => void>()

    signals.forEach(signal => {
        const handler = () => shutdown(signal)
        handlers.set(signal, handler)
        process.on(signal, handler)
    })

    // Return cleanup function
    return () => {
        handlers.forEach((handler, signal) => {
            process.removeListener(signal, handler)
        })
        handlers.clear()
    }
}
