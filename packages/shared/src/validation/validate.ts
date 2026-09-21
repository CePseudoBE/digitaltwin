import type { Validator } from 'typebox/compile'
import { ValidationError } from '../errors/index.js'

export interface FieldError {
    field: string
    message: string
}

function fieldErrors(validator: Validator, data: unknown): FieldError[] {
    return [...validator.Errors(data)].map(error => ({
        field: error.instancePath.slice(1).replaceAll('/', '.'),
        message: error.message
    }))
}

/**
 * Validates data with a compiled TypeBox validator.
 * @throws ValidationError listing every failing field in `context.errors`
 */
export async function validateData<T>(validator: Validator, data: unknown, context?: string): Promise<T> {
    if (validator.Check(data)) {
        return data as T
    }
    const errors = fieldErrors(validator, data)
    const messages = errors.map(e => `${e.field}: ${e.message}`).join(', ')
    throw new ValidationError(context ? `${context}: ${messages}` : messages, { errors })
}

/**
 * Validates data and returns the outcome instead of throwing.
 */
export async function safeValidate<T>(
    validator: Validator,
    data: unknown
): Promise<{ success: true; data: T } | { success: false; errors: FieldError[] }> {
    if (validator.Check(data)) {
        return { success: true, data: data as T }
    }
    return { success: false, errors: fieldErrors(validator, data) }
}

/**
 * Validates query parameters. Values arrive as strings and are converted to the
 * type the schema declares; empty strings count as absent.
 */
export async function validateQuery<T>(validator: Validator, query: Record<string, unknown>, context?: string): Promise<T> {
    const present = Object.fromEntries(Object.entries(query).filter(([, value]) => value !== undefined && value !== ''))
    return validateData(validator, validator.Convert(present), context)
}

/**
 * Validates path parameters, converting them to the types the schema declares.
 */
export async function validateParams<T>(validator: Validator, params: Record<string, string>, context?: string): Promise<T> {
    return validateData(validator, validator.Convert(params), context)
}
