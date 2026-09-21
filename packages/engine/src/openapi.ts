import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import type { FastifyInstance, FastifySchema } from 'fastify'
import type { OpenAPIInfo, OpenAPIOperation, OpenAPISchema, OpenAPITag } from '@cepseudo/shared'
import { isOpenAPIDocumentable } from '@cepseudo/shared'

export interface OpenApiOptions {
    /** API metadata of the generated document (default: title 'Digital Twin API', version '1.0.0') */
    info?: OpenAPIInfo
    /** Serve Swagger UI at /api/docs (default: false) */
    ui?: boolean
}

type Operation = Record<string, unknown>

interface Document {
    paths?: Record<string, Record<string, Operation>>
    tags?: OpenAPITag[]
    components?: { schemas?: Record<string, OpenAPISchema> }
}

const SECURITY_SCHEMES = {
    ApiKeyAuth: { type: 'apiKey', in: 'header', name: 'x-user-id', description: 'Keycloak user ID (forwarded by APISIX)' }
} as const

function toOpenApiPath(url: string): string {
    return url.replace(/:(\w+)/g, '{$1}')
}

/**
 * The route schema is what Fastify validates, so it wins over the authored spec
 * for the parts it declares; everything else comes from `getOpenAPISpec()`.
 */
function mergeOperation(generated: Operation | undefined, authored: OpenAPIOperation, declared: FastifySchema | undefined): Operation {
    if (!generated) {
        return { ...authored }
    }
    const merged: Operation = { ...generated, ...authored }
    if (declared?.params || declared?.querystring || declared?.headers) {
        merged.parameters = generated.parameters
    }
    if (declared?.body) {
        merged.requestBody = generated.requestBody
    }
    if (declared?.response) {
        merged.responses = generated.responses
    }
    return merged
}

/**
 * Generates the OpenAPI document from the registered routes with `@fastify/swagger`
 * and merges the components' `getOpenAPISpec()` contributions into it.
 * Must be registered before the routes it documents.
 */
export async function registerOpenApi(fastify: FastifyInstance, components: unknown[], options: OpenApiOptions = {}): Promise<void> {
    const declaredSchemas = new Map<string, FastifySchema>()

    await fastify.register(swagger, {
        openapi: {
            openapi: '3.0.3',
            info: options.info ?? { title: 'Digital Twin API', version: '1.0.0' },
            components: { securitySchemes: SECURITY_SCHEMES }
        },
        transform: ({ schema, url, route }) => {
            for (const method of [route.method].flat()) {
                declaredSchemas.set(`${method.toLowerCase()} ${toOpenApiPath(url)}`, schema ?? {})
            }
            return { schema, url }
        },
        transformObject: documentObject => {
            const document = (documentObject as { openapiObject: Document }).openapiObject
            const paths = (document.paths ??= {})
            const tags = new Map((document.tags ?? []).map(tag => [tag.name, tag]))
            const schemas = ((document.components ??= {}).schemas ??= {})

            for (const component of components.filter(isOpenAPIDocumentable)) {
                const spec = component.getOpenAPISpec()
                for (const [path, pathItem] of Object.entries(spec.paths)) {
                    const generated = (paths[path] ??= {})
                    for (const [method, authored] of Object.entries(pathItem)) {
                        generated[method] = mergeOperation(generated[method], authored, declaredSchemas.get(`${method} ${path}`))
                    }
                }
                for (const tag of spec.tags ?? []) {
                    if (!tags.has(tag.name)) {
                        tags.set(tag.name, tag)
                    }
                }
                Object.assign(schemas, spec.schemas)
            }

            document.tags = [...tags.values()].sort((a, b) => a.name.localeCompare(b.name))
            return document
        }
    })

    fastify.get('/api/openapi.json', { schema: { hide: true } }, async () => fastify.swagger())
    fastify.get('/api/openapi.yaml', { schema: { hide: true } }, async (_request, reply) =>
        reply.type('application/yaml').send(fastify.swagger({ yaml: true }))
    )

    if (options.ui) {
        await fastify.register(swaggerUi, { routePrefix: '/api/docs' })
    }
}
