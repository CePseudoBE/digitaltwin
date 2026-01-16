/**
 * Validation utilities for CLI commands
 */

// Regex for valid PascalCase names (must start with uppercase letter)
const VALID_NAME_REGEX = /^[A-Z][a-zA-Z0-9]*$/

// Valid HTTP methods for handlers
const VALID_HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const
export type HttpMethod = (typeof VALID_HTTP_METHODS)[number]

// Reserved JavaScript/TypeScript keywords
const RESERVED_WORDS = new Set([
  'class',
  'const',
  'export',
  'default',
  'import',
  'function',
  'return',
  'if',
  'else',
  'for',
  'while',
  'do',
  'switch',
  'case',
  'break',
  'continue',
  'try',
  'catch',
  'throw',
  'finally',
  'new',
  'this',
  'super',
  'extends',
  'implements',
  'interface',
  'type',
  'enum',
  'abstract',
  'static',
  'public',
  'private',
  'protected',
  'readonly',
  'async',
  'await',
  'yield',
  'void',
  'null',
  'undefined',
  'true',
  'false',
  'in',
  'of',
  'instanceof',
  'typeof',
  'delete',
  'debugger',
  'with',
  'let',
  'var',
])

/**
 * Result of a validation check
 */
export interface ValidationResult {
  valid: boolean
  error?: string
  suggestion?: string
}

/**
 * Converts a string to PascalCase
 */
function toPascalCase(str: string): string {
  // Handle camelCase by inserting space before uppercase letters
  const withSpaces = str.replace(/([a-z])([A-Z])/g, '$1 $2')

  return withSpaces
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('')
}

/**
 * Validates a component name for use in code generation
 *
 * @param name - The component name to validate
 * @returns ValidationResult with valid status and optional error/suggestion
 *
 * @example
 * validateComponentName('WeatherCollector') // { valid: true }
 * validateComponentName('my-collector') // { valid: false, error: '...', suggestion: 'MyCollector' }
 */
export function validateComponentName(name: string): ValidationResult {
  // 1. Check empty
  if (!name || name.trim() === '') {
    return { valid: false, error: 'Component name is required' }
  }

  // 2. Check length
  if (name.length > 64) {
    return {
      valid: false,
      error: 'Component name must be 64 characters or less',
    }
  }

  // 3. Check reserved words
  if (RESERVED_WORDS.has(name.toLowerCase())) {
    return {
      valid: false,
      error: `'${name}' is a reserved word`,
      suggestion: `Try '${name}Component' or '${name}Service'`,
    }
  }

  // 4. Check format (PascalCase)
  if (!VALID_NAME_REGEX.test(name)) {
    const suggested = toPascalCase(name)
    return {
      valid: false,
      error: 'Component name must be in PascalCase (e.g., WeatherCollector)',
      suggestion: suggested && suggested !== name ? `Try '${suggested}'` : undefined,
    }
  }

  return { valid: true }
}

/**
 * Validates an HTTP method for handlers
 *
 * @param method - The HTTP method to validate
 * @returns ValidationResult with valid status and optional error/suggestion
 *
 * @example
 * validateHttpMethod('post') // { valid: true }
 * validateHttpMethod('foo') // { valid: false, error: '...', suggestion: '...' }
 */
export function validateHttpMethod(method: string): ValidationResult {
  const normalized = method.toLowerCase()

  if (!VALID_HTTP_METHODS.includes(normalized as HttpMethod)) {
    return {
      valid: false,
      error: `Invalid HTTP method '${method}'`,
      suggestion: `Valid methods are: ${VALID_HTTP_METHODS.join(', ')}`,
    }
  }

  return { valid: true }
}

/**
 * Simple validation for cron schedule format
 * Validates basic structure: 5 or 6 space-separated fields
 *
 * @param schedule - The cron schedule to validate
 * @returns ValidationResult with valid status and optional error
 *
 * @example
 * validateCronSchedule('0 * * * *') // { valid: true }
 * validateCronSchedule('invalid') // { valid: false, error: '...' }
 */
export function validateCronSchedule(schedule: string): ValidationResult {
  if (!schedule || schedule.trim() === '') {
    return { valid: false, error: 'Cron schedule is required' }
  }

  const parts = schedule.trim().split(/\s+/)

  // Standard cron: 5 fields (minute hour day month weekday)
  // Extended cron: 6 fields (second minute hour day month weekday)
  if (parts.length < 5 || parts.length > 6) {
    return {
      valid: false,
      error: `Invalid cron format. Expected 5 or 6 fields, got ${parts.length}`,
      suggestion: 'Example: "0 */5 * * * *" (every 5 minutes)',
    }
  }

  // Basic validation of each field
  const cronFieldPattern = /^(\*|[0-9]+|[0-9]+-[0-9]+|\*\/[0-9]+|[0-9]+\/[0-9]+)(,[0-9]+)*$/

  for (let i = 0; i < parts.length; i++) {
    if (!cronFieldPattern.test(parts[i])) {
      return {
        valid: false,
        error: `Invalid cron field at position ${i + 1}: '${parts[i]}'`,
        suggestion: 'Each field should be: *, number, range (1-5), or step (*/5)',
      }
    }
  }

  return { valid: true }
}

/**
 * Validates a MIME content type
 *
 * @param contentType - The MIME type to validate
 * @returns ValidationResult with valid status and optional error
 *
 * @example
 * validateContentType('image/jpeg') // { valid: true }
 * validateContentType('invalid') // { valid: false, error: '...' }
 */
export function validateContentType(contentType: string): ValidationResult {
  if (!contentType || contentType.trim() === '') {
    return { valid: false, error: 'Content type is required' }
  }

  // Basic MIME type pattern: type/subtype
  const mimePattern = /^[a-zA-Z0-9][a-zA-Z0-9!#$&\-^_+.]*\/[a-zA-Z0-9][a-zA-Z0-9!#$&\-^_+.]*$/

  if (!mimePattern.test(contentType)) {
    return {
      valid: false,
      error: `Invalid MIME type format: '${contentType}'`,
      suggestion: 'Expected format: type/subtype (e.g., image/jpeg, application/json)',
    }
  }

  return { valid: true }
}
