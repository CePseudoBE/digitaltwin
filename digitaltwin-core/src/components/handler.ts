/**
 * @fileoverview Handler component base class for HTTP endpoint providers
 *
 * Handlers are lightweight, stateless components that expose HTTP endpoints
 * for on-demand data access, computation, or utility services within the digital twin.
 */

import type { Component, Servable } from './interfaces.js'
import type { ComponentConfiguration } from './types.js'
import type { DataResponse } from './types.js'
import type { HttpMethod } from '../engine/endpoints.js'
import type { OpenAPIDocumentable, OpenAPIComponentSpec, OpenAPIPathItem } from '../openapi/types.js'

/**
 * Metadata for declaring an HTTP endpoint on handler methods.
 *
 * This interface defines the static metadata that gets attached to
 * handler classes when using the @servableEndpoint decorator.
 */
interface EndpointMeta {
    /** HTTP method for the endpoint */
    method: HttpMethod

    /** URL path pattern */
    path: string

    /** Optional response content type */
    responseType?: string

    /** Name of the handler method */
    handlerName: string
}

/**
 * Runtime descriptor for an HTTP endpoint handler.
 *
 * Represents a fully resolved endpoint with its bound handler function,
 * ready for registration with the Express router.
 */
type EndpointDescriptor = {
    /** HTTP method for the endpoint */
    method: HttpMethod

    /** URL path pattern */
    path: string

    /** Response content type */
    responseType?: string

    /** Bound handler function */
    handler: (...args: any[]) => Promise<DataResponse>
}

/**
 * Abstract base class for Handler components.
 *
 * Handlers are lightweight, stateless components that expose HTTP endpoints
 * for on-demand data access, computation, or utility services. Unlike Collectors
 * and Harvesters, they don't run on schedules but respond to HTTP requests.
 *
 * Key features:
 * - Expose HTTP endpoints using the @servableEndpoint decorator
 * - Stateless operation (no database or storage dependencies by default)
 * - Suitable for real-time computations, data queries, or API proxies
 *
 * @example
 * ```typescript
 * class CalculatorHandler extends Handler {
 *   getConfiguration() {
 *     return {
 *       name: 'calculator-handler',
 *       type: 'handler',
 *       contentType: 'application/json'
 *     };
 *   }
 *
 *   @servableEndpoint({ path: '/api/calculate/sum', method: 'post' })
 *   async calculateSum(req: Request) {
 *     const { a, b } = req.body;
 *     return {
 *       status: 200,
 *       content: { result: a + b }
 *     };
 *   }
 * }
 * ```
 */
export abstract class Handler implements Component, Servable, OpenAPIDocumentable {
    /**
     * Returns the handler's configuration.
     *
     * Implementations must provide basic component information including
     * name, type, and default content type for responses.
     *
     * @returns Component configuration object
     *
     * @example
     * ```typescript
     * getConfiguration() {
     *   return {
     *     name: 'my-handler',
     *     type: 'handler',
     *     contentType: 'application/json'
     *   };
     * }
     * ```
     */
    abstract getConfiguration(): ComponentConfiguration

    /**
     * Resolves and returns HTTP endpoints defined on this handler.
     *
     * Automatically discovers endpoints declared with the @servableEndpoint
     * decorator and creates bound handler functions for registration with
     * the Express router.
     *
     * @returns Array of endpoint descriptors with bound handler functions
     */
    getEndpoints(): EndpointDescriptor[] {
        const config = this.getConfiguration()
        const ctor = this.constructor as { __endpoints?: EndpointMeta[] }
        const endpoints = ctor.__endpoints || []

        return endpoints.map(ep => {
            const handlerFn = (this as Record<string, any>)[ep.handlerName].bind(this) as EndpointDescriptor['handler']
            return {
                method: ep.method,
                path: ep.path,
                responseType: ep.responseType || config.contentType,
                handler: handlerFn
            }
        })
    }

    /**
     * Returns the OpenAPI specification for this handler's endpoints.
     *
     * Generates documentation for all endpoints declared with @servableEndpoint.
     * Can be overridden by subclasses for more detailed specifications.
     *
     * @returns {OpenAPIComponentSpec} OpenAPI paths, tags, and schemas for this handler
     */
    getOpenAPISpec(): OpenAPIComponentSpec {
        const config = this.getConfiguration()
        const endpoints = this.getEndpoints()
        const tagName = config.tags?.[0] || config.name
        const paths: Record<string, OpenAPIPathItem> = {}

        for (const endpoint of endpoints) {
            const method = endpoint.method.toLowerCase() as keyof OpenAPIPathItem

            if (!paths[endpoint.path]) {
                paths[endpoint.path] = {}
            }

            paths[endpoint.path][method] = {
                summary: `${method.toUpperCase()} ${endpoint.path}`,
                description: config.description,
                tags: [tagName],
                responses: {
                    '200': {
                        description: 'Successful response',
                        content: {
                            [endpoint.responseType || config.contentType]: {
                                schema: { type: 'object' }
                            }
                        }
                    }
                }
            }
        }

        return {
            paths,
            tags: [
                {
                    name: tagName,
                    description: config.description
                }
            ]
        }
    }
}
