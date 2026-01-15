/**
 * Custom error classes for Digital Twin framework
 * Provides structured error handling with codes, status codes, and context
 */

/**
 * Base error class for all Digital Twin errors
 */
export abstract class DigitalTwinError extends Error {
    abstract readonly code: string
    abstract readonly statusCode: number
    readonly timestamp: Date = new Date()
    readonly context?: Record<string, unknown>

    constructor(message: string, context?: Record<string, unknown>) {
        super(message)
        this.name = this.constructor.name
        this.context = context
        // Maintains proper stack trace for where our error was thrown (only available on V8)
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, this.constructor)
        }
    }

    toJSON(): Record<string, unknown> {
        return {
            error: {
                code: this.code,
                message: this.message,
                timestamp: this.timestamp.toISOString(),
                ...(this.context && { context: this.context }),
                ...(process.env.NODE_ENV !== 'production' && { stack: this.stack })
            }
        }
    }
}

/**
 * Validation error - invalid input data (400)
 */
export class ValidationError extends DigitalTwinError {
    readonly code = 'VALIDATION_ERROR' as const
    readonly statusCode = 400 as const
}

/**
 * Resource not found (404)
 */
export class NotFoundError extends DigitalTwinError {
    readonly code = 'NOT_FOUND' as const
    readonly statusCode = 404 as const
}

/**
 * Authentication required or invalid credentials (401)
 */
export class AuthenticationError extends DigitalTwinError {
    readonly code = 'AUTHENTICATION_ERROR' as const
    readonly statusCode = 401 as const
}

/**
 * Insufficient permissions (403)
 */
export class AuthorizationError extends DigitalTwinError {
    readonly code = 'AUTHORIZATION_ERROR' as const
    readonly statusCode = 403 as const
}

/**
 * Storage operation failed (500)
 */
export class StorageError extends DigitalTwinError {
    readonly code = 'STORAGE_ERROR' as const
    readonly statusCode = 500 as const
}

/**
 * Database operation failed (500)
 */
export class DatabaseError extends DigitalTwinError {
    readonly code = 'DATABASE_ERROR' as const
    readonly statusCode = 500 as const
}

/**
 * External service (API) error (502)
 */
export class ExternalServiceError extends DigitalTwinError {
    readonly code = 'EXTERNAL_SERVICE_ERROR' as const
    readonly statusCode = 502 as const
}

/**
 * Configuration error (500)
 */
export class ConfigurationError extends DigitalTwinError {
    readonly code = 'CONFIGURATION_ERROR' as const
    readonly statusCode = 500 as const
}

/**
 * Queue/Job processing error (500)
 */
export class QueueError extends DigitalTwinError {
    readonly code = 'QUEUE_ERROR' as const
    readonly statusCode = 500 as const
}

/**
 * File operation error (500)
 */
export class FileOperationError extends DigitalTwinError {
    readonly code = 'FILE_OPERATION_ERROR' as const
    readonly statusCode = 500 as const
}

/**
 * Type guard to check if an error is a DigitalTwinError
 */
export function isDigitalTwinError(error: unknown): error is DigitalTwinError {
    return error instanceof DigitalTwinError
}

/**
 * Wraps an unknown error into a DigitalTwinError
 */
export function wrapError(error: unknown, ErrorClass: typeof DigitalTwinError = StorageError): DigitalTwinError {
    if (error instanceof DigitalTwinError) {
        return error
    }

    const message = error instanceof Error ? error.message : String(error)
    const context = error instanceof Error ? { originalError: error.name } : undefined

    // @ts-expect-error - ErrorClass is abstract but we're passing concrete classes
    return new ErrorClass(message, context)
}
