import { test } from '@japa/runner'
import { LogLevel } from '@cepseudo/shared'
import type { EngineOptions } from '../src/digital_twin_engine.js'
import { DigitalTwinEngine } from '../src/digital_twin_engine.js'
import { TestHandler } from './fixtures/mock_components.js'
import { MockDatabaseAdapter } from './fixtures/mock_database.js'
import { MockStorageService } from './fixtures/mock_storage.js'

function createEngine(options: Partial<EngineOptions> = {}): DigitalTwinEngine {
    return new DigitalTwinEngine({
        database: new MockDatabaseAdapter(),
        storage: new MockStorageService(),
        logging: { level: LogLevel.SILENT },
        server: { port: 0 },
        ...options
    })
}

async function withEngine(options: Partial<EngineOptions>, run: (engine: DigitalTwinEngine) => Promise<void>): Promise<void> {
    const engine = createEngine(options)
    await engine.start()
    try {
        await run(engine)
    } finally {
        await engine.stop()
    }
}

test.group('Engine HTTP server', () => {
    test('health and queue routes answer through inject() without a fixed port', async ({ assert }) => {
        await withEngine({}, async engine => {
            const live = await engine.inject('/api/health/live')
            assert.equal(live.statusCode, 200)
            assert.equal((live.json() as { status: string }).status, 'ok')

            const ready = await engine.inject('/api/health/ready')
            assert.equal(ready.statusCode, 200)

            const health = await engine.inject('/api/health')
            assert.equal(health.statusCode, 200)
            assert.property(health.json(), 'checks')

            const stats = await engine.inject('/api/queues/stats')
            assert.equal(stats.statusCode, 200)
            assert.deepEqual(stats.json(), {
                collectors: { status: 'No collectors configured' },
                harvesters: { status: 'No harvesters configured' }
            })
        })
    })

    test('component endpoints are served and unknown routes give 404', async ({ assert }) => {
        const handler = new TestHandler('h', [
            { method: 'get', path: '/hello', handler: async () => ({ status: 200, content: 'hi' }) }
        ])
        await withEngine({ handlers: [handler] }, async engine => {
            assert.equal((await engine.inject('/hello')).body, 'hi')
            assert.equal((await engine.inject('/hello/')).statusCode, 200)
            assert.equal((await engine.inject('/nope')).statusCode, 404)
        })
    })

    test('getPort() reflects the bound socket and clears after stop()', async ({ assert }) => {
        const engine = createEngine()
        assert.isUndefined(engine.getPort())

        await engine.start()
        const port = engine.getPort()
        assert.isNumber(port)
        assert.isAbove(port!, 0)

        const res = await fetch(`http://127.0.0.1:${port}/api/health/live`)
        assert.equal(res.status, 200)

        await engine.stop()
        assert.isUndefined(engine.getPort())
        await assert.rejects(() => fetch(`http://127.0.0.1:${port}/api/health/live`))
    })

    test('plugins run before the server listens and can register routes', async ({ assert }) => {
        let sawAuth = false
        await withEngine({
            plugins: [
                engine => {
                    sawAuth = engine.getAuthMiddleware() !== undefined
                    engine.getRouter().get('/plugin/:id', async (req, res) => {
                        res.status(201).setHeader('Location', `/plugin/${req.params.id}`).json({ id: req.params.id, q: req.query.q })
                    })
                    engine.getRouter().delete('/plugin/:id', async (_req, res) => {
                        res.status(204).end()
                    })
                }
            ]
        }, async engine => {
            assert.isTrue(sawAuth)
            const res = await engine.inject('/plugin/7?q=x')
            assert.equal(res.statusCode, 201)
            assert.equal(res.headers['location'], '/plugin/7')
            assert.deepEqual(res.json(), { id: '7', q: 'x' })
            assert.equal((await engine.inject({ method: 'DELETE', url: '/plugin/7' })).statusCode, 204)
        })
    })

    test('body limit from options rejects oversized JSON with 413', async ({ assert }) => {
        const handler = new TestHandler('h', [{ method: 'post', path: '/in', handler: async () => ({ status: 200, content: '' }) }])
        await withEngine({ handlers: [handler], server: { port: 0, bodyLimit: 64 } }, async engine => {
            const small = await engine.inject({ method: 'POST', url: '/in', payload: { a: 1 } })
            assert.equal(small.statusCode, 200)
            const big = await engine.inject({ method: 'POST', url: '/in', payload: { a: 'x'.repeat(100) } })
            assert.equal(big.statusCode, 413)
        })
    })
})

test.group('Engine CORS', group => {
    group.each.teardown(() => {
        delete process.env.CORS_ORIGIN
    })

    test('without CORS_ORIGIN every origin is allowed but credentials are not', async ({ assert }) => {
        await withEngine({}, async engine => {
            const res = await engine.inject({ url: '/api/health/live', headers: { origin: 'https://evil.example' } })
            assert.equal(res.headers['access-control-allow-origin'], 'https://evil.example')
            assert.isUndefined(res.headers['access-control-allow-credentials'])
        })
    })

    test('CORS_ORIGIN is a comma-separated allowlist that enables credentials', async ({ assert }) => {
        process.env.CORS_ORIGIN = 'https://a.example, https://b.example'
        await withEngine({}, async engine => {
            const allowed = await engine.inject({ url: '/api/health/live', headers: { origin: 'https://b.example' } })
            assert.equal(allowed.headers['access-control-allow-origin'], 'https://b.example')
            assert.equal(allowed.headers['access-control-allow-credentials'], 'true')

            const denied = await engine.inject({ url: '/api/health/live', headers: { origin: 'https://evil.example' } })
            assert.isUndefined(denied.headers['access-control-allow-origin'])
        })
    })
})

test.group('Engine compression', group => {
    group.each.teardown(() => {
        delete process.env.DIGITALTWIN_ENABLE_COMPRESSION
    })

    const bigHandler = () => new TestHandler('h', [
        { method: 'get', path: '/big', handler: async () => ({ status: 200, content: 'x'.repeat(4096), headers: { 'Content-Type': 'text/plain' } }) }
    ])

    test('responses are not compressed by default', async ({ assert }) => {
        await withEngine({ handlers: [bigHandler()] }, async engine => {
            const res = await engine.inject({ url: '/big', headers: { 'accept-encoding': 'gzip' } })
            assert.isUndefined(res.headers['content-encoding'])
        })
    })

    test('DIGITALTWIN_ENABLE_COMPRESSION=true gzips large responses', async ({ assert }) => {
        process.env.DIGITALTWIN_ENABLE_COMPRESSION = 'true'
        await withEngine({ handlers: [bigHandler()] }, async engine => {
            const res = await engine.inject({ url: '/big', headers: { 'accept-encoding': 'gzip' } })
            assert.equal(res.headers['content-encoding'], 'gzip')
        })
    })
})
