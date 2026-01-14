/**
 * @fileoverview Decorator for marking methods as HTTP endpoint handlers
 *
 * This utility provides a decorator to annotate component methods as HTTP endpoints
 * that should be automatically registered with the digital twin engine's router.
 */

/**
 * Configuration interface for the servable endpoint decorator.
 */
interface ServableEndpointConfig {
    /** URL path for this endpoint (e.g., '/api/data/:id') */
    path: string

    /** HTTP method (defaults to 'get') */
    method?: string

    /** Response content type (defaults to 'application/json') */
    responseType?: string
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
export function servableEndpoint(config: ServableEndpointConfig) {
    return function (target: any, propertyKey: string | symbol, descriptor?: PropertyDescriptor): any {
        const ctor = target.constructor as any

        // Initialize endpoints array if it doesn't exist
        if (!ctor.__endpoints) {
            ctor.__endpoints = []
        }

        // Add endpoint configuration to the constructor metadata
        ctor.__endpoints.push({
            method: (config.method || 'get').toUpperCase(),
            path: config.path,
            responseType: config.responseType,
            handlerName: propertyKey.toString()
        })

        return descriptor
    }
}
