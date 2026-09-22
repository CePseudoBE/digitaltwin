import { test } from '@japa/runner'
import { Validator } from '@seriousme/openapi-schema-validator'
import { parse } from 'yaml'
import { Type } from 'typebox'
import { Handler } from '@cepseudo/components'
import { LogLevel, servableEndpoint } from '@cepseudo/shared'
import type { ComponentConfiguration, DataResponse, OpenAPIComponentSpec, TypedRequest } from '@cepseudo/shared'
import type { EngineOptions } from '../src/digital_twin_engine.js'
import { DigitalTwinEngine } from '../src/digital_twin_engine.js'
import { TestCustomTableManager } from './fixtures/mock_components.js'
import { MockDatabaseAdapter } from './fixtures/mock_database.js'
import { MockStorageService } from './fixtures/mock_storage.js'

interface Operation {
    summary?: string
    tags?: string[]
    parameters?: Array<{ name: string; in: string }>
    requestBody?: { content: Record<string, { schema: { properties?: Record<string, { type: string }> } }> }
    responses: Record<string, { description: string }>
}

interface Document {
    openapi: string
    info: { title: string }
    paths: Record<string, Record<string, Operation>>
    tags: Array<{ name: string }>
    components: { schemas: Record<string, unknown>; securitySchemes: Record<string, unknown> }
}

class CalculatorHandler extends Handler {
    getConfiguration(): ComponentConfiguration {
        return { name: 'calc', description: 'Calculator', contentType: 'application/json' }
    }

    @servableEndpoint({
        path: '/calc/sum',
        method: 'post',
        schema: {
            body: Type.Object({ a: Type.Number(), b: Type.Number() }),
            response: { 200: Type.Object({ sum: Type.Number() }) }
        }
    })
    async sum(req: TypedRequest): Promise<DataResponse> {
        const { a, b } = req.body as { a: number; b: number }
        return { status: 200, content: JSON.stringify({ sum: a + b }), headers: { 'Content-Type': 'application/json' } }
    }

    @servableEndpoint({ path: '/calc/:id', method: 'get' })
    async get(): Promise<DataResponse> {
        return { status: 200, content: '{}', headers: { 'Content-Type': 'application/json' } }
    }

    override getOpenAPISpec(): OpenAPIComponentSpec {
        return {
            paths: {
                '/calc/sum': {
                    post: {
                        summary: 'Add two numbers',
                        tags: ['Calculator'],
                        requestBody: { content: { 'text/plain': { schema: { type: 'string' } } } },
                        responses: { '418': { description: 'Never generated' } }
                    }
                },
                '/calc/{id}': {
                    get: {
                        summary: 'Authored parameters',
                        parameters: [{ name: 'id', in: 'path', required: true, description: 'Authored', schema: { type: 'integer' } }],
                        responses: { '200': { description: 'Authored response' } }
                    }
                },
                '/calc/extra': {
                    get: { summary: 'Documented without a route', responses: { '200': { description: 'OK' } } }
                }
            },
            tags: [{ name: 'Calculator' }]
        }
    }
}

async function withEngine(options: Partial<EngineOptions>, run: (engine: DigitalTwinEngine) => Promise<void>): Promise<void> {
    const engine = new DigitalTwinEngine({
        database: new MockDatabaseAdapter(),
        storage: new MockStorageService(),
        logging: { level: LogLevel.SILENT },
        server: { port: 0 },
        ...options
    })
    await engine.start()
    try {
        await run(engine)
    } finally {
        await engine.stop()
    }
}

const components: Partial<EngineOptions> = {
    handlers: [new CalculatorHandler()],
    customTableManagers: [new TestCustomTableManager('sensors')]
}

test.group('OpenAPI document', () => {
    test('validates against the OpenAPI 3 schema', async ({ assert }) => {
        await withEngine(components, async engine => {
            const res = await engine.inject('/api/openapi.json')
            assert.equal(res.statusCode, 200)
            const result = await new Validator().validate(res.json())
            assert.isTrue(result.valid, JSON.stringify(result.errors, null, 2))
        })
    })

    test('merges component specs into the generated routes', async ({ assert }) => {
        await withEngine(components, async engine => {
            const doc = (await engine.inject('/api/openapi.json')).json() as Document

            assert.equal(doc.paths['/sensors'].get.summary, 'List all sensors records')
            assert.deepEqual(doc.paths['/sensors'].get.tags, ['sensors'])
            assert.isDefined(doc.paths['/sensors'].post.requestBody?.content['application/json'])
            assert.isDefined(doc.paths['/sensors/{id}'].get)
            assert.isDefined(doc.components.schemas.sensorsRecord)
            assert.isDefined(doc.components.securitySchemes.BearerAuth)
            assert.equal(doc.paths['/calc/extra'].get.summary, 'Documented without a route')
            assert.deepEqual(doc.tags.map(tag => tag.name), ['Calculator', 'sensors'])
            assert.isUndefined(doc.paths['/api/openapi.json'])
        })
    })

    test('route schemas win over the component spec for what they declare', async ({ assert }) => {
        await withEngine(components, async engine => {
            const doc = (await engine.inject('/api/openapi.json')).json() as Document

            const sum = doc.paths['/calc/sum'].post
            assert.equal(sum.summary, 'Add two numbers')
            assert.equal(sum.requestBody?.content['application/json'].schema.properties?.a.type, 'number')
            assert.isUndefined(sum.requestBody?.content['text/plain'])
            assert.isDefined(sum.responses['200'])
            assert.isUndefined(sum.responses['418'])

            const get = doc.paths['/calc/{id}'].get
            assert.equal(get.parameters?.[0].name, 'id')
            assert.equal(get.responses['200'].description, 'Authored response')
        })
    })

    test('serves YAML and honours the info option', async ({ assert }) => {
        await withEngine({ ...components, openapi: { info: { title: 'Twin', version: '2.0.0' } } }, async engine => {
            const res = await engine.inject('/api/openapi.yaml')
            assert.equal(res.statusCode, 200)
            assert.include(res.headers['content-type'], 'application/yaml')
            const doc = parse(res.body) as Document
            assert.equal(doc.openapi, '3.0.3')
            assert.equal(doc.info.title, 'Twin')
            assert.isDefined(doc.paths['/calc/sum'])
        })
    })

    test('Swagger UI is served only when enabled', async ({ assert }) => {
        await withEngine({}, async engine => {
            assert.equal((await engine.inject('/api/docs/')).statusCode, 404)
        })
        await withEngine({ openapi: { ui: true } }, async engine => {
            const res = await engine.inject('/api/docs/')
            assert.equal(res.statusCode, 200)
            assert.include(res.headers['content-type'], 'text/html')
        })
    })
})
