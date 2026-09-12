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

test.group('servableEndpoint decorator - inheritance', () => {
    class Base {
        @servableEndpoint({ path: '/base' })
        async base() { return { status: 200, content: '' } }
    }

    class A extends Base {
        @servableEndpoint({ path: '/a' })
        async a() { return { status: 200, content: '' } }
    }

    class B extends Base {
        @servableEndpoint({ path: '/b', method: 'post' })
        async b() { return { status: 200, content: '' } }
    }

    class Plain extends Base {}

    const paths = (cls: unknown) => ((cls as any).__endpoints as Array<{ path: string }>).map(ep => ep.path)

    test('each subclass sees its own endpoints plus the inherited ones, once', ({ assert }) => {
        assert.deepEqual(paths(Base), ['/base'])
        assert.deepEqual(paths(A), ['/base', '/a'])
        assert.deepEqual(paths(B), ['/base', '/b'])
    })

    test('the parent array is never mutated by a subclass', ({ assert }) => {
        assert.notStrictEqual((A as any).__endpoints, (Base as any).__endpoints)
        assert.notStrictEqual((B as any).__endpoints, (Base as any).__endpoints)
        assert.notStrictEqual((A as any).__endpoints, (B as any).__endpoints)
    })

    test('a subclass without decorators inherits the parent endpoints', ({ assert }) => {
        assert.deepEqual(paths(Plain), ['/base'])
    })
})
