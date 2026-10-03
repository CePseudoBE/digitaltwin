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

class ReportHandler extends Handler {
    getConfiguration(): ComponentConfiguration {
        return { name: 'report', description: 'Report handler', contentType: 'application/json' }
    }

    @servableEndpoint({ path: '/report.csv', responseType: 'text/csv' })
    async csv(): Promise<DataResponse> {
        return { status: 200, content: 'a,b' }
    }

    @servableEndpoint({ path: '/report' })
    async json(): Promise<DataResponse> {
        return { status: 200, content: '{}' }
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

    test('an endpoint declaring its own responseType overrides the configuration contentType', ({ assert }) => {
        const responseTypes = Object.fromEntries(new ReportHandler().getEndpoints().map(ep => [ep.path, ep.responseType]))

        assert.deepEqual(responseTypes, { '/report.csv': 'text/csv', '/report': 'application/json' })
    })
})
