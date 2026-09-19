import { test } from '@japa/runner'
import { servableEndpoint } from '@cepseudo/shared'
import type { ComponentConfiguration, DataResponse } from '@cepseudo/shared'
import { Handler } from '../src/handler.js'

class PingHandler extends Handler {
    getConfiguration(): ComponentConfiguration {
        return { name: 'ping', description: 'Ping handler', contentType: 'application/json' }
    }

    @servableEndpoint({ path: '/ping', method: 'post' })
    async ping(): Promise<DataResponse> {
        return { status: 200, content: 'pong' }
    }
}

test.group('Handler', () => {
    test('exposes methods decorated with @servableEndpoint', ({ assert }) => {
        const endpoints = new PingHandler().getEndpoints()

        assert.lengthOf(endpoints, 1)
        assert.equal(endpoints[0].method, 'POST')
        assert.equal(endpoints[0].path, '/ping')
        assert.equal(endpoints[0].responseType, 'application/json')
    })
})
