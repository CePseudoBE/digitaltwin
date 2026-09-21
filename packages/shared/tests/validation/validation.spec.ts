import { test } from '@japa/runner'
import {
    validateData,
    safeValidate,
    validateQuery,
    validateParams,
    validatePagination,
    validateIdParam,
    validateAssetUpload,
    validateAssetUpdate,
    validateAssetBatchUpload,
    validateDateRangeQuery,
    validateCustomRecordCreate,
    validatePresignedUploadRequest
} from '../../src/validation/index.js'
import { ValidationError } from '../../src/errors/index.js'

test.group('validateData', () => {
    test('validates correct data and returns typed result', async ({ assert }) => {
        const data = { id: 123 }
        const result = await validateData<{ id: number }>(validateIdParam, data)

        assert.equal(result.id, 123)
    })

    test('throws ValidationError for invalid data', async ({ assert }) => {
        const data = { id: 'not-a-number' }

        try {
            await validateData(validateIdParam, data)
            assert.fail('Should have thrown ValidationError')
        } catch (error) {
            assert.instanceOf(error, ValidationError)
        }
    })

    test('includes context in error message', async ({ assert }) => {
        const data = { id: -5 }

        try {
            await validateData(validateIdParam, data, 'Asset ID')
            assert.fail('Should have thrown')
        } catch (error) {
            assert.instanceOf(error, ValidationError)
            assert.include((error as ValidationError).message, 'Asset ID')
        }
    })
})

test.group('safeValidate', () => {
    test('returns success: true for valid data', async ({ assert }) => {
        const data = { id: 42 }
        const result = await safeValidate<{ id: number }>(validateIdParam, data)

        assert.isTrue(result.success)
        if (result.success) {
            assert.equal(result.data.id, 42)
        }
    })

    test('returns success: false for invalid data', async ({ assert }) => {
        const data = { id: 'invalid' }
        const result = await safeValidate(validateIdParam, data)

        assert.isFalse(result.success)
        if (!result.success) {
            assert.isArray(result.errors)
            assert.isTrue(result.errors.length > 0)
        }
    })

    test('returns error details for validation failures', async ({ assert }) => {
        const data = { id: -100 }
        const result = await safeValidate(validateIdParam, data)

        assert.isFalse(result.success)
        if (!result.success) {
            assert.isTrue(result.errors.some(e => e.field === 'id'))
        }
    })
})

test.group('validateQuery', () => {
    test('coerces string numbers to numbers', async ({ assert }) => {
        const query = { limit: '50', offset: '10' }
        const result = await validateQuery<{ limit?: number; offset?: number }>(validatePagination, query)

        assert.equal(result.limit, 50)
        assert.equal(result.offset, 10)
    })

    test('coerces string booleans to booleans', async ({ assert }) => {
        const query = { is_public: 'true' }
        const result = await validateQuery<{ is_public?: boolean }>(validateAssetUpload, query)

        assert.strictEqual(result.is_public, true)
    })

    test('skips empty string values', async ({ assert }) => {
        const query = { limit: '', offset: '5' }
        const result = await validateQuery<{ limit?: number; offset?: number }>(validatePagination, query)

        assert.isUndefined(result.limit)
        assert.equal(result.offset, 5)
    })

    test('throws ValidationError for invalid query params', async ({ assert }) => {
        const query = { limit: '-50' }

        try {
            await validateQuery(validatePagination, query)
            assert.fail('Should have thrown ValidationError')
        } catch (error) {
            assert.instanceOf(error, ValidationError)
        }
    })
})

test.group('validateParams', () => {
    test('coerces string id to number', async ({ assert }) => {
        const params = { id: '123' }
        const result = await validateParams<{ id: number }>(validateIdParam, params)

        assert.equal(result.id, 123)
    })

    test('throws ValidationError for non-numeric id', async ({ assert }) => {
        const params = { id: 'abc' }

        try {
            await validateParams(validateIdParam, params)
            assert.fail('Should have thrown ValidationError')
        } catch (error) {
            assert.instanceOf(error, ValidationError)
        }
    })

    test('throws ValidationError for negative id', async ({ assert }) => {
        const params = { id: '-1' }

        try {
            await validateParams(validateIdParam, params)
            assert.fail('Should have thrown ValidationError')
        } catch (error) {
            assert.instanceOf(error, ValidationError)
        }
    })
})

test.group('Pagination Schema', () => {
    test('accepts valid pagination', async ({ assert }) => {
        const data = { limit: 100, offset: 0 }
        const result = await validateData<{ limit?: number; offset?: number }>(validatePagination, data)

        assert.equal(result.limit, 100)
        assert.equal(result.offset, 0)
    })

    test('accepts empty pagination (all optional)', async ({ assert }) => {
        const data = {}
        const result = await validateData<{ limit?: number; offset?: number }>(validatePagination, data)

        assert.isUndefined(result.limit)
        assert.isUndefined(result.offset)
    })

    test('rejects limit exceeding max (1000)', async ({ assert }) => {
        const data = { limit: 2000 }

        try {
            await validateData(validatePagination, data)
            assert.fail('Should have thrown ValidationError')
        } catch (error) {
            assert.instanceOf(error, ValidationError)
        }
    })

    test('rejects negative limit', async ({ assert }) => {
        const data = { limit: -10 }

        try {
            await validateData(validatePagination, data)
            assert.fail('Should have thrown ValidationError')
        } catch (error) {
            assert.instanceOf(error, ValidationError)
        }
    })

    test('rejects negative offset', async ({ assert }) => {
        const data = { offset: -5 }

        try {
            await validateData(validatePagination, data)
            assert.fail('Should have thrown ValidationError')
        } catch (error) {
            assert.instanceOf(error, ValidationError)
        }
    })
})

