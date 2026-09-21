import { test } from '@japa/runner'
import Fastify from 'fastify'
import type { FastifyInstance } from 'fastify'
import fs from 'node:fs/promises'
import { Type } from 'typebox'
import { NotFoundError } from '@cepseudo/shared'
import type { TypedRequest } from '@cepseudo/shared'
import { exposeEndpoints } from '../src/endpoints.js'
import type { ExposeEndpointsOptions } from '../src/endpoints.js'
import { registerErrorHandler } from '../src/error_handler.js'
import { MapManager } from '@cepseudo/assets'
import type { AssetsManagerConfiguration } from '@cepseudo/shared'
import { TestAssetsManager, TestCollector, TestHandler } from './fixtures/mock_components.js'
import { MockDatabaseAdapter } from './fixtures/mock_database.js'
import { MockStorageService } from './fixtures/mock_storage.js'

class TestMapManager extends MapManager {
    getConfiguration(): AssetsManagerConfiguration {
        return { name: 'maps', description: 'Test map manager', contentType: 'application/json', endpoint: 'maps' }
    }
}

async function serve(servables: Parameters<typeof exposeEndpoints>[1], options?: ExposeEndpointsOptions): Promise<FastifyInstance> {
    const fastify = Fastify({ logger: false, requestIdHeader: 'x-request-id' })
    registerErrorHandler(fastify)
    await exposeEndpoints(fastify, servables, options)
    return fastify
}

function capture(): { handler: (req: TypedRequest) => Promise<{ status: number; content: string }>; received: () => TypedRequest } {
    let received: TypedRequest | undefined
    return {
        handler: async req => {
            received = req
            return { status: 200, content: '' }
        },
        received: () => received!
    }
}

function multipartPayload(fileContent: string): { headers: Record<string, string>; payload: string } {
    const boundary = 'testboundary'
    const payload = [
        `--${boundary}`,
        'Content-Disposition: form-data; name="description"',
        '',
        'a model',
        `--${boundary}`,
        'Content-Disposition: form-data; name="file"; filename="model (v2).glb"',
        'Content-Type: model/gltf-binary',
        '',
        fileContent,
        `--${boundary}--`,
        ''
    ].join('\r\n')
    return { headers: { 'content-type': `multipart/form-data; boundary=${boundary}` }, payload }
}

async function withTempDir(run: (dir: string) => Promise<void>): Promise<void> {
    const tempDir = '.test-uploads'
    process.env.TEMP_UPLOAD_DIR = tempDir
    await fs.rm(tempDir, { recursive: true, force: true })
    try {
        await run(tempDir)
    } finally {
        delete process.env.TEMP_UPLOAD_DIR
        await fs.rm(tempDir, { recursive: true, force: true })
    }
}

async function filesIn(dir: string): Promise<string[]> {
    return fs.readdir(dir).catch(() => [])
}

