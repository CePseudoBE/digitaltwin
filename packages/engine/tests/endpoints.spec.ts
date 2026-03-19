import { test } from '@japa/runner'
import { exposeEndpoints } from '../src/endpoints.js'
import { TestCollector, TestHarvester, TestHandler } from './fixtures/mock_components.js'

class MockRouter {
    public routes: Array<{ method: string; path: string; handler: Function }> = []
    get(path: string, handler: Function) { this.routes.push({ method: 'get', path, handler }) }
    post(path: string, handler: Function) { this.routes.push({ method: 'post', path, handler }) }
    put(path: string, handler: Function) { this.routes.push({ method: 'put', path, handler }) }
    delete(path: string, handler: Function) { this.routes.push({ method: 'delete', path, handler }) }
    patch(path: string, handler: Function) { this.routes.push({ method: 'patch', path, handler }) }
}

class MockResponse {
    private _status = 200
    private _headers: Record<string, string> = {}
    public sentContent: any = null

    status(code: number) { this._status = code; return this }
    header(headers: Record<string, string>) { this._headers = { ...this._headers, ...headers }; return this }
    send(content: any) { this.sentContent = content; return this }
    getStatus() { return this._status }
    getHeaders() { return this._headers }
}

test.group('exposeEndpoints', () => {
    test('registers component endpoints on the router', async ({ assert }) => {
        const router = new MockRouter()
        const collector = new TestCollector('c1', [
            { method: 'get', path: '/data', handler: async () => ({ status: 200, content: 'ok' }) }
        ])
        const handler = new TestHandler('h1', [
            { method: 'post', path: '/action', handler: async () => ({ status: 201, content: 'created' }) },
            { method: 'delete', path: '/action/:id', handler: async () => ({ status: 204, content: '' }) }
        ])

        await exposeEndpoints(router as any, [collector, handler])

        assert.lengthOf(router.routes, 3)
        assert.equal(router.routes[0].path, '/data')
        assert.equal(router.routes[0].method, 'get')
        assert.equal(router.routes[1].path, '/action')
        assert.equal(router.routes[1].method, 'post')
        assert.equal(router.routes[2].path, '/action/:id')
        assert.equal(router.routes[2].method, 'delete')
    })

    test('normalizes HTTP methods to lowercase', async ({ assert }) => {
        const router = new MockRouter()
        const handler = new TestHandler('h', [
            { method: 'GET' as any, path: '/upper', handler: async () => ({ status: 200, content: '' }) }
        ])

        await exposeEndpoints(router as any, [handler])

        assert.equal(router.routes[0].method, 'get')
    })

    test('passes request to component handler and sends response', async ({ assert }) => {
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
        await router.routes[0].handler(req, res)

        assert.deepEqual(receivedReq.params, { id: '5' })
        assert.equal(res.getStatus(), 201)
        assert.equal(res.getHeaders()['X-Custom'], 'val')
        assert.deepEqual(res.sentContent, { ok: true })
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
        await exposeEndpoints(router as any, [new TestCollector('empty', [])])
        assert.lengthOf(router.routes, 0)
    })
})