test.group('ID Param Schema', () => {
    test('accepts positive integer id', async ({ assert }) => {
        const data = { id: 1 }
        const result = await validateData<{ id: number }>(validateIdParam, data)

        assert.equal(result.id, 1)
    })

    test('rejects zero id', async ({ assert }) => {
        const data = { id: 0 }

        try {
            await validateData(validateIdParam, data)
            assert.fail('Should have thrown ValidationError')
        } catch (error) {
            assert.instanceOf(error, ValidationError)
        }
    })

    test('rejects float id', async ({ assert }) => {
        const data = { id: 1.5 }

        try {
            await validateData(validateIdParam, data)
            assert.fail('Should have thrown ValidationError')
        } catch (error) {
            assert.instanceOf(error, ValidationError)
        }
    })

    test('rejects missing id', async ({ assert }) => {
        const data = {}

        try {
            await validateData(validateIdParam, data)
            assert.fail('Should have thrown ValidationError')
        } catch (error) {
            assert.instanceOf(error, ValidationError)
        }
    })
})

test.group('Asset Upload Schema', () => {
    test('accepts valid asset upload data', async ({ assert }) => {
        const data = {
            description: 'Test asset',
            source: 'https://example.com/source',
            is_public: true
        }
        const result = await validateData<{
            description?: string
            source?: string
            is_public?: boolean
        }>(validateAssetUpload, data)

        assert.equal(result.description, 'Test asset')
        assert.equal(result.source, 'https://example.com/source')
        assert.isTrue(result.is_public)
    })

    test('accepts empty data (all optional)', async ({ assert }) => {
        const data = {}
        const result = await validateData(validateAssetUpload, data)

        assert.deepEqual(result, {})
    })

    test('rejects description exceeding max length', async ({ assert }) => {
        const data = { description: 'a'.repeat(1001) }

        try {
            await validateData(validateAssetUpload, data)
            assert.fail('Should have thrown ValidationError')
        } catch (error) {
            assert.instanceOf(error, ValidationError)
        }
    })

    test('rejects invalid URL for source', async ({ assert }) => {
        const data = { source: 'not-a-valid-url' }

        try {
            await validateData(validateAssetUpload, data)
            assert.fail('Should have thrown ValidationError')
        } catch (error) {
            assert.instanceOf(error, ValidationError)
        }
    })
})

test.group('Asset Update Schema', () => {
    test('accepts partial update', async ({ assert }) => {
        const data = { description: 'Updated description' }
        const result = await validateData<{ description?: string }>(validateAssetUpdate, data)

        assert.equal(result.description, 'Updated description')
    })

    test('accepts visibility update only', async ({ assert }) => {
        const data = { is_public: false }
        const result = await validateData<{ is_public?: boolean }>(validateAssetUpdate, data)

        assert.isFalse(result.is_public)
    })
})

test.group('Asset Batch Upload Schema', () => {
    test('accepts batch upload data', async ({ assert }) => {
        const data = {
            assets: [
                { description: 'Asset 1', source: 'https://example.com/1' },
                { description: 'Asset 2', is_public: false }
            ]
        }
        const result = await validateData<{
            assets?: Array<{ description?: string; source?: string; is_public?: boolean }>
        }>(validateAssetBatchUpload, data)

        assert.isArray(result.assets)
        assert.lengthOf(result.assets!, 2)
    })

    test('accepts empty batch (assets optional)', async ({ assert }) => {
        const data = {}
        const result = await validateData(validateAssetBatchUpload, data)

        assert.isUndefined(result.assets)
    })
})

test.group('Conversion follows the schema', () => {
    test('a numeric-looking query string stays a string when the schema says string', async ({ assert }) => {
        const result = await validateQuery<{ startDate?: string; limit?: number }>(validateDateRangeQuery, {
            startDate: '2024',
            limit: '10'
        })

        assert.strictEqual(result.startDate, '2024')
        assert.strictEqual(result.limit, 10)
    })

    test('custom record bodies keep every property', async ({ assert }) => {
        const result = await validateData<Record<string, unknown>>(validateCustomRecordCreate, { name: 'a', value: 3 })

        assert.deepEqual(result, { name: 'a', value: 3 })
    })

    test('presigned upload request rejects a non-positive size', async ({ assert }) => {
        const result = await safeValidate(validatePresignedUploadRequest, {
            fileName: 'model.glb',
            fileSize: 0,
            contentType: 'model/gltf-binary'
        })

        assert.isFalse(result.success)
        if (!result.success) {
            assert.deepEqual(result.errors.map(e => e.field), ['fileSize'])
        }
    })
})

test.group('ValidationError shape', () => {
    test('lists every failing field in context.errors and in the message', async ({ assert }) => {
        try {
            await validateData(validatePagination, { limit: 5000, offset: -1 }, 'Pagination')
            assert.fail('Should have thrown')
        } catch (error) {
            assert.instanceOf(error, ValidationError)
            const { message, context } = error as ValidationError
            const errors = context?.errors as Array<{ field: string; message: string }>
            assert.deepEqual(errors.map(e => e.field), ['limit', 'offset'])
            assert.include(message, 'Pagination: limit:')
            assert.include(message, 'offset:')
        }
    })

    test('nested fields use dotted paths', async ({ assert }) => {
        const result = await safeValidate(validateAssetBatchUpload, { assets: [{ source: 'nope' }] })

        assert.isFalse(result.success)
        if (!result.success) {
            assert.equal(result.errors[0].field, 'assets.0.source')
        }
    })
})
