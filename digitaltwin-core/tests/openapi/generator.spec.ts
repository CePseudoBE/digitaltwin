import { test } from '@japa/runner'
import { OpenAPIGenerator } from '../../src/openapi/generator.js'
import type { OpenAPIDocumentable, OpenAPIComponentSpec } from '../../src/openapi/types.js'

// Mock component that implements OpenAPIDocumentable
class MockDocumentableComponent implements OpenAPIDocumentable {
    getOpenAPISpec(): OpenAPIComponentSpec {
        return {
            paths: {
                '/test': {
                    get: {
                        summary: 'Test endpoint',
                        responses: {
                            '200': { description: 'OK' }
                        }
                    }
                }
            },
            tags: [{ name: 'Test', description: 'Test tag' }],
            schemas: {
                TestModel: {
                    type: 'object',
                    properties: {
                        id: { type: 'integer' },
                        name: { type: 'string' }
                    }
                }
            }
        }
    }
}

// Mock component that doesn't implement OpenAPIDocumentable
class NonDocumentableComponent {
    getConfiguration() {
        return { name: 'non-documentable' }
    }
}

// Mock component that throws in getOpenAPISpec
class FailingComponent implements OpenAPIDocumentable {
    getConfiguration() {
        return { name: 'failing-component' }
    }

    getOpenAPISpec(): OpenAPIComponentSpec {
        throw new Error('Spec generation failed')
    }
}

