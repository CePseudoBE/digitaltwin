/**
 * Utilities for safe async operations
 * Provides error handling for non-critical operations like cleanup
 */

import { Logger } from './logger.js'

const defaultLogger = new Logger('SafeAsync')

/**
 * Executes an async operation with error logging
 * For cleanup operations where errors should not block execution
 *
 * @param operation - The async function to execute
 * @param context - Description of the operation for logging
 * @param logger - Optional logger instance
 * @returns The result of the operation, or undefined if it failed
 */
export async function safeAsync<T>(
    operation: () => Promise<T>,
    context: string,
    logger?: Logger
): Promise<T | undefined> {
    try {
        return await operation()
    } catch (error) {
        const log = logger ?? defaultLogger
        const message = error instanceof Error ? error.message : String(error)
        log.warn(`Non-critical error in ${context}: ${message}`)
        return undefined
    }
}

/**
 * Executes an async operation and returns a Result tuple
 * Useful when you need to know if the operation failed but continue execution
 *
 * @param operation - The async function to execute
 * @returns [result, undefined] on success, [undefined, error] on failure
 */
export async function tryAsync<T>(operation: () => Promise<T>): Promise<[T, undefined] | [undefined, Error]> {
    try {
        const result = await operation()
        return [result, undefined]
    } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error))
        return [undefined, err]
    }
}

/**
 * Executes multiple cleanup operations in parallel, logging any failures
 * All operations will be attempted even if some fail
 *
 * @param operations - Array of cleanup operations with context
 * @param logger - Optional logger instance
 */
export async function safeCleanup(
    operations: Array<{ operation: () => Promise<unknown>; context: string }>,
    logger?: Logger
): Promise<void> {
    const log = logger ?? defaultLogger

    const results = await Promise.allSettled(
        operations.map(({ operation, context }) =>
            operation().catch(error => {
                const message = error instanceof Error ? error.message : String(error)
                log.warn(`Cleanup failed for ${context}: ${message}`)
                throw error
            })
        )
    )

    const failures = results.filter(r => r.status === 'rejected').length
    if (failures > 0) {
        log.warn(`${failures}/${operations.length} cleanup operations failed`)
    }
}

/**
 * Retries an async operation with exponential backoff
 *
 * @param operation - The async function to execute
 * @param options - Retry options
 * @returns The result of the operation
 * @throws The last error if all retries fail
 */
export async function retryAsync<T>(
    operation: () => Promise<T>,
    options: {
        maxRetries?: number
        initialDelayMs?: number
        maxDelayMs?: number
        context?: string
        logger?: Logger
    } = {}
): Promise<T> {
    const { maxRetries = 3, initialDelayMs = 100, maxDelayMs = 5000, context = 'operation', logger } = options

    const log = logger ?? defaultLogger
    let lastError: Error | undefined

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await operation()
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error))

            if (attempt < maxRetries) {
                const delay = Math.min(initialDelayMs * Math.pow(2, attempt), maxDelayMs)
                log.warn(
                    `${context} failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delay}ms: ${lastError.message}`
                )
                await new Promise(resolve => setTimeout(resolve, delay))
            }
        }
    }

    throw lastError
}
