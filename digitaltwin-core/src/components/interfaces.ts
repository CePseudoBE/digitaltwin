/**
 * @fileoverview Core interfaces defining the contract for digital twin components
 *
 * These interfaces establish the foundation for component architecture, scheduling,
 * and HTTP endpoint serving capabilities within the digital twin ecosystem.
 */

import type { ComponentConfiguration } from './types.js'
import type { HttpMethod } from '../engine/endpoints.js'

/**
 * Base interface for all digital twin components.
 *
 * Components are the fundamental building blocks of a digital twin system,
 * each responsible for a specific aspect of data management or processing.
 *
 * @template T - The type of configuration object this component uses
 *
 * @example
 * ```typescript
 * class MyCollector implements Component<MyCollectorConfig> {
 *   getConfiguration(): MyCollectorConfig {
 *     return { name: 'my-collector', interval: 5000 };
 *   }
 * }
 * ```
 */
export interface Component<T extends ComponentConfiguration = ComponentConfiguration> {
    /**
     * Returns the configuration object for this component.
     *
     * The configuration contains metadata about the component such as its name,
     * type, scheduling information, and component-specific settings.
     *
     * @returns The component's configuration object
     */
    getConfiguration(): T
}

/**
 * Interface for components that can be scheduled to run periodically.
 *
 * Components implementing this interface can be automatically executed
 * by the digital twin engine's scheduler based on a cron expression.
 *
 * @example
 * ```typescript
 * class DataCollector implements ScheduleRunnable {
 *   async run(): Promise<void> {
 *     // Collect and process data
 *     console.log('Collecting data...');
 *   }
 *
 *   getSchedule(): string {
 *     return '0 *.5 * * * *'; // Every 5 minutes
 *   }
 * }
 * ```
 */
export interface ScheduleRunnable {
    /**
     * Executes the component's main functionality.
     *
     * This method is called automatically by the scheduler according to
     * the schedule returned by getSchedule(). Implementations should handle
     * errors appropriately and return a promise that resolves when the
     * operation is complete.
     *
     * @returns A promise that resolves when the run operation completes
     */
    run(): Promise<unknown>

    /**
     * Returns the cron expression defining when this component should run.
     *
     * The schedule follows standard cron syntax (second minute hour day month dayOfWeek).
     *
     * @returns A cron expression string (e.g., '0 *.5 * * * *' for every 5 minutes)
     */
    getSchedule(): string
}

/**
 * Interface for components that can expose HTTP endpoints.
 *
 * Components implementing this interface can serve HTTP requests,
 * allowing external systems to interact with the digital twin's data
 * and functionality through REST APIs.
 *
 * @example
 * ```typescript
 * class DataProvider implements Servable {
 *   getEndpoints() {
 *     return [
 *       {
 *         method: 'GET',
 *         path: '/api/data',
 *         handler: this.getData.bind(this),
 *         responseType: 'application/json'
 *       }
 *     ];
 *   }
 *
 *   private async getData() {
 *     return { data: 'example' };
 *   }
 * }
 * ```
 */
export interface Servable {
    /**
     * Returns an array of HTTP endpoints this component exposes.
     *
     * Each endpoint defines the HTTP method, URL path, handler function,
     * and optional response content type. The digital twin engine will
     * automatically register these endpoints with the HTTP server.
     *
     * @returns Array of endpoint definitions
     */
    getEndpoints(): Array<{
        /** HTTP method for this endpoint (GET, POST, PUT, DELETE, etc.) */
        method: HttpMethod
        /** URL path for this endpoint (e.g., '/api/data') */
        path: string
        /** Function to handle requests to this endpoint */
        handler: (...args: any[]) => any
        /** Optional response content type (defaults to 'application/json') */
        responseType?: string
    }>
}
