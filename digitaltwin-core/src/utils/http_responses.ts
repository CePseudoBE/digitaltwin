/**
 * @fileoverview HTTP response utilities for consistent API responses
 *
 * This module provides helper functions to create standardized DataResponse objects,
 * reducing boilerplate code in component handlers and ensuring consistent API responses.
 */

import type { DataResponse } from '../components/types.js'
import { DigitalTwinError } from '../errors/index.js'

/**
 * HTTP status codes commonly used in the Digital Twin framework.
 */
export const HttpStatus = {
    OK: 200,
    CREATED: 201,
    MULTI_STATUS: 207,
    BAD_REQUEST: 400,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    UNPROCESSABLE_ENTITY: 422,
    INTERNAL_SERVER_ERROR: 500
} as const

export type HttpStatusCode = (typeof HttpStatus)[keyof typeof HttpStatus]

/**
 * Creates a JSON response with the specified status and data.
 *
 * @param status - HTTP status code
 * @param data - Data to serialize as JSON
 * @returns DataResponse with JSON content type
 *
 * @example
 * ```typescript
 * return jsonResponse(200, { message: 'Success' })
 * return jsonResponse(400, { error: 'Invalid input' })
 * ```
 */
export function jsonResponse(status: number, data: object): DataResponse {
    return {
        status,
        content: JSON.stringify(data),
        headers: { 'Content-Type': 'application/json' }
    }
}

/**
 * Creates a successful JSON response (HTTP 200).
 *
 * @param data - Data to serialize as JSON
 * @returns DataResponse with status 200
 *
 * @example
 * ```typescript
 * return successResponse({ message: 'Asset uploaded successfully' })
 * ```
 */
export function successResponse(data: object): DataResponse {
    return jsonResponse(HttpStatus.OK, data)
}

/**
 * Creates an error response from an Error object or string.
 *
 * @param error - Error object or error message string
 * @param status - HTTP status code (default: 500)
 * @returns DataResponse with error message
 *
 * @example
 * ```typescript
 * return errorResponse(new Error('Something went wrong'))
 * return errorResponse('Invalid input', 400)
 * ```
 */
export function errorResponse(error: unknown, status?: number): DataResponse {
    // Use statusCode from DigitalTwinError if available
    const statusCode =
        error instanceof DigitalTwinError ? error.statusCode : (status ?? HttpStatus.INTERNAL_SERVER_ERROR)
    const message = error instanceof Error ? error.message : String(error)
    return jsonResponse(statusCode, { error: message })
}

/**
 * Creates a 400 Bad Request response.
 *
 * @param message - Error message describing what's wrong with the request
 * @returns DataResponse with status 400
 *
 * @example
 * ```typescript
 * return badRequestResponse('Missing required fields: description, source')
 * ```
 */
export function badRequestResponse(message: string): DataResponse {
    return jsonResponse(HttpStatus.BAD_REQUEST, { error: message })
}

/**
 * Creates a 401 Unauthorized response.
 *
 * @param message - Error message (default: 'Authentication required')
 * @returns DataResponse with status 401
 *
 * @example
 * ```typescript
 * return unauthorizedResponse()
 * return unauthorizedResponse('Invalid authentication headers')
 * ```
 */
export function unauthorizedResponse(message: string = 'Authentication required'): DataResponse {
    return jsonResponse(HttpStatus.UNAUTHORIZED, { error: message })
}

/**
 * Creates a 403 Forbidden response.
 *
 * @param message - Error message describing why access is denied
 * @returns DataResponse with status 403
 *
 * @example
 * ```typescript
 * return forbiddenResponse('You can only modify your own assets')
 * ```
 */
export function forbiddenResponse(message: string): DataResponse {
    return jsonResponse(HttpStatus.FORBIDDEN, { error: message })
}

/**
 * Creates a 404 Not Found response.
 *
 * @param message - Error message (default: 'Resource not found')
 * @returns DataResponse with status 404
 *
 * @example
 * ```typescript
 * return notFoundResponse('Asset not found')
 * ```
 */
export function notFoundResponse(message: string = 'Resource not found'): DataResponse {
    return jsonResponse(HttpStatus.NOT_FOUND, { error: message })
}

/**
 * Creates a validation error response (HTTP 422 Unprocessable Entity).
 *
 * Used when request data fails schema validation.
 *
 * @param message - Validation error message
 * @param errors - Optional array of field-level validation errors
 * @returns DataResponse with status 422
 *
 * @example
 * ```typescript
 * return validationErrorResponse('id: must be a positive number')
 * return validationErrorResponse('Validation failed', [{ field: 'id', message: 'must be positive' }])
 * ```
 */
export function validationErrorResponse(
    message: string,
    errors?: Array<{ field: string; message: string }>
): DataResponse {
    const body: { error: string; errors?: Array<{ field: string; message: string }> } = { error: message }
    if (errors) {
        body.errors = errors
    }
    return jsonResponse(HttpStatus.UNPROCESSABLE_ENTITY, body)
}

/**
 * Creates a plain text response.
 *
 * @param status - HTTP status code
 * @param content - Text content
 * @returns DataResponse with text/plain content type
 *
 * @example
 * ```typescript
 * return textResponse(404, 'Asset not found')
 * ```
 */
export function textResponse(status: number, content: string): DataResponse {
    return {
        status,
        content,
        headers: { 'Content-Type': 'text/plain' }
    }
}

/**
 * Creates a binary/file response.
 *
 * @param content - File content as Buffer
 * @param contentType - MIME type of the file
 * @param filename - Optional filename for Content-Disposition header (triggers download)
 * @returns DataResponse with appropriate content type
 *
 * @example
 * ```typescript
 * // For display/use in browser
 * return fileResponse(buffer, 'model/gltf-binary')
 *
 * // For download
 * return fileResponse(buffer, 'model/gltf-binary', 'model.glb')
 * ```
 */
export function fileResponse(content: Buffer, contentType: string, filename?: string): DataResponse {
    const headers: Record<string, string> = { 'Content-Type': contentType }

    if (filename) {
        headers['Content-Disposition'] = `attachment; filename="${filename}"`
    }

    return {
        status: HttpStatus.OK,
        content,
        headers
    }
}

/**
 * Creates a 207 Multi-Status response for batch operations.
 *
 * @param message - Summary message
 * @param results - Array of individual operation results
 * @returns DataResponse with status 207
 *
 * @example
 * ```typescript
 * return multiStatusResponse('3/5 assets uploaded successfully', results)
 * ```
 */
export function multiStatusResponse(message: string, results: unknown[]): DataResponse {
    return jsonResponse(HttpStatus.MULTI_STATUS, { message, results })
}
