import { test } from '@japa/runner'
import { servableEndpoint } from '../../src/utils/servable_endpoint.js'

test.group('servableEndpoint decorator', () => {
    test('should attach endpoint metadata to class constructor', ({ assert }) => {
        class TestClass {
            @servableEndpoint({ path: '/test', method: 'get' })
            async handleGet() {
                return { status: 200, content: 'ok' }
            }
        }

        const ctor = TestClass as any
        assert.isDefined(ctor.__endpoints)
        assert.isArray(ctor.__endpoints)
        assert.equal(ctor.__endpoints.length, 1)
    })

    test('should store correct path', ({ assert }) => {
        class TestClass {
            @servableEndpoint({ path: '/api/data', method: 'get' })
            async handler() {
                return { status: 200, content: '' }
            }
        }

        const endpoints = (TestClass as any).__endpoints
        assert.equal(endpoints[0].path, '/api/data')
    })

    test('should uppercase the HTTP method', ({ assert }) => {
        class TestClass {
            @servableEndpoint({ path: '/test', method: 'post' })
            async handler() {
                return { status: 200, content: '' }
            }
        }

        const endpoints = (TestClass as any).__endpoints
        assert.equal(endpoints[0].method, 'POST')
    })

    test('should default method to GET when not specified', ({ assert }) => {
        class TestClass {
            @servableEndpoint({ path: '/test' })
            async handler() {
                return { status: 200, content: '' }
            }
        }

        const endpoints = (TestClass as any).__endpoints
        assert.equal(endpoints[0].method, 'GET')
    })

    test('should store responseType when provided', ({ assert }) => {
        class TestClass {
            @servableEndpoint({ path: '/test', method: 'get', responseType: 'text/plain' })
            async handler() {
                return { status: 200, content: '' }
            }
        }

        const endpoints = (TestClass as any).__endpoints
        assert.equal(endpoints[0].responseType, 'text/plain')
    })

    test('should leave responseType undefined when not provided', ({ assert }) => {
        class TestClass {
            @servableEndpoint({ path: '/test', method: 'get' })
            async handler() {
                return { status: 200, content: '' }
            }
        }

        const endpoints = (TestClass as any).__endpoints
        assert.isUndefined(endpoints[0].responseType)
    })

    test('should store handler method name', ({ assert }) => {
        class TestClass {
            @servableEndpoint({ path: '/test', method: 'get' })
            async myCustomHandler() {
                return { status: 200, content: '' }
            }
        }

        const endpoints = (TestClass as any).__endpoints
        assert.equal(endpoints[0].handlerName, 'myCustomHandler')
    })

    test('should support multiple endpoints on same class', ({ assert }) => {
        class TestClass {
            @servableEndpoint({ path: '/get', method: 'get' })
            async handleGet() {
                return { status: 200, content: '' }
            }

            @servableEndpoint({ path: '/post', method: 'post' })
            async handlePost() {
                return { status: 201, content: '' }
            }

            @servableEndpoint({ path: '/delete', method: 'delete' })
            async handleDelete() {
                return { status: 204, content: '' }
            }
        }

        const endpoints = (TestClass as any).__endpoints
        assert.equal(endpoints.length, 3)

        const paths = endpoints.map((ep: any) => ep.path)
        assert.include(paths, '/get')
        assert.include(paths, '/post')
        assert.include(paths, '/delete')
    })

    test('should support all HTTP methods', ({ assert }) => {
        class TestClass {
            @servableEndpoint({ path: '/get', method: 'get' })
            async get() { return { status: 200, content: '' } }

            @servableEndpoint({ path: '/post', method: 'post' })
            async post() { return { status: 200, content: '' } }

            @servableEndpoint({ path: '/put', method: 'put' })
            async put() { return { status: 200, content: '' } }

            @servableEndpoint({ path: '/patch', method: 'patch' })
            async patch() { return { status: 200, content: '' } }

            @servableEndpoint({ path: '/delete', method: 'delete' })
            async del() { return { status: 200, content: '' } }
        }

        const endpoints = (TestClass as any).__endpoints
        const methods = endpoints.map((ep: any) => ep.method)

        assert.include(methods, 'GET')
        assert.include(methods, 'POST')
        assert.include(methods, 'PUT')
        assert.include(methods, 'PATCH')
        assert.include(methods, 'DELETE')
    })

    test('should support parametrized routes', ({ assert }) => {
        class TestClass {
            @servableEndpoint({ path: '/users/:id', method: 'get' })
            async getUser() {
                return { status: 200, content: '' }
            }

            @servableEndpoint({ path: '/users/:userId/posts/:postId', method: 'get' })
            async getUserPost() {
                return { status: 200, content: '' }
            }
        }

        const endpoints = (TestClass as any).__endpoints
        assert.equal(endpoints[0].path, '/users/:id')
        assert.equal(endpoints[1].path, '/users/:userId/posts/:postId')
    })

    test('should not modify the original method', ({ assert }) => {
        class TestClass {
            @servableEndpoint({ path: '/test', method: 'get' })
            async handler() {
                return { status: 200, content: 'original' }
            }
        }

        const instance = new TestClass()
        const result = instance.handler()

        assert.isDefined(result)
        assert.isTrue(result instanceof Promise)
    })

    test('endpoints should be independent between classes', ({ assert }) => {
        class ClassA {
            @servableEndpoint({ path: '/a', method: 'get' })
            async handler() {
                return { status: 200, content: '' }
            }
        }

        class ClassB {
            @servableEndpoint({ path: '/b', method: 'post' })
            async handler() {
                return { status: 200, content: '' }
            }
        }

        const endpointsA = (ClassA as any).__endpoints
        const endpointsB = (ClassB as any).__endpoints

        assert.equal(endpointsA.length, 1)
        assert.equal(endpointsB.length, 1)
        assert.equal(endpointsA[0].path, '/a')
        assert.equal(endpointsB[0].path, '/b')
    })

    test('should handle various response types', ({ assert }) => {
        class TestClass {
            @servableEndpoint({ path: '/json', responseType: 'application/json' })
            async json() { return { status: 200, content: '' } }

            @servableEndpoint({ path: '/text', responseType: 'text/plain' })
            async text() { return { status: 200, content: '' } }

            @servableEndpoint({ path: '/html', responseType: 'text/html' })
            async html() { return { status: 200, content: '' } }

            @servableEndpoint({ path: '/binary', responseType: 'application/octet-stream' })
            async binary() { return { status: 200, content: '' } }
        }

        const endpoints = (TestClass as any).__endpoints
        const types = endpoints.map((ep: any) => ep.responseType)

        assert.include(types, 'application/json')
        assert.include(types, 'text/plain')
        assert.include(types, 'text/html')
        assert.include(types, 'application/octet-stream')
    })
})
