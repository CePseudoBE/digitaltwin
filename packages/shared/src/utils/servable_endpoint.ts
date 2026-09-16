/**
 * @fileoverview Decorator for marking methods as HTTP endpoint handlers
 *
 * This utility provides a decorator to annotate component methods as HTTP endpoints
 * that should be automatically registered with the digital twin engine's router.
 */

import type { EndpointSchema } from '../types/http.js'

/**
 * Configuration interface for the servable endpoint decorator.
 */
export interface ServableEndpointConfig {
    /** URL path for this endpoint (e.g., '/api/data/:id') */
    path: string

    /** HTTP method (defaults to 'get') */
    method?: string

    /** Response content type (defaults to 'application/json') */
    responseType?: string

    /** JSON Schema validated by the engine before the handler runs */
    schema?: EndpointSchema
}

/**
 * Decorator that marks a method as an HTTP endpoint handler.
 *
 * This decorator allows component methods to be automatically discovered
 * and registered as HTTP endpoints by the digital twin engine. The decorated
 * method will be called when HTTP requests are made to the specified path.
 *
 * @param config - Configuration object specifying the endpoint details
 * @param config.path - URL path pattern for this endpoint
 * @param config.method - HTTP method (defaults to 'GET')
 * @param config.responseType - Response content type (defaults to 'application/json')
 *
 * @returns Method decorator function
 *
 * @example
 * ```typescript
 * class WeatherCollector extends Collector {
 *   @servableEndpoint({
 *     path: '/api/weather/current',
 *     method: 'get',
 *     responseType: 'application/json'
 *   })
 *   getCurrentWeather(req: Request) {
 *     return {
 *       status: 200,
 *       content: { temperature: 22, humidity: 65 }
 *     };
 *   }
 *
 *   @servableEndpoint({
 *     path: '/api/weather/history/:date',
 *     method: 'get'
 *   })
 *   getWeatherHistory(req: Request) {
 *     const date = req.params.date;
 *     return {
 *       status: 200,
 *       content: this.getHistoricalData(date)
 *     };
 *   }
 * }
 * ```
 */
/** Endpoint metadata recorded on the class constructor by the decorator. */
export interface ServableEndpointMeta {
    method: string
    path: string
    responseType?: string
    schema?: EndpointSchema
    handlerName: string
}

interface DecoratedConstructor {
    __endpoints?: ServableEndpointMeta[]
}

export function servableEndpoint(config: ServableEndpointConfig) {
    return function (target: object, propertyKey: string | symbol, descriptor?: PropertyDescriptor): PropertyDescriptor | undefined {
        const ctor = target.constructor as DecoratedConstructor

        // `__endpoints` is looked up through the static prototype chain, so a subclass would
        // otherwise push into its parent's array. Give every decorated class its own array,
        // seeded with what it inherits so parent endpoints are still served once.
        if (!Object.prototype.hasOwnProperty.call(ctor, '__endpoints')) {
            ctor.__endpoints = [...(ctor.__endpoints ?? [])]
        }
        const endpoints = ctor.__endpoints as ServableEndpointMeta[]

        // Add endpoint configuration to the constructor metadata
        endpoints.push({
            method: (config.method || 'get').toUpperCase(),
            path: config.path,
            responseType: config.responseType,
            schema: config.schema,
            handlerName: propertyKey.toString()
        })

        return descriptor
    }
}