test.group('exposeEndpoints', () => {
    test('all component endpoints are reachable and return the configured response', async ({ assert }) => {
        const collector = new TestCollector('c1', [
            { method: 'get', path: '/data', handler: async () => ({ status: 200, content: JSON.stringify({ ok: true }), headers: { 'Content-Type': 'application/json' } }) }
        ])
        const handler = new TestHandler('h1', [
            { method: 'post', path: '/action', handler: async () => ({ status: 201, content: 'created' }) },
            { method: 'put', path: '/action/:id', handler: async () => ({ status: 200, content: 'replaced' }) },
            { method: 'patch', path: '/action/:id', handler: async () => ({ status: 200, content: 'patched' }) },
            { method: 'delete', path: '/action/:id', handler: async () => ({ status: 204, content: '' }) }
        ])
        const fastify = await serve([collector, handler])

        const getRes = await fastify.inject({ method: 'GET', url: '/data' })
        assert.equal(getRes.statusCode, 200)
        assert.match(String(getRes.headers['content-type']), /^application\/json/)
        assert.deepEqual(getRes.json(), { ok: true })

        const postRes = await fastify.inject({ method: 'POST', url: '/action' })
        assert.equal(postRes.statusCode, 201)
        assert.equal(postRes.body, 'created')

        assert.equal((await fastify.inject({ method: 'PUT', url: '/action/1' })).body, 'replaced')
        assert.equal((await fastify.inject({ method: 'PATCH', url: '/action/1' })).body, 'patched')
        assert.equal((await fastify.inject({ method: 'DELETE', url: '/action/42' })).statusCode, 204)
    })

    test('component endpoint defined with uppercase method is reachable', async ({ assert }) => {
        const fastify = await serve([
            new TestHandler('h', [{ method: 'GET' as any, path: '/upper', handler: async () => ({ status: 200, content: 'upper works' }) }])
        ])

        const res = await fastify.inject({ method: 'GET', url: '/upper' })
        assert.equal(res.statusCode, 200)
        assert.equal(res.body, 'upper works')
    })

    test('passes params, query, body and headers to the component handler', async ({ assert }) => {
        const probe = capture()
        const fastify = await serve([new TestHandler('h', [{ method: 'post', path: '/items/:id', handler: probe.handler }])])

        const res = await fastify.inject({
            method: 'POST',
            url: '/items/5?verbose=true',
            headers: { 'x-user-id': 'u1' },
            payload: { name: 'x' }
        })

        assert.equal(res.statusCode, 200)
        const received = probe.received()
        assert.deepEqual(received.params, { id: '5' })
        assert.deepEqual(received.query, { verbose: 'true' })
        assert.deepEqual(received.body, { name: 'x' })
        assert.equal(received.headers['x-user-id'], 'u1')
        assert.isUndefined(received.file)
        assert.isUndefined(received.user)
    })

    test('a request without a body gives the handler an empty object', async ({ assert }) => {
        const probe = capture()
        const fastify = await serve([new TestHandler('h', [{ method: 'get', path: '/x', handler: probe.handler }])])

        await fastify.inject({ method: 'GET', url: '/x' })
        assert.deepEqual(probe.received().body, {})
    })

    test('the caller identified by the auth middleware lands in req.user', async ({ assert }) => {
        const probe = capture()
        const authMiddleware = {
            identify: (headers: Record<string, string | string[] | undefined>) =>
                headers['x-user-id'] ? { id: String(headers['x-user-id']), roles: ['user'] } : undefined
        }
        const fastify = await serve([new TestHandler('h', [{ method: 'get', path: '/me', handler: probe.handler }])], { authMiddleware })

        await fastify.inject({ method: 'GET', url: '/me', headers: { 'x-user-id': 'u7' } })
        assert.deepEqual(probe.received().user, { id: 'u7', roles: ['user'] })

        await fastify.inject({ method: 'GET', url: '/me' })
        assert.isUndefined(probe.received().user)
    })

    test('an endpoint schema is validated before the handler runs and coerces params', async ({ assert }) => {
        const probe = capture()
        const fastify = await serve([
            new TestHandler('h', [{
                method: 'post',
                path: '/things/:id',
                schema: {
                    params: Type.Object({ id: Type.Integer() }),
                    body: Type.Object({ name: Type.String(), count: Type.Optional(Type.Integer({ minimum: 1 })) })
                },
                handler: probe.handler
            }])
        ])

        const ok = await fastify.inject({ method: 'POST', url: '/things/12', payload: { name: 'a', count: 2 } })
        assert.equal(ok.statusCode, 200)
        assert.deepEqual(probe.received().params, { id: 12 } as unknown as Record<string, string>)

        const invalid = await fastify.inject({
            method: 'POST',
            url: '/things/12',
            headers: { 'x-request-id': 'req-9' },
            payload: { count: 0 }
        })
        assert.equal(invalid.statusCode, 400)
        const body = invalid.json() as { error: { code: string; message: string; requestId: string; details: unknown[] } }
        assert.equal(body.error.code, 'VALIDATION_ERROR')
        assert.equal(body.error.requestId, 'req-9')
        assert.isAbove(body.error.details.length, 0)
        assert.include(body.error.message, 'name')

        const badParam = await fastify.inject({ method: 'POST', url: '/things/abc', payload: { name: 'a' } })
        assert.equal(badParam.statusCode, 400)
    })

    test('multipart uploads are spooled to the temp directory and exposed as req.file', async ({ assert }) => {
        await withTempDir(async tempDir => {
            const probe = capture()
            const fastify = await serve([new TestHandler('h', [{ method: 'post', path: '/upload', handler: probe.handler }])])

            const res = await fastify.inject({ method: 'POST', url: '/upload', ...multipartPayload('binarycontent') })

            assert.equal(res.statusCode, 200)
            const received = probe.received()
            assert.deepEqual(received.body, { description: 'a model' })
            const file = received.file!
            assert.equal(file.fieldname, 'file')
            assert.equal(file.originalname, 'model (v2).glb')
            assert.equal(file.mimetype, 'model/gltf-binary')
            assert.equal(file.size, 'binarycontent'.length)
            assert.isTrue(file.path!.startsWith(tempDir))
            assert.equal(await fs.readFile(file.path!, 'utf8'), 'binarycontent')
        })
    })

    test('an anonymous multipart request is refused with 401 before anything is written to disk', async ({ assert }) => {
        await withTempDir(async tempDir => {
            const probe = capture()
            const fastify = await serve([new TestHandler('h', [{ method: 'post', path: '/upload', handler: probe.handler }])], {
                authMiddleware: { identify: headers => (headers['x-user-id'] ? { id: String(headers['x-user-id']), roles: [] } : undefined) }
            })

            const anonymous = await fastify.inject({ method: 'POST', url: '/upload', ...multipartPayload('binarycontent') })
            assert.equal(anonymous.statusCode, 401)
            assert.equal((anonymous.json() as { error: { code: string } }).error.code, 'AUTHENTICATION_ERROR')
            assert.deepEqual(await filesIn(tempDir), [])

            const { headers, payload } = multipartPayload('binarycontent')
            const identified = await fastify.inject({ method: 'POST', url: '/upload', headers: { ...headers, 'x-user-id': 'u1' }, payload })
            assert.equal(identified.statusCode, 200)
            assert.equal(probe.received().user?.id, 'u1')
        })
    })

    test('a file over maxFileSize answers 413 with a structured error and leaves no temp file', async ({ assert }) => {
        await withTempDir(async tempDir => {
            const probe = capture()
            const fastify = await serve([new TestHandler('h', [{ method: 'post', path: '/upload', handler: probe.handler }])], { maxFileSize: 8 })

            const res = await fastify.inject({ method: 'POST', url: '/upload', ...multipartPayload('x'.repeat(64)) })

            assert.equal(res.statusCode, 413)
            const body = res.json() as { error: { code: string; message: string; requestId: string } }
            assert.equal(body.error.code, 'FST_REQ_FILE_TOO_LARGE')
            assert.isString(body.error.requestId)
            assert.deepEqual(await filesIn(tempDir), [])

            assert.equal((await fastify.inject({ method: 'POST', url: '/upload', ...multipartPayload('small') })).statusCode, 200)
        })
    })

    test('assets routes validate the id param and JSON bodies before the handler runs', async ({ assert }) => {
        const manager = new TestAssetsManager('models')
        manager.setDependencies(new MockDatabaseAdapter(), new MockStorageService())
        const fastify = await serve([manager])
        const code = (res: { json: () => unknown }) => (res.json() as { error: { code: string } }).error.code

        for (const url of ['/assets/abc', '/assets/0', '/assets/1.5', '/assets/abc/download']) {
            const res = await fastify.inject(url)
            assert.equal(res.statusCode, 400, url)
            assert.equal(code(res), 'VALIDATION_ERROR', url)
        }
        assert.equal((await fastify.inject({ method: 'DELETE', url: '/assets/abc' })).statusCode, 400)

        const badSource = await fastify.inject({ method: 'PUT', url: '/assets/1', payload: { source: 'not a url' } })
        assert.equal(badSource.statusCode, 400)
        assert.equal(code(badSource), 'VALIDATION_ERROR')

        const badSize = await fastify.inject({ method: 'POST', url: '/assets/upload-request', payload: { fileName: 'a.glb', fileSize: -1, contentType: 'model/gltf-binary' } })
        assert.equal(badSize.statusCode, 400)
        const missingName = await fastify.inject({ method: 'POST', url: '/assets/upload-request', payload: { fileSize: 10, contentType: 'model/gltf-binary' } })
        assert.equal(missingName.statusCode, 400)

        // A well-formed id is coerced to a number and still reaches the handler
        const missing = await fastify.inject('/assets/1')
        assert.equal(missing.statusCode, 404)
        assert.equal(missing.body, 'Asset not found')
    })

    test('map layer uploads require a JSON layer object', async ({ assert }) => {
        const fastify = await serve([new TestMapManager()])

        const empty = await fastify.inject({ method: 'POST', url: '/maps', payload: {} })
        assert.equal(empty.statusCode, 400)
        assert.include((empty.json() as { error: { message: string } }).error.message, 'layer')

        const notAnObject = await fastify.inject({ method: 'POST', url: '/maps', payload: { layer: 'x' } })
        assert.equal(notAnObject.statusCode, 400)
    })

    test('a DigitalTwinError thrown by the handler maps to its status code', async ({ assert }) => {
        const fastify = await serve([
            new TestHandler('h', [{ method: 'get', path: '/missing', handler: async () => { throw new NotFoundError('nothing here') } }])
        ])

        const res = await fastify.inject({ method: 'GET', url: '/missing', headers: { 'x-request-id': 'req-1' } })
        assert.equal(res.statusCode, 404)
        const body = res.json() as { error: { code: string; message: string; requestId: string } }
        assert.equal(body.error.code, 'NOT_FOUND')
        assert.equal(body.error.requestId, 'req-1')
        assert.equal(body.error.message, 'nothing here')
    })

    test('an unexpected error gives a 500 whose message is hidden in production', async ({ assert }) => {
        const fastify = await serve([
            new TestHandler('h', [{ method: 'get', path: '/boom', handler: async () => { throw new Error('db exploded') } }])
        ])

        const dev = await fastify.inject({ method: 'GET', url: '/boom' })
        assert.equal(dev.statusCode, 500)
        assert.equal((dev.json() as { error: { message: string } }).error.message, 'db exploded')

        process.env.NODE_ENV = 'production'
        try {
            const prod = await fastify.inject({ method: 'GET', url: '/boom' })
            assert.equal(prod.statusCode, 500)
            const body = prod.json() as { error: { message: string; stack?: string } }
            assert.equal(body.error.message, 'Internal server error')
            assert.isUndefined(body.error.stack)
        } finally {
            process.env.NODE_ENV = 'test'
        }
    })

    test('unknown routes answer 404 in the same error shape', async ({ assert }) => {
        const fastify = await serve([])

        const res = await fastify.inject({ method: 'GET', url: '/nowhere', headers: { 'x-request-id': 'req-2' } })
        assert.equal(res.statusCode, 404)
        const body = res.json() as { error: { code: string; message: string; requestId: string } }
        assert.equal(body.error.code, 'NOT_FOUND')
        assert.equal(body.error.requestId, 'req-2')
        assert.include(body.error.message, 'GET /nowhere')
    })

    test('throws for unsupported HTTP methods', async ({ assert }) => {
        await assert.rejects(
            () => serve([new TestHandler('h', [{ method: 'TRACE' as any, path: '/x', handler: async () => ({ status: 200, content: '' }) }])]),
            /Unsupported HTTP method/
        )
    })

    test('handles components with no endpoints', async ({ assert }) => {
        await assert.doesNotReject(() => serve([new TestCollector('empty', [])]))
    })
})
