import { test } from '@japa/runner'
import { exposeEndpoints } from '../src/endpoints.js'
import { TestCollector, TestHarvester, TestHandler } from './fixtures/mock_components.js'

class MockRouter {
    private routes = new Map<string, (req: any, res: any) => Promise<void>>()

    private reg(method: string, path: string, handler: (req: any, res: any) => Promise<void>) {
        this.routes.set(`${method.toUpperCase()} ${path}`, handler)
    }

    get(path: string, handler: (req: any, res: any) => any) { this.reg('GET', path, handler) }
    post(path: string, handler: (req: any, res: any) => any) { this.reg('POST', path, handler) }
    put(path: string, handler: (req: any, res: any) => any) { this.reg('PUT', path, handler) }
    delete(path: string, handler: (req: any, res: any) => any) { this.reg('DELETE', path, handler) }
    patch(path: string, handler: (req: any, res: any) => any) { this.reg('PATCH', path, handler) }

    async invoke(method: string, path: string, req: any, res: any): Promise<void> {
        const handler = this.routes.get(`${method.toUpperCase()} ${path}`)
        if (!handler) throw new Error(`No handler registered: ${method.toUpperCase()} ${path}`)
        await handler(req, res)
    }
}

class MockResponse {
    statusCode = 200
    body: any = null
    headers: Record<string, string> = {}

    status(code: number) { this.statusCode = code; return this }
    header(h: Record<string, string>) { this.headers = { ...this.headers, ...h }; return this }
    send(content: any) { this.body = content; return this }
}

test.group('exposeEndpoints', () => {
    test('all component endpoints are reachable and return the configured response', async ({ assert }) => {
        const router = new MockRouter()
        const collector = new TestCollector('c1', [
            { method: 'get', path: '/data', handler: async () => ({ status: 200, content: { ok: true } }) }
        ])
        const handler = new TestHandler('h1', [
            { method: 'post', path: '/action', handler: async () => ({ status: 201, content: 'created' }) },
            { method: 'delete', path: '/action/:id', handler: async () => ({ status: 204, content: '' }) }
        ])

        await exposeEndpoints(router as any, [collector, handler])

        const getRes = new MockResponse()
        await router.invoke('GET', '/data', {}, getRes)
        assert.equal(getRes.statusCode, 200)
        assert.deepEqual(getRes.body, { ok: true })

        const postRes = new MockResponse()
        await router.invoke('POST', '/action', {}, postRes)
        assert.equal(postRes.statusCode, 201)
        assert.equal(postRes.body, 'created')

        const deleteRes = new MockResponse()
        await router.invoke('DELETE', '/action/:id', {}, deleteRes)
        assert.equal(deleteRes.statusCode, 204)
    })

    test('component endpoint defined with uppercase method is reachable', async ({ assert }) => {
        const router = new MockRouter()
        const handler = new TestHandler('h', [
            { method: 'GET' as any, path: '/upper', handler: async () => ({ status: 200, content: 'upper works' }) }
        ])

        await exposeEndpoints(router as any, [handler])

        const res = new MockResponse()
        await router.invoke('GET', '/upper', {}, res)
        assert.equal(res.statusCode, 200)
        assert.equal(res.body, 'upper works')
    })

    test('passes request data to component handler', async ({ assert }) => {
        const router = new MockRouter()
        let receivedReq: any = null

        const handler = new TestHandler('h', [{
            method: 'post',
            path: '/test',
            handler: async (req: any) => {
                receivedReq = req
                return { status: 201, headers: { 'X-Custom': 'val' }, content: { ok: true } }
            }
        }])

        await exposeEndpoints(router as any, [handler])

        const req = { params: { id: '5' }, body: { name: 'x' } }
        const res = new MockResponse()
        await router.invoke('POST', '/test', req, res)

        assert.deepEqual(receivedReq.params, { id: '5' })
        assert.equal(res.statusCode, 201)
        assert.equal(res.headers['X-Custom'], 'val')
        assert.deepEqual(res.body, { ok: true })
    })

    test('throws for unsupported HTTP methods', async ({ assert }) => {
        const router = new MockRouter()
        const handler = new TestHandler('h', [
            { method: 'TRACE' as any, path: '/x', handler: async () => ({ status: 200, content: '' }) }
        ])

        await assert.rejects(
            () => exposeEndpoints(router as any, [handler]),
            /Unsupported HTTP method/
        )
    })

    test('handles components with no endpoints', async ({ assert }) => {
        const router = new MockRouter()
        await assert.doesNotReject(() => exposeEndpoints(router as any, [new TestCollector('empty', [])]))
    })
})
