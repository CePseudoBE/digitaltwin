import { test } from '@japa/runner'
import {
    HttpStatus,
    jsonResponse,
    successResponse,
    errorResponse,
    badRequestResponse,
    unauthorizedResponse,
    forbiddenResponse,
    notFoundResponse,
    textResponse,
    fileResponse,
    multiStatusResponse
} from '../../src/utils/http_responses.js'

test.group('HttpStatus constants', () => {
    test('should have correct status code values', ({ assert }) => {
        assert.equal(HttpStatus.OK, 200)
        assert.equal(HttpStatus.CREATED, 201)
        assert.equal(HttpStatus.MULTI_STATUS, 207)
        assert.equal(HttpStatus.BAD_REQUEST, 400)
        assert.equal(HttpStatus.UNAUTHORIZED, 401)
        assert.equal(HttpStatus.FORBIDDEN, 403)
        assert.equal(HttpStatus.NOT_FOUND, 404)
        assert.equal(HttpStatus.INTERNAL_SERVER_ERROR, 500)
    })
})

test.group('jsonResponse', () => {
    test('should create JSON response with correct status', ({ assert }) => {
        const response = jsonResponse(200, { message: 'Success' })

        assert.equal(response.status, 200)
        assert.equal(response.headers?.['Content-Type'], 'application/json')
        assert.equal(response.content, '{"message":"Success"}')
    })

    test('should serialize complex objects', ({ assert }) => {
        const data = {
            items: [1, 2, 3],
            nested: { key: 'value' },
            count: 42
        }
        const response = jsonResponse(200, data)

        assert.equal(response.status, 200)
        const parsed = JSON.parse(response.content as string)
        assert.deepEqual(parsed, data)
    })

    test('should work with different status codes', ({ assert }) => {
        const response400 = jsonResponse(400, { error: 'Bad request' })
        const response500 = jsonResponse(500, { error: 'Server error' })

        assert.equal(response400.status, 400)
        assert.equal(response500.status, 500)
    })
})

test.group('successResponse', () => {
    test('should create 200 OK response', ({ assert }) => {
        const response = successResponse({ message: 'Asset uploaded' })

        assert.equal(response.status, 200)
        assert.equal(response.headers?.['Content-Type'], 'application/json')

        const parsed = JSON.parse(response.content as string)
        assert.equal(parsed.message, 'Asset uploaded')
    })

    test('should work with complex data', ({ assert }) => {
        const data = {
            id: 1,
            name: 'test',
            metadata: { created: '2024-01-01' }
        }
        const response = successResponse(data)

        const parsed = JSON.parse(response.content as string)
        assert.deepEqual(parsed, data)
    })
})

test.group('errorResponse', () => {
    test('should create error response from Error object', ({ assert }) => {
        const error = new Error('Something went wrong')
        const response = errorResponse(error)

        assert.equal(response.status, 500)
        const parsed = JSON.parse(response.content as string)
        assert.equal(parsed.error, 'Something went wrong')
    })

    test('should create error response from string', ({ assert }) => {
        const response = errorResponse('Invalid input')

        assert.equal(response.status, 500)
        const parsed = JSON.parse(response.content as string)
        assert.equal(parsed.error, 'Invalid input')
    })

    test('should use custom status code', ({ assert }) => {
        const response = errorResponse('Bad request', 400)

        assert.equal(response.status, 400)
    })

    test('should handle non-string/non-Error values', ({ assert }) => {
        const response = errorResponse(42)

        const parsed = JSON.parse(response.content as string)
        assert.equal(parsed.error, '42')
    })

    test('should handle null/undefined', ({ assert }) => {
        const responseNull = errorResponse(null)
        const responseUndefined = errorResponse(undefined)

        assert.equal(JSON.parse(responseNull.content as string).error, 'null')
        assert.equal(JSON.parse(responseUndefined.content as string).error, 'undefined')
    })
})

test.group('badRequestResponse', () => {
    test('should create 400 response with message', ({ assert }) => {
        const response = badRequestResponse('Missing required fields')

        assert.equal(response.status, 400)
        const parsed = JSON.parse(response.content as string)
        assert.equal(parsed.error, 'Missing required fields')
    })
})

test.group('unauthorizedResponse', () => {
    test('should create 401 response with default message', ({ assert }) => {
        const response = unauthorizedResponse()

        assert.equal(response.status, 401)
        const parsed = JSON.parse(response.content as string)
        assert.equal(parsed.error, 'Authentication required')
    })

    test('should create 401 response with custom message', ({ assert }) => {
        const response = unauthorizedResponse('Invalid token')

        assert.equal(response.status, 401)
        const parsed = JSON.parse(response.content as string)
        assert.equal(parsed.error, 'Invalid token')
    })
})

test.group('forbiddenResponse', () => {
    test('should create 403 response', ({ assert }) => {
        const response = forbiddenResponse('Access denied')

        assert.equal(response.status, 403)
        const parsed = JSON.parse(response.content as string)
        assert.equal(parsed.error, 'Access denied')
    })
})

test.group('notFoundResponse', () => {
    test('should create 404 response with default message', ({ assert }) => {
        const response = notFoundResponse()

        assert.equal(response.status, 404)
        const parsed = JSON.parse(response.content as string)
        assert.equal(parsed.error, 'Resource not found')
    })

    test('should create 404 response with custom message', ({ assert }) => {
        const response = notFoundResponse('Asset not found')

        assert.equal(response.status, 404)
        const parsed = JSON.parse(response.content as string)
        assert.equal(parsed.error, 'Asset not found')
    })
})

test.group('textResponse', () => {
    test('should create plain text response', ({ assert }) => {
        const response = textResponse(200, 'Hello World')

        assert.equal(response.status, 200)
        assert.equal(response.content, 'Hello World')
        assert.equal(response.headers?.['Content-Type'], 'text/plain')
    })

    test('should work with different status codes', ({ assert }) => {
        const response = textResponse(404, 'Not found')

        assert.equal(response.status, 404)
        assert.equal(response.content, 'Not found')
    })
})

test.group('fileResponse', () => {
    test('should create file response without filename', ({ assert }) => {
        const content = Buffer.from('file content')
        const response = fileResponse(content, 'application/octet-stream')

        assert.equal(response.status, 200)
        assert.deepEqual(response.content, content)
        assert.equal(response.headers?.['Content-Type'], 'application/octet-stream')
        assert.isUndefined(response.headers?.['Content-Disposition'])
    })

    test('should create file response with filename (download)', ({ assert }) => {
        const content = Buffer.from('file content')
        const response = fileResponse(content, 'model/gltf-binary', 'model.glb')

        assert.equal(response.status, 200)
        assert.equal(response.headers?.['Content-Type'], 'model/gltf-binary')
        assert.equal(response.headers?.['Content-Disposition'], 'attachment; filename="model.glb"')
    })

    test('should handle various content types', ({ assert }) => {
        const imageResponse = fileResponse(Buffer.from(''), 'image/png')
        const pdfResponse = fileResponse(Buffer.from(''), 'application/pdf')

        assert.equal(imageResponse.headers?.['Content-Type'], 'image/png')
        assert.equal(pdfResponse.headers?.['Content-Type'], 'application/pdf')
    })
})

test.group('multiStatusResponse', () => {
    test('should create 207 response for batch operations', ({ assert }) => {
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

    test('should handle empty results', ({ assert }) => {
        const response = multiStatusResponse('No operations', [])

        const parsed = JSON.parse(response.content as string)
        assert.deepEqual(parsed.results, [])
    })
})