test.group('OpenAPIGenerator.generate', () => {
    test('generates basic OpenAPI document', ({ assert }) => {
        const doc = OpenAPIGenerator.generate({
            info: {
                title: 'Test API',
                version: '1.0.0'
            },
            components: []
        })

        assert.equal(doc.openapi, '3.0.3')
        assert.equal(doc.info.title, 'Test API')
        assert.equal(doc.info.version, '1.0.0')
        assert.deepEqual(doc.paths, {})
    })

    test('includes servers when provided', ({ assert }) => {
        const doc = OpenAPIGenerator.generate({
            info: { title: 'Test', version: '1.0.0' },
            components: [],
            servers: [
                { url: 'http://localhost:3000', description: 'Local' },
                { url: 'https://api.example.com', description: 'Production' }
            ]
        })

        assert.isDefined(doc.servers)
        assert.lengthOf(doc.servers!, 2)
        assert.equal(doc.servers![0].url, 'http://localhost:3000')
    })

    test('aggregates paths from documentable components', ({ assert }) => {
        const component = new MockDocumentableComponent()

        const doc = OpenAPIGenerator.generate({
            info: { title: 'Test', version: '1.0.0' },
            components: [component]
        })

        assert.isDefined(doc.paths['/test'])
        assert.isDefined(doc.paths['/test'].get)
        assert.equal(doc.paths['/test'].get!.summary, 'Test endpoint')
    })

    test('aggregates tags from components', ({ assert }) => {
        const component = new MockDocumentableComponent()

        const doc = OpenAPIGenerator.generate({
            info: { title: 'Test', version: '1.0.0' },
            components: [component]
        })

        assert.isDefined(doc.tags)
        assert.lengthOf(doc.tags!, 1)
        assert.equal(doc.tags![0].name, 'Test')
    })

    test('aggregates schemas from components', ({ assert }) => {
        const component = new MockDocumentableComponent()

        const doc = OpenAPIGenerator.generate({
            info: { title: 'Test', version: '1.0.0' },
            components: [component]
        })

        assert.isDefined(doc.components)
        assert.isDefined(doc.components!.schemas)
        assert.isDefined(doc.components!.schemas!['TestModel'])
    })

    test('filters out non-documentable components', ({ assert }) => {
        const documentable = new MockDocumentableComponent()
        const nonDocumentable = new NonDocumentableComponent()

        const doc = OpenAPIGenerator.generate({
            info: { title: 'Test', version: '1.0.0' },
            components: [documentable, nonDocumentable as any]
        })

        // Should only have paths from documentable component
        assert.isDefined(doc.paths['/test'])
        assert.equal(Object.keys(doc.paths).length, 1)
    })

    test('handles components that throw errors gracefully', ({ assert }) => {
        const failing = new FailingComponent()
        const working = new MockDocumentableComponent()

        // Should not throw
        const doc = OpenAPIGenerator.generate({
            info: { title: 'Test', version: '1.0.0' },
            components: [failing, working]
        })

        // Working component should still be included
        assert.isDefined(doc.paths['/test'])
    })

    test('includes auth security schemes by default', ({ assert }) => {
        const doc = OpenAPIGenerator.generate({
            info: { title: 'Test', version: '1.0.0' },
            components: []
        })

        assert.isDefined(doc.components)
        assert.isDefined(doc.components!.securitySchemes)
        assert.isDefined(doc.components!.securitySchemes!['ApiKeyAuth'])
    })

    test('excludes auth when includeAuth is false', ({ assert }) => {
        const doc = OpenAPIGenerator.generate({
            info: { title: 'Test', version: '1.0.0' },
            components: [],
            includeAuth: false
        })

        // components should be undefined or empty since no schemas
        assert.isUndefined(doc.components)
    })

    test('includes additional tags', ({ assert }) => {
        const doc = OpenAPIGenerator.generate({
            info: { title: 'Test', version: '1.0.0' },
            components: [],
            additionalTags: [
                { name: 'Custom', description: 'Custom tag' }
            ]
        })

        assert.isDefined(doc.tags)
        assert.lengthOf(doc.tags!, 1)
        assert.equal(doc.tags![0].name, 'Custom')
    })

    test('includes additional schemas', ({ assert }) => {
        const doc = OpenAPIGenerator.generate({
            info: { title: 'Test', version: '1.0.0' },
            components: [],
            additionalSchemas: {
                CustomModel: {
                    type: 'object',
                    properties: {
                        value: { type: 'string' }
                    }
                }
            }
        })

        assert.isDefined(doc.components!.schemas!['CustomModel'])
    })

    test('avoids duplicate tags', ({ assert }) => {
        const component = new MockDocumentableComponent()

        const doc = OpenAPIGenerator.generate({
            info: { title: 'Test', version: '1.0.0' },
            components: [component],
            additionalTags: [
                { name: 'Test', description: 'Duplicate tag' }
            ]
        })

        // Should only have one 'Test' tag
        const testTags = doc.tags!.filter(t => t.name === 'Test')
        assert.lengthOf(testTags, 1)
    })

    test('merges paths from multiple components', ({ assert }) => {
        const component1: OpenAPIDocumentable = {
            getOpenAPISpec: () => ({
                paths: {
                    '/endpoint1': {
                        get: { summary: 'Endpoint 1', responses: { '200': { description: 'OK' } } }
                    }
                }
            })
        }

        const component2: OpenAPIDocumentable = {
            getOpenAPISpec: () => ({
                paths: {
                    '/endpoint2': {
                        post: { summary: 'Endpoint 2', responses: { '201': { description: 'Created' } } }
                    }
                }
            })
        }

        const doc = OpenAPIGenerator.generate({
            info: { title: 'Test', version: '1.0.0' },
            components: [component1, component2]
        })

        assert.isDefined(doc.paths['/endpoint1'])
        assert.isDefined(doc.paths['/endpoint2'])
    })

    test('merges operations for same path from different components', ({ assert }) => {
        const component1: OpenAPIDocumentable = {
            getOpenAPISpec: () => ({
                paths: {
                    '/shared': {
                        get: { summary: 'GET shared', responses: { '200': { description: 'OK' } } }
                    }
                }
            })
        }

        const component2: OpenAPIDocumentable = {
            getOpenAPISpec: () => ({
                paths: {
                    '/shared': {
                        post: { summary: 'POST shared', responses: { '201': { description: 'Created' } } }
                    }
                }
            })
        }

        const doc = OpenAPIGenerator.generate({
            info: { title: 'Test', version: '1.0.0' },
            components: [component1, component2]
        })

        assert.isDefined(doc.paths['/shared'].get)
        assert.isDefined(doc.paths['/shared'].post)
    })

    test('sorts tags alphabetically', ({ assert }) => {
        const component1: OpenAPIDocumentable = {
            getOpenAPISpec: () => ({
                paths: {},
                tags: [{ name: 'Zebra' }]
            })
        }

        const component2: OpenAPIDocumentable = {
            getOpenAPISpec: () => ({
                paths: {},
                tags: [{ name: 'Alpha' }]
            })
        }

        const doc = OpenAPIGenerator.generate({
            info: { title: 'Test', version: '1.0.0' },
            components: [component1, component2]
        })

        assert.equal(doc.tags![0].name, 'Alpha')
        assert.equal(doc.tags![1].name, 'Zebra')
    })
})

test.group('OpenAPIGenerator.toJSON', () => {
    test('converts document to JSON string', ({ assert }) => {
        const doc = OpenAPIGenerator.generate({
            info: { title: 'Test', version: '1.0.0' },
            components: []
        })

        const json = OpenAPIGenerator.toJSON(doc)

        assert.isString(json)
        const parsed = JSON.parse(json)
        assert.equal(parsed.openapi, '3.0.3')
    })

    test('formats with indentation by default', ({ assert }) => {
        const doc = OpenAPIGenerator.generate({
            info: { title: 'Test', version: '1.0.0' },
            components: []
        })

        const json = OpenAPIGenerator.toJSON(doc)

        assert.include(json, '\n')
        assert.include(json, '  ')
    })

    test('omits formatting when pretty is false', ({ assert }) => {
        const doc = OpenAPIGenerator.generate({
            info: { title: 'Test', version: '1.0.0' },
            components: []
        })

        const json = OpenAPIGenerator.toJSON(doc, false)

        assert.notInclude(json, '\n  ')
    })
})

