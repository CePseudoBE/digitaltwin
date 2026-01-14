/**
 * Express error handling middleware
 * Provides centralized error handling with logging and structured responses
 */

import type { Request, Response, NextFunction } from 'ultimate-express'
import { randomUUID } from 'crypto'
import { DigitalTwinError } from '../errors/index.js'
import { Logger } from '../utils/logger.js'

const logger = new Logger('ErrorHandler')

/**
 * Express error handler middleware
 * Must be registered after all routes
 */
export function errorHandler(error: Error, req: Request, res: Response, _next: NextFunction): void {
    const requestId = (req.headers['x-request-id'] as string) || randomUUID()

    // Log the error with context
    logger.error(`[${requestId}] ${req.method} ${req.path} - ${error.message}`, {
        requestId,
        method: req.method,
        path: req.path,
        userId: req.headers['x-user-id'],
        stack: error.stack
    })

    // Don't send response if headers already sent
    if (res.headersSent) {
        return
    }

    if (error instanceof DigitalTwinError) {
        res.status(error.statusCode).json({
            ...error.toJSON(),
            requestId
        })
        return
    }

    // Unknown error - return generic response
    const isProduction = process.env.NODE_ENV === 'production'
    res.status(500).json({
        error: {
            code: 'INTERNAL_ERROR',
            message: isProduction ? 'Internal server error' : error.message,
            requestId,
            timestamp: new Date().toISOString(),
            ...(!isProduction && { stack: error.stack })
        }
    })
}

/**
 * Wraps an async route handler to automatically catch errors
 * and pass them to the error handling middleware
 */
export function asyncHandler<T>(handler: (req: Request, res: Response, next: NextFunction) => Promise<T>) {
    return (req: Request, res: Response, next: NextFunction): void => {
        Promise.resolve(handler(req, res, next)).catch(next)
    }
}

/**
 * 404 handler for routes that don't exist
 */
export function notFoundHandler(req: Request, res: Response): void {
    const requestId = (req.headers['x-request-id'] as string) || randomUUID()

    res.status(404).json({
        error: {
            code: 'NOT_FOUND',
            message: `Route ${req.method} ${req.path} not found`,
            requestId,
            timestamp: new Date().toISOString()
        }
    })
}
