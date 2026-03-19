import vine, { errors } from '@vinejs/vine'
import { ValidationError } from '../errors/index.js'

type AnyValidator = { validate: (data: unknown) => Promise<unknown> }

/**
 * Validates data using a pre-compiled VineJS validator.
 * @param validator - Compiled VineJS validator
 * @param data - Data to validate
 * @param context - Optional context for error messages
 * @returns Validated and typed data
 * @throws ValidationError if validation fails
 */
export async function validateData<T>(validator: AnyValidator, data: unknown, context?: string): Promise<T> {
    try {
        const result = await validator.validate(data)
        return result as T
    } catch (error) {
        if (error instanceof errors.E_VALIDATION_ERROR) {
            const messages = error.messages
                .map((e: { field: string; message: string }) => `${e.field}: ${e.message}`)
                .join(', ')

            throw new ValidationError(context ? `${context}: ${messages}` : messages, {
                errors: error.messages
            })
        }
        throw error
    }
}

/**
 * Validates data and returns result without throwing.
 * Useful for optional validation or when you want to handle errors manually.
 * @param validator - Compiled VineJS validator
 * @param data - Data to validate
 * @returns Object with success status, data (if valid), or errors (if invalid)
 */
export async function safeValidate<T>(
    validator: AnyValidator,
    data: unknown
): Promise<{ success: true; data: T } | { success: false; errors: Array<{ field: string; message: string }> }> {
    try {
        const validated = await validator.validate(data)
        return { success: true, data: validated as T }
    } catch (error) {
        if (error instanceof errors.E_VALIDATION_ERROR) {
            return { success: false, errors: error.messages }
        }
        throw error
    }
}

/**
 * Validates query parameters, coercing string values to appropriate types.
 * Query params from Express are always strings, so we need to convert them.
 * @param validator - Compiled VineJS validator
 * @param query - Query object from Express request
 * @param context - Optional context for error messages
 * @returns Validated and typed query parameters
 */
export async function validateQuery<T>(
    validator: AnyValidator,
    query: Record<string, unknown>,
    context?: string
): Promise<T> {
    // Coerce query string values to appropriate types
    const coerced: Record<string, unknown> = {}

    for (const [key, value] of Object.entries(query)) {
        if (value === undefined || value === '') {
            continue // Skip empty values
        }

        if (typeof value === 'string') {
            // Try to coerce to number
            const num = Number(value)
            if (!isNaN(num) && value.trim() !== '') {
                coerced[key] = num
            }
            // Try to coerce to boolean
            else if (value.toLowerCase() === 'true') {
                coerced[key] = true
            } else if (value.toLowerCase() === 'false') {
                coerced[key] = false
            } else {
                coerced[key] = value
            }
        } else {
            coerced[key] = value
        }
    }

    return validateData(validator, coerced, context)
}

/**
 * Validates path parameters (e.g., :id in routes).
 * @param validator - Compiled VineJS validator
 * @param params - Params object from Express request
 * @param context - Optional context for error messages
 * @returns Validated and typed parameters
 */
export async function validateParams<T>(
    validator: AnyValidator,
    params: Record<string, string>,
    context?: string
): Promise<T> {
    // Coerce param values (always strings from Express)
    const coerced: Record<string, unknown> = {}

    for (const [key, value] of Object.entries(params)) {
        if (value === undefined) continue

        const num = Number(value)
        if (!isNaN(num) && value.trim() !== '') {
            coerced[key] = num
        } else {
            coerced[key] = value
        }
    }

    return validateData(validator, coerced, context)
}

// Re-export vine for custom schema creation
export { vine }
