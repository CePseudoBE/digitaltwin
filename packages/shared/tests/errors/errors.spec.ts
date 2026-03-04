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

test.group('Error hierarchy works in catch blocks', () => {
    test('all error classes are catchable as Error', ({ assert }) => {
        const errors = [
            new ValidationError('test'),
            new NotFoundError('test'),
            new AuthenticationError('test'),
            new AuthorizationError('test'),
            new StorageError('test'),
            new DatabaseError('test'),
            new ExternalServiceError('test'),
            new ConfigurationError('test'),
            new QueueError('test'),
            new FileOperationError('test')
        ]

        for (const error of errors) {
            assert.instanceOf(error, Error, `${error.name} should be instanceof Error`)
            assert.instanceOf(error, DigitalTwinError, `${error.name} should be instanceof DigitalTwinError`)
        }
    })

    test('catch block can distinguish error types by statusCode', ({ assert }) => {
        try {
            throw new AuthenticationError('bad token')
        } catch (error) {
            assert.instanceOf(error, DigitalTwinError)
            if (error instanceof DigitalTwinError) {
                assert.equal(error.statusCode, 401)
            }
        }
    })

    test('error message is preserved through throw/catch', ({ assert }) => {
        const message = 'User with ID 42 not found'
        try {
            throw new NotFoundError(message)
        } catch (error) {
            assert.instanceOf(error, Error)
            assert.equal((error as Error).message, message)
        }
    })
})

test.group('Error serialization (toJSON)', () => {
    test('produces a structured error with code, message, and timestamp', ({ assert }) => {
        const error = new ValidationError('Bad input', { field: 'email' })
        const json = error.toJSON() as { error: Record<string, unknown> }

        assert.property(json, 'error')
        assert.equal(json.error.code, 'VALIDATION_ERROR')
        assert.equal(json.error.message, 'Bad input')
        assert.property(json.error, 'timestamp')
        assert.deepEqual(json.error.context, { field: 'email' })
    })

    test('omits context when none is provided', ({ assert }) => {
        const error = new ValidationError('No context')
        const json = error.toJSON() as { error: Record<string, unknown> }

        assert.notProperty(json.error, 'context')
    })

    test('hides stack trace in production', ({ assert }) => {
        const originalEnv = process.env.NODE_ENV
        process.env.NODE_ENV = 'production'

        const error = new ValidationError('Test')
        const json = error.toJSON() as { error: Record<string, unknown> }
        assert.notProperty(json.error, 'stack')

        process.env.NODE_ENV = originalEnv
    })

    test('includes stack trace in development', ({ assert }) => {
        const originalEnv = process.env.NODE_ENV
        process.env.NODE_ENV = 'development'

        const error = new ValidationError('Test')
        const json = error.toJSON() as { error: Record<string, unknown> }
        assert.property(json.error, 'stack')

        process.env.NODE_ENV = originalEnv
    })

    test('JSON output is valid parseable JSON', ({ assert }) => {
        const error = new DatabaseError('Query failed', { table: 'users', query: 'SELECT * FROM "users"' })
        const json = error.toJSON()
        const serialized = JSON.stringify(json)
        const parsed = JSON.parse(serialized)

        assert.equal(parsed.error.code, 'DATABASE_ERROR')
        assert.equal(parsed.error.context.table, 'users')
    })
})

test.group('isDigitalTwinError type guard', () => {
    test('distinguishes framework errors from standard errors', ({ assert }) => {
        assert.isTrue(isDigitalTwinError(new ValidationError('test')))
        assert.isTrue(isDigitalTwinError(new StorageError('test')))
        assert.isFalse(isDigitalTwinError(new Error('test')))
        assert.isFalse(isDigitalTwinError(new TypeError('test')))
    })

    test('handles garbage input without crashing', ({ assert }) => {
        assert.isFalse(isDigitalTwinError('string'))
        assert.isFalse(isDigitalTwinError(null))
        assert.isFalse(isDigitalTwinError(undefined))
        assert.isFalse(isDigitalTwinError(123))
        assert.isFalse(isDigitalTwinError({ code: 'FAKE', statusCode: 500 }))
    })
})

test.group('wrapError', () => {
    test('does not double-wrap framework errors', ({ assert }) => {
        const original = new ValidationError('Test')
        const wrapped = wrapError(original)

        assert.strictEqual(wrapped, original)
    })

    test('wraps standard Error and preserves original error name in context', ({ assert }) => {
        const original = new TypeError('Cannot read property x')
        const wrapped = wrapError(original)

        assert.instanceOf(wrapped, StorageError)
        assert.equal(wrapped.message, 'Cannot read property x')
        assert.equal(wrapped.context?.originalError, 'TypeError')
    })

    test('wraps non-Error throwables (string, number)', ({ assert }) => {
        const wrappedString = wrapError('Network timeout', DatabaseError)
        assert.instanceOf(wrappedString, DatabaseError)
        assert.equal(wrappedString.message, 'Network timeout')

        const wrappedNumber = wrapError(42)
        assert.equal(wrappedNumber.message, '42')
    })

    test('allows specifying the target error class', ({ assert }) => {
        const wrapped = wrapError(new Error('disk full'), FileOperationError)

        assert.instanceOf(wrapped, FileOperationError)
        assert.equal(wrapped.statusCode, 500)
    })
})