test.group('OpenAPIGenerator.toYAML', () => {
    test('converts document to YAML string', ({ assert }) => {
        const doc = OpenAPIGenerator.generate({
            info: { title: 'Test API', version: '1.0.0' },
            components: []
        })

        const yaml = OpenAPIGenerator.toYAML(doc)

        assert.isString(yaml)
        // Note: 3.0.3 is quoted because it looks like a number
        assert.include(yaml, 'openapi:')
        assert.include(yaml, '3.0.3')
        assert.include(yaml, 'title: Test API')
    })

    test('handles nested objects', ({ assert }) => {
        const doc = OpenAPIGenerator.generate({
            info: { title: 'Test', version: '1.0.0', description: 'A test API' },
            components: [],
            additionalSchemas: {
                TestModel: {
                    type: 'object',
                    properties: {
                        nested: {
                            type: 'object',
                            properties: {
                                value: { type: 'string' }
                            }
                        }
                    }
                }
            }
        })

        const yaml = OpenAPIGenerator.toYAML(doc)

        assert.include(yaml, 'TestModel:')
        assert.include(yaml, 'properties:')
    })

    test('handles arrays', ({ assert }) => {
        const component: OpenAPIDocumentable = {
            getOpenAPISpec: () => ({
                paths: {
                    '/items': {
                        get: {
                            tags: ['Items'],
                            summary: 'List items',
                            responses: { '200': { description: 'OK' } }
                        }
                    }
                },
                tags: [{ name: 'Items' }]
            })
        }

        const doc = OpenAPIGenerator.generate({
            info: { title: 'Test', version: '1.0.0' },
            components: [component]
        })

        const yaml = OpenAPIGenerator.toYAML(doc)

        assert.include(yaml, '- name: Items')
    })

    test('quotes strings that need escaping', ({ assert }) => {
        const doc = OpenAPIGenerator.generate({
            info: { title: 'Test: Special', version: '1.0.0' },
            components: []
        })

        const yaml = OpenAPIGenerator.toYAML(doc)

        // Title with colon should be quoted
        assert.include(yaml, '"Test: Special"')
    })

    test('handles empty arrays', ({ assert }) => {
        const yaml = (OpenAPIGenerator as any).objectToYAML([], 0)
        assert.equal(yaml, '[]')
    })

    test('handles empty objects', ({ assert }) => {
        const yaml = (OpenAPIGenerator as any).objectToYAML({}, 0)
        assert.equal(yaml, '{}')
    })

    test('handles null values', ({ assert }) => {
        const yaml = (OpenAPIGenerator as any).objectToYAML(null, 0)
        assert.equal(yaml, 'null')
    })

    test('handles boolean values', ({ assert }) => {
        const yaml = (OpenAPIGenerator as any).objectToYAML(true, 0)
        assert.equal(yaml, 'true')
    })

    test('handles number values', ({ assert }) => {
        const yaml = (OpenAPIGenerator as any).objectToYAML(42, 0)
        assert.equal(yaml, '42')
    })
})

test.group('OpenAPIGenerator helpers', () => {
    test('schemaRef creates reference', ({ assert }) => {
        const ref = OpenAPIGenerator.schemaRef('TestModel')

        assert.deepEqual(ref, { $ref: '#/components/schemas/TestModel' })
    })

    test('successResponse creates 200 response', ({ assert }) => {
        const response = OpenAPIGenerator.successResponse('application/json', { type: 'object' })

        assert.isDefined(response['200'])
        assert.equal(response['200'].description, 'Successful response')
        assert.isDefined(response['200'].content['application/json'])
    })

    test('successResponse accepts custom description', ({ assert }) => {
        const response = OpenAPIGenerator.successResponse(
            'application/json',
            { type: 'object' },
            'Custom description'
        )

        assert.equal(response['200'].description, 'Custom description')
    })

    test('errorResponses creates error responses', ({ assert }) => {
        const responses = OpenAPIGenerator.errorResponses([400, 401, 404, 500])

        assert.isDefined(responses['400'])
        assert.equal(responses['400'].description, 'Bad request')
        assert.isDefined(responses['401'])
        assert.equal(responses['401'].description, 'Unauthorized')
        assert.isDefined(responses['404'])
        assert.equal(responses['404'].description, 'Not found')
        assert.isDefined(responses['500'])
        assert.equal(responses['500'].description, 'Internal server error')
    })

    test('errorResponses creates subset of error codes', ({ assert }) => {
        const responses = OpenAPIGenerator.errorResponses([401, 403])

        assert.isDefined(responses['401'])
        assert.isDefined(responses['403'])
        assert.equal(responses['403'].description, 'Forbidden')
        assert.isUndefined(responses['400'])
        assert.isUndefined(responses['500'])
    })

    test('commonSchemas contains Error schema', ({ assert }) => {
        assert.isDefined(OpenAPIGenerator.commonSchemas.Error)
        assert.equal(OpenAPIGenerator.commonSchemas.Error.type, 'object')
        assert.isDefined(OpenAPIGenerator.commonSchemas.Error.properties!.error)
    })

    test('commonSchemas contains GeoJSON schemas', ({ assert }) => {
        assert.isDefined(OpenAPIGenerator.commonSchemas.Point)
        assert.isDefined(OpenAPIGenerator.commonSchemas.Feature)
        assert.isDefined(OpenAPIGenerator.commonSchemas.FeatureCollection)
    })
})
