import { test } from '@japa/runner'
import { CalculatorHandler } from './helpers/test_components.js'
import type { TypedRequest } from '@digitaltwin/shared'

test.group('Handler E2E', () => {
    const handler = new CalculatorHandler()

    test('exposes declared endpoints', ({ assert }) => {
        const endpoints = handler.getEndpoints()
        assert.isAbove(endpoints.length, 0)

        const paths = endpoints.map(e => e.path)
        assert.include(paths, '/e2e-calculator/sum')
        assert.include(paths, '/e2e-calculator/health')
    })

    test('calculateSum returns computed response', async ({ assert }) => {
        const fakeReq = {
            body: { a: 10, b: 32 },
            headers: {},
            params: {},
            query: {},
        } as unknown as TypedRequest

        const endpoints = handler.getEndpoints()
        const sumEndpoint = endpoints.find(e => e.path === '/e2e-calculator/sum')!

        const response = await sumEndpoint.handler(fakeReq)
        assert.equal(response.status, 200)

        const parsed = JSON.parse(response.content as string)
        assert.equal(parsed.result, 42)
    })

    test('healthCheck is stateless', async ({ assert }) => {
        const endpoints = handler.getEndpoints()
        const healthEndpoint = endpoints.find(e => e.path === '/e2e-calculator/health')!

        const response = await healthEndpoint.handler()
        assert.equal(response.status, 200)

        const parsed = JSON.parse(response.content as string)
        assert.equal(parsed.status, 'ok')
    })
})
