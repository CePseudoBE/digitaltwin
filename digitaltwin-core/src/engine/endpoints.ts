/**
 * @fileoverview HTTP endpoint exposure utilities for digital twin components
 *
 * This module handles the automatic registration of HTTP endpoints from servable
 * components to the Express router, enabling RESTful API access to digital twin data.
 */

import type { Router } from 'ultimate-express'
import type { Collector } from '../components/collector.js'
import type { Harvester } from '../components/harvester.js'
import type { Handler } from '../components/handler.js'
import type { Request, Response } from 'ultimate-express'
import type { AssetsManager, CustomTableManager } from '../components/index.js'
import { DigitalTwinError } from '../errors/index.js'
import { Logger } from '../utils/logger.js'

const logger = new Logger('Endpoints')

/**
 * Supported HTTP methods for component endpoints.
 *
 * These methods correspond to standard REST operations:
 * - get: Retrieve data
 * - post: Create new resources
 * - put: Update existing resources (full update)
 * - patch: Update existing resources (partial update)
 * - delete: Remove resources
 */
export type HttpMethod = 'get' | 'post' | 'put' | 'delete' | 'patch'

/**
 * Interface defining an HTTP endpoint exposed by a component.
 *
 * Each endpoint specifies the HTTP method, URL path, handler function,
 * and optional response content type for serving component data via HTTP.
 */
interface Endpoint {
    /** HTTP method for this endpoint */
    method: HttpMethod

    /** URL path pattern (e.g., '/api/data/:id') */
    path: string

    /** Function to handle HTTP requests to this endpoint */
    handler: (...args: any[]) => any

    /** Optional response content type (defaults to 'application/json') */
    responseType?: string
}

/**
 * Automatically registers HTTP endpoints from servable components to an Express router.
 *
 * This function iterates through all provided components, extracts their endpoints,
 * and registers them with the Express router. Each endpoint is wrapped with error
 * handling to ensure robust API behavior.
 *
 * @param router - Express router instance to register endpoints with
 * @param servables - Array of components that expose HTTP endpoints
 *
 * @throws {Error} When an unsupported HTTP method is encountered
 *
 * @example
 * ```typescript
 * const router = express.Router();
 * const components = [collector1, harvester1, assetsManager1];
 *
 * await exposeEndpoints(router, components);
 *
 * // Now the router has all endpoints from the components registered
 * app.use('/api', router);
 * ```
 */
export async function exposeEndpoints(
    router: Router,
    servables: Array<Collector | Harvester | Handler | AssetsManager | CustomTableManager>
): Promise<void> {
    for (const servable of servables) {
        const endpoints: Endpoint[] = servable.getEndpoints()

        for (const ep of endpoints) {
            const method = ep.method.toLowerCase() as HttpMethod

            if (typeof router[method] === 'function') {
                // Register endpoint with error handling wrapper
                router[method](ep.path, async (req: Request, res: Response) => {
                    try {
                        const result = await ep.handler(req)
                        res.status(result.status)
                            .header(result.headers || {})
                            .send(result.content)
                    } catch (error) {
                        const requestId = (req.headers['x-request-id'] as string) || crypto.randomUUID()

                        // Log the error with context
                        logger.error(`[${requestId}] ${req.method} ${ep.path} - ${error instanceof Error ? error.message : String(error)}`, {
                            requestId,
                            method: req.method,
                            path: ep.path,
                            userId: req.headers['x-user-id'],
                            stack: error instanceof Error ? error.stack : undefined
                        })

                        // Handle DigitalTwinError with proper status code
                        if (error instanceof DigitalTwinError) {
                            res.status(error.statusCode).send({
                                ...error.toJSON(),
                                requestId
                            })
                            return
                        }

                        // Generic error response
                        const isProduction = process.env.NODE_ENV === 'production'
                        res.status(500).send({
                            error: {
                                code: 'INTERNAL_ERROR',
                                message: isProduction ? 'Internal server error' : (error instanceof Error ? error.message : String(error)),
                                requestId,
                                timestamp: new Date().toISOString()
                            }
                        })
                    }
                })
            } else {
                throw new Error(`Unsupported HTTP method: ${ep.method}`)
            }
        }
    }
}
