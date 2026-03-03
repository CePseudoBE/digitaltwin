import { test } from '@japa/runner'
import {
    DigitalTwinError,
    ValidationError,
    NotFoundError,
    AuthenticationError,
    AuthorizationError,
    StorageError,
    DatabaseError,
    ExternalServiceError,
    ConfigurationError,
    QueueError,
    FileOperationError,
    isDigitalTwinError,
    wrapError
} from '../../src/errors/index.js'

test.group('Custom Error Classes', () => {
    test('ValidationError has correct code and statusCode', ({ assert }) => {
        const error = new ValidationError('Invalid input')

        assert.equal(error.code, 'VALIDATION_ERROR')
        assert.equal(error.statusCode, 422)
        assert.equal(error.message, 'Invalid input')
        assert.equal(error.name, 'ValidationError')
        assert.instanceOf(error.timestamp, Date)
    })

    test('NotFoundError has correct code and statusCode', ({ assert }) => {
        const error = new NotFoundError('Resource not found')

        assert.equal(error.code, 'NOT_FOUND')
        assert.equal(error.statusCode, 404)
    })

    test('AuthenticationError has correct code and statusCode', ({ assert }) => {
        const error = new AuthenticationError('Invalid credentials')

        assert.equal(error.code, 'AUTHENTICATION_ERROR')
        assert.equal(error.statusCode, 401)
    })

    test('AuthorizationError has correct code and statusCode', ({ assert }) => {
        const error = new AuthorizationError('Insufficient permissions')

        assert.equal(error.code, 'AUTHORIZATION_ERROR')
        assert.equal(error.statusCode, 403)
    })

    test('StorageError has correct code and statusCode', ({ assert }) => {
        const error = new StorageError('Storage failed')

        assert.equal(error.code, 'STORAGE_ERROR')
        assert.equal(error.statusCode, 500)
    })

    test('DatabaseError has correct code and statusCode', ({ assert }) => {
        const error = new DatabaseError('Query failed')

        assert.equal(error.code, 'DATABASE_ERROR')
        assert.equal(error.statusCode, 500)
    })

    test('ExternalServiceError has correct code and statusCode', ({ assert }) => {
        const error = new ExternalServiceError('API unavailable')

        assert.equal(error.code, 'EXTERNAL_SERVICE_ERROR')
        assert.equal(error.statusCode, 502)
    })

    test('ConfigurationError has correct code and statusCode', ({ assert }) => {
        const error = new ConfigurationError('Missing config')

        assert.equal(error.code, 'CONFIGURATION_ERROR')
        assert.equal(error.statusCode, 500)
    })

    test('QueueError has correct code and statusCode', ({ assert }) => {
        const error = new QueueError('Job failed')

        assert.equal(error.code, 'QUEUE_ERROR')
        assert.equal(error.statusCode, 500)
    })

    test('FileOperationError has correct code and statusCode', ({ assert }) => {
        const error = new FileOperationError('File not readable')

        assert.equal(error.code, 'FILE_OPERATION_ERROR')
        assert.equal(error.statusCode, 500)
    })

    test('error accepts context object', ({ assert }) => {
        const context = { userId: '123', action: 'upload' }
        const error = new ValidationError('Invalid file', context)

        assert.deepEqual(error.context, context)
    })

    test('toJSON returns structured error object', ({ assert }) => {
        const error = new ValidationError('Bad input', { field: 'email' })
        const json = error.toJSON() as { error: Record<string, unknown> }

        assert.property(json, 'error')
        assert.equal(json.error.code, 'VALIDATION_ERROR')
        assert.equal(json.error.message, 'Bad input')
        assert.property(json.error, 'timestamp')
        assert.deepEqual(json.error.context, { field: 'email' })
    })

    test('toJSON hides stack in production', ({ assert }) => {
        const originalEnv = process.env.NODE_ENV
        process.env.NODE_ENV = 'production'

        const error = new ValidationError('Test')
        const json = error.toJSON() as { error: Record<string, unknown> }

        assert.notProperty(json.error, 'stack')

        process.env.NODE_ENV = originalEnv
    })

    test('toJSON shows stack in development', ({ assert }) => {
        const originalEnv = process.env.NODE_ENV
        process.env.NODE_ENV = 'development'

        const error = new ValidationError('Test')
        const json = error.toJSON() as { error: Record<string, unknown> }

        assert.property(json.error, 'stack')

        process.env.NODE_ENV = originalEnv
    })
})

test.group('Error Utilities', () => {
    test('isDigitalTwinError returns true for DigitalTwinError instances', ({ assert }) => {
        const error = new ValidationError('Test')
        assert.isTrue(isDigitalTwinError(error))
    })

    test('isDigitalTwinError returns false for regular Error', ({ assert }) => {
        const error = new Error('Test')
        assert.isFalse(isDigitalTwinError(error))
    })

    test('isDigitalTwinError returns false for non-error values', ({ assert }) => {
        assert.isFalse(isDigitalTwinError('string'))
        assert.isFalse(isDigitalTwinError(null))
        assert.isFalse(isDigitalTwinError(undefined))
        assert.isFalse(isDigitalTwinError(123))
    })

    test('wrapError returns same error if already DigitalTwinError', ({ assert }) => {
        const original = new ValidationError('Test')
        const wrapped = wrapError(original)

        assert.strictEqual(wrapped, original)
    })

    test('wrapError wraps regular Error into StorageError by default', ({ assert }) => {
        const original = new Error('Something failed')
        const wrapped = wrapError(original)

        assert.instanceOf(wrapped, StorageError)
        assert.equal(wrapped.message, 'Something failed')
    })

    test('wrapError wraps string into specified error class', ({ assert }) => {
        const wrapped = wrapError('Network timeout', DatabaseError)

        assert.instanceOf(wrapped, DatabaseError)
        assert.equal(wrapped.message, 'Network timeout')
    })
})
