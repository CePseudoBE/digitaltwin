import { test } from '@japa/runner'
import { OpenAPIGenerator } from '../src/openapi/generator.js'
import type { OpenAPIDocumentable, OpenAPIComponentSpec } from '@digitaltwin/shared'

class MockDocumentable implements OpenAPIDocumentable {
    constructor(private spec: OpenAPIComponentSpec) {}
    getOpenAPISpec() { return this.spec }
}

class FailingDocumentable implements OpenAPIDocumentable {
    getConfiguration() { return { name: 'failing' } }
    getOpenAPISpec(): OpenAPIComponentSpec { throw new Error('Spec generation failed') }
}

test.group('OpenAPIGenerator.generate', () => {
    test('produces valid OpenAPI 3.0.3 document', ({ assert }) => {
        const doc = OpenAPIGenerator.generate({
            info: { title: 'My API', version: '2.0.0' },
            components: []
        })

        assert.equal(doc.openapi, '3.0.3')
        assert.equal(doc.info.title, 'My API')
        assert.deepEqual(doc.paths, {})
    })

    test('aggregates paths, tags, and schemas from components', ({ assert }) => {
        const comp = new MockDocumentable({
            paths: { '/items': { get: { summary: 'List', responses: { '200': { description: 'OK' } } } } },
            tags: [{ name: 'Items', description: 'Item endpoints' }],
            schemas: { Item: { type: 'object', properties: { id: { type: 'integer' } } } }
        })

        const doc = OpenAPIGenerator.generate({
            info: { title: 'T', version: '1.0.0' },
            components: [comp]
        })

        assert.isDefined(doc.paths['/items']?.get)
        assert.equal(doc.tags![0].name, 'Items')
        assert.isDefined(doc.components?.schemas?.Item)
    })

    test('merges operations on same path from different components', ({ assert }) => {
        const comp1 = new MockDocumentable({ paths: { '/x': { get: { summary: 'GET', responses: {} } } } })
        const comp2 = new MockDocumentable({ paths: { '/x': { post: { summary: 'POST', responses: {} } } } })

        const doc = OpenAPIGenerator.generate({
            info: { title: 'T', version: '1.0.0' },
            components: [comp1, comp2]
        })

        assert.isDefined(doc.paths['/x'].get)
        assert.isDefined(doc.paths['/x'].post)
    })

    test('deduplicates tags', ({ assert }) => {
        const comp = new MockDocumentable({ paths: {}, tags: [{ name: 'Dup' }] })
        const doc = OpenAPIGenerator.generate({
            info: { title: 'T', version: '1.0.0' },
            components: [comp],
            additionalTags: [{ name: 'Dup', description: 'duplicate' }]
        })

        assert.equal(doc.tags!.filter(t => t.name === 'Dup').length, 1)
    })

    test('sorts tags alphabetically', ({ assert }) => {
        const c1 = new MockDocumentable({ paths: {}, tags: [{ name: 'Zebra' }] })
        const c2 = new MockDocumentable({ paths: {}, tags: [{ name: 'Alpha' }] })

        const doc = OpenAPIGenerator.generate({
            info: { title: 'T', version: '1.0.0' },
            components: [c1, c2]
        })

        assert.equal(doc.tags![0].name, 'Alpha')
        assert.equal(doc.tags![1].name, 'Zebra')
    })

    test('filters out non-documentable components', ({ assert }) => {
        const documentable = new MockDocumentable({ paths: { '/ok': { get: { responses: {} } } } })
        const plain = { getConfiguration: () => ({ name: 'plain' }) }

        const doc = OpenAPIGenerator.generate({
            info: { title: 'T', version: '1.0.0' },
            components: [documentable, plain as any]
        })

        assert.equal(Object.keys(doc.paths).length, 1)
    })

    test('skips components that throw and keeps others', ({ assert }) => {
        const failing = new FailingDocumentable()
        const working = new MockDocumentable({ paths: { '/ok': { get: { responses: {} } } } })

        const doc = OpenAPIGenerator.generate({
            info: { title: 'T', version: '1.0.0' },
            components: [failing, working]
        })

        assert.isDefined(doc.paths['/ok'])
    })

    test('includes default auth security schemes', ({ assert }) => {
        const doc = OpenAPIGenerator.generate({
            info: { title: 'T', version: '1.0.0' },
            components: []
        })

        assert.isDefined(doc.components?.securitySchemes?.ApiKeyAuth)
    })

    test('excludes auth when includeAuth is false', ({ assert }) => {
        const doc = OpenAPIGenerator.generate({
            info: { title: 'T', version: '1.0.0' },
            components: [],
            includeAuth: false
        })

        assert.isUndefined(doc.components)
    })
})

test.group('OpenAPIGenerator serialization', () => {
    test('toJSON produces valid parseable JSON', ({ assert }) => {
        const doc = OpenAPIGenerator.generate({ info: { title: 'T', version: '1' }, components: [] })
        const json = OpenAPIGenerator.toJSON(doc)
        const parsed = JSON.parse(json)
        assert.equal(parsed.openapi, '3.0.3')
    })

    test('toYAML produces valid YAML output', ({ assert }) => {
        const doc = OpenAPIGenerator.generate({ info: { title: 'Test API', version: '1' }, components: [] })
        const yaml = OpenAPIGenerator.toYAML(doc)
        assert.include(yaml, 'openapi:')
        assert.include(yaml, 'title: Test API')
    })

    test('toYAML quotes strings containing special characters', ({ assert }) => {
        const doc = OpenAPIGenerator.generate({ info: { title: 'Test: Special', version: '1' }, components: [] })
        const yaml = OpenAPIGenerator.toYAML(doc)
        assert.include(yaml, '"Test: Special"')
    })
})

test.group('OpenAPIGenerator helpers', () => {
    test('schemaRef creates $ref path', ({ assert }) => {
        assert.deepEqual(OpenAPIGenerator.schemaRef('User'), { $ref: '#/components/schemas/User' })
    })

    test('successResponse creates 200 response with schema', ({ assert }) => {
        const resp = OpenAPIGenerator.successResponse('application/json', { type: 'object' }, 'All good')
        assert.equal(resp['200'].description, 'All good')
        assert.isDefined(resp['200'].content['application/json'])
    })

    test('errorResponses creates responses for specified codes', ({ assert }) => {
        const resp = OpenAPIGenerator.errorResponses([401, 404])
        assert.equal(resp['401'].description, 'Unauthorized')
        assert.equal(resp['404'].description, 'Not found')
        assert.isUndefined(resp['400'])
    })

    test('commonSchemas includes Error and GeoJSON types', ({ assert }) => {
        assert.isDefined(OpenAPIGenerator.commonSchemas.Error)
        assert.isDefined(OpenAPIGenerator.commonSchemas.Point)
        assert.isDefined(OpenAPIGenerator.commonSchemas.Feature)
        assert.isDefined(OpenAPIGenerator.commonSchemas.FeatureCollection)
    })
})
