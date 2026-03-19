import { test } from '@japa/runner'
import {
    jsonResponse,
    successResponse,
    errorResponse,
    unauthorizedResponse,
    notFoundResponse,
    fileResponse,
    multiStatusResponse
} from '../../src/utils/http_responses.js'

test.group('jsonResponse', () => {
    test('serializes data as JSON with correct Content-Type', ({ assert }) => {
        const response = jsonResponse(200, { items: [1, 2, 3], nested: { key: 'value' } })

        assert.equal(response.headers?.['Content-Type'], 'application/json')
        const parsed = JSON.parse(response.content as string)
        assert.deepEqual(parsed.items, [1, 2, 3])
        assert.equal(parsed.nested.key, 'value')
    })
})

test.group('errorResponse', () => {
    test('extracts message from Error objects', ({ assert }) => {
        const response = errorResponse(new Error('Something went wrong'))

        assert.equal(response.status, 500)
        const parsed = JSON.parse(response.content as string)
        assert.equal(parsed.error, 'Something went wrong')
    })

    test('accepts string messages directly', ({ assert }) => {
        const response = errorResponse('Invalid input', 400)

        assert.equal(response.status, 400)
        const parsed = JSON.parse(response.content as string)
        assert.equal(parsed.error, 'Invalid input')
    })

    test('handles unexpected value types without crashing', ({ assert }) => {
        assert.equal(JSON.parse(errorResponse(42).content as string).error, '42')
        assert.equal(JSON.parse(errorResponse(null).content as string).error, 'null')
        assert.equal(JSON.parse(errorResponse(undefined).content as string).error, 'undefined')
    })
})

test.group('Response helpers use correct defaults', () => {
    test('unauthorizedResponse defaults to "Authentication required"', ({ assert }) => {
        const parsed = JSON.parse(unauthorizedResponse().content as string)
        assert.equal(parsed.error, 'Authentication required')
    })

    test('notFoundResponse defaults to "Resource not found"', ({ assert }) => {
        const parsed = JSON.parse(notFoundResponse().content as string)
        assert.equal(parsed.error, 'Resource not found')
    })

    test('custom messages override defaults', ({ assert }) => {
        const parsed = JSON.parse(notFoundResponse('Asset #42 not found').content as string)
        assert.equal(parsed.error, 'Asset #42 not found')
    })
})

test.group('fileResponse', () => {
    test('sets Content-Disposition for download when filename is provided', ({ assert }) => {
        const content = Buffer.from('binary data')
        const response = fileResponse(content, 'model/gltf-binary', 'model.glb')

        assert.equal(response.headers?.['Content-Disposition'], 'attachment; filename="model.glb"')
        assert.equal(response.headers?.['Content-Type'], 'model/gltf-binary')
        assert.deepEqual(response.content, content)
    })

    test('omits Content-Disposition for inline content (no filename)', ({ assert }) => {
        const response = fileResponse(Buffer.from('data'), 'image/png')

        assert.isUndefined(response.headers?.['Content-Disposition'])
    })
})

test.group('multiStatusResponse', () => {
    test('reports mixed success/failure results for batch operations', ({ assert }) => {
        const results = [
            { success: true, id: 1 },
            { success: false, error: 'Failed' }
        ]
        const response = multiStatusResponse('1/2 operations succeeded', results)

        assert.equal(response.status, 207)
        const parsed = JSON.parse(response.content as string)
        assert.equal(parsed.message, '1/2 operations succeeded')
        assert.deepEqual(parsed.results, results)
    })
})
