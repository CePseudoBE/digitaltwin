import { ValidationError } from '../errors/index.js'

/**
 * Parses a boolean coming from a form field, query string or JSON body.
 *
 * Multipart and query values arrive as strings, so `Boolean('false')` is `true`.
 * Accepted: booleans, `'true'`/`'false'`, `'1'`/`'0'` (case-insensitive), `1`/`0`.
 * Empty, `null` and `undefined` mean "not provided" and yield `undefined`.
 *
 * @throws {ValidationError} For any other value, so a typo is a 422 rather than a silent default
 */
export function parseBoolean(value: unknown, field = 'value'): boolean | undefined {
    if (value === undefined || value === null || value === '') return undefined
    if (typeof value === 'boolean') return value

    const normalized = String(value).trim().toLowerCase()
    if (normalized === 'true' || normalized === '1') return true
    if (normalized === 'false' || normalized === '0') return false

    throw new ValidationError(`${field}: expected a boolean (true/false/1/0), got "${String(value)}"`, { field, value })
}
