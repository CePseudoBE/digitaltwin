import { test } from '@japa/runner'
import { servableEndpoint } from '../../src/utils/servable_endpoint.js'

test.group('servableEndpoint decorator', () => {
    test('defaults to GET when method is not specified', ({ assert }) => {
        class TestClass {
            @servableEndpoint({ path: '/status' })
            async handler() { return { status: 200, content: 'ok' } }
        }

        const endpoints = (TestClass as any).__endpoints
        assert.equal(endpoints[0].method, 'GET')
    })

    test('normalizes method to uppercase', ({ assert }) => {
        class TestClass {
            @servableEndpoint({ path: '/data', method: 'post' })
            async handler() { return { status: 201, content: '' } }
        }

        assert.equal((TestClass as any).__endpoints[0].method, 'POST')
    })

    test('stores the handler method name for later dispatch', ({ assert }) => {
        class TestClass {
            @servableEndpoint({ path: '/users', method: 'get' })
            async listUsers() { return { status: 200, content: '' } }
        }

        assert.equal((TestClass as any).__endpoints[0].handlerName, 'listUsers')
    })

    test('accumulates multiple endpoints on the same class', ({ assert }) => {
        class ApiHandler {
            @servableEndpoint({ path: '/items', method: 'get' })
            async list() { return { status: 200, content: '' } }

            @servableEndpoint({ path: '/items', method: 'post' })
            async create() { return { status: 201, content: '' } }

            @servableEndpoint({ path: '/items/:id', method: 'delete' })
            async remove() { return { status: 204, content: '' } }
        }

        const endpoints = (ApiHandler as any).__endpoints
        assert.equal(endpoints.length, 3)

        const methods = endpoints.map((ep: any) => ep.method)
        assert.includeMembers(methods, ['GET', 'POST', 'DELETE'])
    })

    test('endpoints are isolated between different classes', ({ assert }) => {
        class ClassA {
            @servableEndpoint({ path: '/a', method: 'get' })
            async handler() { return { status: 200, content: '' } }
        }

        class ClassB {
            @servableEndpoint({ path: '/b', method: 'post' })
            async handler() { return { status: 200, content: '' } }
        }

        assert.equal((ClassA as any).__endpoints.length, 1)
        assert.equal((ClassB as any).__endpoints.length, 1)
        assert.equal((ClassA as any).__endpoints[0].path, '/a')
        assert.equal((ClassB as any).__endpoints[0].path, '/b')
    })

    test('does not alter the decorated method behavior', async ({ assert }) => {
        class TestClass {
            @servableEndpoint({ path: '/test', method: 'get' })
            async handler() {
                return { status: 200, content: 'original' }
            }
        }

        const instance = new TestClass()
        const result = await instance.handler()
        assert.equal(result.content, 'original')
    })
})
