import { test } from '@japa/runner'
import { HelloHandler } from './hello_handler.js'

test.group('HelloHandler', () => {
    test('exposes sayHi endpoint correctly', async ({ assert }) => {
        const handler = new HelloHandler()
        const endpoints = handler.getEndpoints()

        assert.lengthOf(endpoints, 1)

        const endpoint = endpoints[0]
        assert.equal(endpoint.path, '/hi/:name')
        assert.equal(endpoint.method, 'GET')
        assert.equal(endpoint.responseType, 'text/plain')

        const response = await endpoint.handler({ name: 'Alice' })
        assert.equal(response.status, 200)
        assert.equal(response.content, 'Hello, Alice!')
    })
})
