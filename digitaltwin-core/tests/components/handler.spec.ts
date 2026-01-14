import { test } from '@japa/runner'
import { Handler } from '../../src/components/handler.js'
import { servableEndpoint } from '../../src/utils/servable_endpoint.js'
import type { ComponentConfiguration } from '../../src/components/types.js'
import type { DataResponse } from '../../src/components/types.js'

// Test implementation of Handler
class TestHandler extends Handler {
    getConfiguration(): ComponentConfiguration {
        return {
            name: 'test-handler',
            type: 'handler',
            contentType: 'application/json'
        }
    }

    @servableEndpoint({ path: '/api/test', method: 'get' })
    async handleGet(req: any): Promise<DataResponse> {
        return {
            status: 200,
            content: JSON.stringify({ message: 'GET response' }),
            headers: { 'Content-Type': 'application/json' }
        }
    }

    @servableEndpoint({ path: '/api/test', method: 'post', responseType: 'text/plain' })
    async handlePost(req: any): Promise<DataResponse> {
        return {
            status: 201,
            content: `Created: ${req.body?.name || 'unknown'}`,
            headers: { 'Content-Type': 'text/plain' }
        }
    }
}

// Handler without any endpoints
class EmptyHandler extends Handler {
    getConfiguration(): ComponentConfiguration {
        return {
            name: 'empty-handler',
            type: 'handler',
            contentType: 'application/json'
        }
    }
}

// Handler with multiple endpoints of different methods
class MultiMethodHandler extends Handler {
    getConfiguration(): ComponentConfiguration {
        return {
            name: 'multi-method-handler',
            type: 'handler',
            contentType: 'application/json'
        }
    }

    @servableEndpoint({ path: '/api/items', method: 'get' })
    async listItems(): Promise<DataResponse> {
        return { status: 200, content: '[]' }
    }

    @servableEndpoint({ path: '/api/items/:id', method: 'get' })
    async getItem(req: any): Promise<DataResponse> {
        return { status: 200, content: JSON.stringify({ id: req.params?.id }) }
    }

    @servableEndpoint({ path: '/api/items', method: 'post' })
    async createItem(): Promise<DataResponse> {
        return { status: 201, content: '{}' }
    }

    @servableEndpoint({ path: '/api/items/:id', method: 'put' })
    async updateItem(): Promise<DataResponse> {
        return { status: 200, content: '{}' }
    }

    @servableEndpoint({ path: '/api/items/:id', method: 'delete' })
    async deleteItem(): Promise<DataResponse> {
        return { status: 204, content: '' }
    }
}

test.group('Handler base class', () => {
    test('should return configuration correctly', ({ assert }) => {
        const handler = new TestHandler()
        const config = handler.getConfiguration()

        assert.equal(config.name, 'test-handler')
        assert.equal(config.type, 'handler')
        assert.equal(config.contentType, 'application/json')
    })

    test('should return endpoints from decorated methods', ({ assert }) => {
        const handler = new TestHandler()
        const endpoints = handler.getEndpoints()

        assert.equal(endpoints.length, 2)
    })

    test('should have correct endpoint metadata', ({ assert }) => {
        const handler = new TestHandler()
        const endpoints = handler.getEndpoints()

        const getEndpoint = endpoints.find(ep => ep.method === 'GET')
        const postEndpoint = endpoints.find(ep => ep.method === 'POST')

        assert.isDefined(getEndpoint)
        assert.isDefined(postEndpoint)

        assert.equal(getEndpoint!.path, '/api/test')
        assert.equal(getEndpoint!.method, 'GET')
        assert.equal(getEndpoint!.responseType, 'application/json') // Inherits from config

        assert.equal(postEndpoint!.path, '/api/test')
        assert.equal(postEndpoint!.method, 'POST')
        assert.equal(postEndpoint!.responseType, 'text/plain') // Custom override
    })

    test('endpoint handlers should be callable functions', async ({ assert }) => {
        const handler = new TestHandler()
        const endpoints = handler.getEndpoints()

        const getEndpoint = endpoints.find(ep => ep.method === 'GET')
        assert.isDefined(getEndpoint)
        assert.isFunction(getEndpoint!.handler)

        const response = await getEndpoint!.handler({})
        assert.equal(response.status, 200)
        assert.include(response.content as string, 'GET response')
    })

    test('endpoint handlers should receive request object', async ({ assert }) => {
        const handler = new TestHandler()
        const endpoints = handler.getEndpoints()

        const postEndpoint = endpoints.find(ep => ep.method === 'POST')
        assert.isDefined(postEndpoint)

        const response = await postEndpoint!.handler({ body: { name: 'TestItem' } })
        assert.equal(response.status, 201)
        assert.include(response.content as string, 'TestItem')
    })
})

test.group('Handler without endpoints', () => {
    test('should return empty endpoints array', ({ assert }) => {
        const handler = new EmptyHandler()
        const endpoints = handler.getEndpoints()

        assert.isArray(endpoints)
        assert.equal(endpoints.length, 0)
    })
})

test.group('Handler with multiple methods', () => {
    test('should support all HTTP methods', ({ assert }) => {
        const handler = new MultiMethodHandler()
        const endpoints = handler.getEndpoints()

        assert.equal(endpoints.length, 5)

        const methods = endpoints.map(ep => ep.method)
        assert.include(methods, 'GET')
        assert.include(methods, 'POST')
        assert.include(methods, 'PUT')
        assert.include(methods, 'DELETE')
    })

    test('should support parametrized routes', ({ assert }) => {
        const handler = new MultiMethodHandler()
        const endpoints = handler.getEndpoints()

        const paramEndpoints = endpoints.filter(ep => ep.path.includes(':id'))
        assert.equal(paramEndpoints.length, 3) // get/:id, put/:id, delete/:id
    })

    test('each endpoint handler should be bound to the instance', async ({ assert }) => {
        const handler = new MultiMethodHandler()
        const endpoints = handler.getEndpoints()

        // All handlers should work correctly (bound to instance)
        for (const endpoint of endpoints) {
            const response = await endpoint.handler({ params: { id: '123' } })
            assert.isNumber(response.status)
        }
    })
})

test.group('Handler instances are independent', () => {
    test('multiple handler instances should not share state', ({ assert }) => {
        const handler1 = new TestHandler()
        const handler2 = new TestHandler()

        const endpoints1 = handler1.getEndpoints()
        const endpoints2 = handler2.getEndpoints()

        // Same number of endpoints
        assert.equal(endpoints1.length, endpoints2.length)

        // But different handler function references (bound to different instances)
        assert.notStrictEqual(endpoints1[0].handler, endpoints2[0].handler)
    })
})
