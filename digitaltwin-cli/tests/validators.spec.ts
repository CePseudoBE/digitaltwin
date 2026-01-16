import { test } from '@japa/runner'
import {
  validateComponentName,
  validateHttpMethod,
  validateCronSchedule,
  validateContentType,
} from '../src/utils/validators.js'

test.group('validateComponentName', () => {
  test('should accept valid PascalCase names', ({ assert }) => {
    assert.isTrue(validateComponentName('WeatherCollector').valid)
    assert.isTrue(validateComponentName('MyComponent').valid)
    assert.isTrue(validateComponentName('API').valid)
    assert.isTrue(validateComponentName('A').valid)
    assert.isTrue(validateComponentName('DataProcessor123').valid)
  })

  test('should reject empty names', ({ assert }) => {
    const result = validateComponentName('')
    assert.isFalse(result.valid)
    assert.include(result.error!, 'required')
  })

  test('should reject whitespace-only names', ({ assert }) => {
    const result = validateComponentName('   ')
    assert.isFalse(result.valid)
    assert.include(result.error!, 'required')
  })

  test('should reject names starting with lowercase', ({ assert }) => {
    const result = validateComponentName('weatherCollector')
    assert.isFalse(result.valid)
    assert.include(result.error!, 'PascalCase')
    assert.include(result.suggestion!, 'WeatherCollector')
  })

  test('should reject names with hyphens', ({ assert }) => {
    const result = validateComponentName('my-collector')
    assert.isFalse(result.valid)
    assert.include(result.error!, 'PascalCase')
    assert.include(result.suggestion!, 'MyCollector')
  })

  test('should reject names with underscores', ({ assert }) => {
    const result = validateComponentName('my_collector')
    assert.isFalse(result.valid)
    assert.include(result.suggestion!, 'MyCollector')
  })

  test('should reject names starting with numbers', ({ assert }) => {
    const result = validateComponentName('123Invalid')
    assert.isFalse(result.valid)
    assert.include(result.error!, 'PascalCase')
  })

  test('should reject reserved words', ({ assert }) => {
    const result = validateComponentName('class')
    assert.isFalse(result.valid)
    assert.include(result.error!, 'reserved')
    assert.isDefined(result.suggestion)
  })

  test('should reject reserved words case-insensitively', ({ assert }) => {
    const result = validateComponentName('Class')
    assert.isFalse(result.valid)
    assert.include(result.error!, 'reserved')
  })

  test('should reject names that are too long', ({ assert }) => {
    const longName = 'A'.repeat(65)
    const result = validateComponentName(longName)
    assert.isFalse(result.valid)
    assert.include(result.error!, '64 characters')
  })

  test('should accept names at max length', ({ assert }) => {
    const maxName = 'A'.repeat(64)
    const result = validateComponentName(maxName)
    assert.isTrue(result.valid)
  })
})

test.group('validateHttpMethod', () => {
  test('should accept valid HTTP methods', ({ assert }) => {
    assert.isTrue(validateHttpMethod('get').valid)
    assert.isTrue(validateHttpMethod('post').valid)
    assert.isTrue(validateHttpMethod('put').valid)
    assert.isTrue(validateHttpMethod('patch').valid)
    assert.isTrue(validateHttpMethod('delete').valid)
  })

  test('should accept HTTP methods case-insensitively', ({ assert }) => {
    assert.isTrue(validateHttpMethod('GET').valid)
    assert.isTrue(validateHttpMethod('POST').valid)
    assert.isTrue(validateHttpMethod('Put').valid)
  })

  test('should reject invalid HTTP methods', ({ assert }) => {
    const result = validateHttpMethod('foo')
    assert.isFalse(result.valid)
    assert.include(result.error!, 'Invalid HTTP method')
    assert.include(result.suggestion!, 'get')
  })

  test('should reject empty method', ({ assert }) => {
    const result = validateHttpMethod('')
    assert.isFalse(result.valid)
  })
})

test.group('validateCronSchedule', () => {
  test('should accept valid 5-field cron expressions', ({ assert }) => {
    assert.isTrue(validateCronSchedule('0 * * * *').valid) // every hour
    assert.isTrue(validateCronSchedule('*/5 * * * *').valid) // every 5 minutes
    assert.isTrue(validateCronSchedule('0 0 * * *').valid) // midnight
  })

  test('should accept valid 6-field cron expressions', ({ assert }) => {
    assert.isTrue(validateCronSchedule('0 */5 * * * *').valid) // every 5 minutes with seconds
    assert.isTrue(validateCronSchedule('0 0 0 * * *').valid) // midnight with seconds
  })

  test('should accept ranges and steps', ({ assert }) => {
    assert.isTrue(validateCronSchedule('0 1-5 * * *').valid)
    assert.isTrue(validateCronSchedule('*/10 * * * *').valid)
    assert.isTrue(validateCronSchedule('0/15 * * * *').valid)
  })

  test('should reject empty schedule', ({ assert }) => {
    const result = validateCronSchedule('')
    assert.isFalse(result.valid)
    assert.include(result.error!, 'required')
  })

  test('should reject too few fields', ({ assert }) => {
    const result = validateCronSchedule('* * *')
    assert.isFalse(result.valid)
    assert.include(result.error!, 'Expected 5 or 6 fields')
  })

  test('should reject too many fields', ({ assert }) => {
    const result = validateCronSchedule('* * * * * * *')
    assert.isFalse(result.valid)
    assert.include(result.error!, 'Expected 5 or 6 fields')
  })

  test('should reject invalid field values', ({ assert }) => {
    const result = validateCronSchedule('abc * * * *')
    assert.isFalse(result.valid)
    assert.include(result.error!, 'Invalid cron field')
  })
})

test.group('validateContentType', () => {
  test('should accept valid MIME types', ({ assert }) => {
    assert.isTrue(validateContentType('image/jpeg').valid)
    assert.isTrue(validateContentType('image/png').valid)
    assert.isTrue(validateContentType('application/json').valid)
    assert.isTrue(validateContentType('application/pdf').valid)
    assert.isTrue(validateContentType('text/plain').valid)
    assert.isTrue(validateContentType('application/octet-stream').valid)
  })

  test('should accept MIME types with special characters', ({ assert }) => {
    assert.isTrue(validateContentType('application/vnd.api+json').valid)
    assert.isTrue(validateContentType('image/svg+xml').valid)
  })

  test('should reject empty content type', ({ assert }) => {
    const result = validateContentType('')
    assert.isFalse(result.valid)
    assert.include(result.error!, 'required')
  })

  test('should reject invalid format without slash', ({ assert }) => {
    const result = validateContentType('invalid')
    assert.isFalse(result.valid)
    assert.include(result.error!, 'Invalid MIME type')
    assert.include(result.suggestion!, 'type/subtype')
  })

  test('should reject format with only slash', ({ assert }) => {
    const result = validateContentType('/')
    assert.isFalse(result.valid)
  })
})
