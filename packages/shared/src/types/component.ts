/**
 * @fileoverview Core interfaces and type definitions for digital twin components
 *
 * These interfaces establish the foundation for component architecture, scheduling,
 * and HTTP endpoint serving capabilities within the digital twin ecosystem.
 */

import type { HttpMethod } from './http_method.js'
import type { DataResponse, TypedRequest } from './http.js'

/**
 * Base configuration interface for all digital twin components.
 *
 * Every component must provide this minimal configuration to identify
 * itself within the system and define its data handling characteristics.
 */
export interface ComponentConfiguration {
    /** Unique identifier for the component (used as table name and endpoint prefix) */
    name: string
    /** Human-readable description of what this component does */
    description: string
    /** MIME type of the data this component produces or handles */
    contentType: string
    /** Optional tags for categorization and filtering */
    tags?: string[]
    /** Allowed file extension for uploads (e.g., '.glb', '.json'). If set, POST/PUT operations will validate file extensions. */
    extension?: string
}

/**
 * Configuration for AssetsManager components.
 *
 * Extends base configuration with endpoint definition for file management operations.
 */
export interface AssetsManagerConfiguration extends ComponentConfiguration {
    /** HTTP endpoint path for asset CRUD operations (e.g., 'api/assets') */
    endpoint: string
}

/**
 * Configuration for Collector components.
 *
 * Collectors fetch data from external sources on a scheduled basis
 * and expose endpoints for retrieving the collected data.
 */
export interface CollectorConfiguration extends ComponentConfiguration {
    /** HTTP endpoint path for retrieving collected data (e.g., 'api/weather') */
    endpoint: string
}

/**
 * Configuration for Harvester components.
 *
 * Harvesters process data collected by Collectors, applying transformations,
 * aggregations, or analysis. They can be triggered by new source data
 * or run on a schedule.
 */
export interface HarvesterConfiguration extends ComponentConfiguration {
    /**
     * Source range definition for data retrieval.
     *
     * Time-based formats: "3d" (days), "6h" (hours), "30m" (minutes), "120s" (seconds)
     * Count-based: number (e.g., 10 for last 10 records)
     */
    source_range?: string | number

    /** If true, requires exact limit to be met before processing (strict mode) */
    source_range_min?: boolean

    /** If true, stores multiple results instead of single result */
    multiple_results?: boolean

    /** HTTP endpoint path for retrieving harvested data */
    endpoint: string

    /** Source component name to harvest data from */
    source?: string

    /** List of dependent component names for additional data */
    dependencies?: string[]

    /** Record limits for each dependency (corresponds to dependencies array index) */
    dependenciesLimit?: number[]

    /**
     * Trigger mode for the harvester execution.
     *
     * - 'schedule': Runs on cron schedule from getSchedule()
     * - 'on-source': Triggered when source collector completes
     * - 'both': Both scheduled and event-driven execution
     */
    triggerMode?: 'schedule' | 'on-source' | 'both'

    /**
     * Debounce delay in milliseconds for on-source triggers.
     * Prevents rapid re-execution when source updates frequently.
     * Default: 1000ms
     */
    debounceMs?: number
}

/**
 * Configuration for assets (deprecated, use AssetsManagerConfiguration).
 *
 * @deprecated Use AssetsManagerConfiguration instead
 */
export interface AssetsConfiguration extends ComponentConfiguration {
    /** HTTP endpoint path */
    endpoint: string
}

/**
 * Configuration for CustomTableManager components.
 *
 * Allows defining custom database tables with arbitrary columns
 * and optional custom endpoints for specialized data management.
 */
export interface StoreConfiguration {
    /** Name of the store (used as database table name) */
    name: string
    /** Human-readable description of what this store manages */
    description: string
    /**
     * Database columns definition.
     * Key: column name, Value: SQL type definition (e.g., 'text not null', 'integer', 'boolean default true')
     */
    columns: {
        [columnName: string]: string
    }
    /** Custom endpoints beyond the standard CRUD operations */
    endpoints?: EndpointDefinition[]
    /** Optional tags for categorization and OpenAPI documentation */
    tags?: string[]
}

/**
 * Definition for a custom HTTP endpoint on a CustomTableManager.
 */
export interface EndpointDefinition {
    /** HTTP path relative to store name (e.g., "/toggle/:id", "/batch") */
    path: string
    /** HTTP method for this endpoint */
    method: 'get' | 'post' | 'put' | 'delete'
    /** Name of the method in the manager class to handle this endpoint */
    handler: string
    /** Optional response content type (defaults to 'application/json') */
    responseType?: string
}

/**
 * Base interface for all digital twin components.
 *
 * Components are the fundamental building blocks of a digital twin system,
 * each responsible for a specific aspect of data management or processing.
 *
 * @template T - The type of configuration object this component uses
 */
export interface Component<T extends ComponentConfiguration = ComponentConfiguration> {
    /**
     * Returns the configuration object for this component.
     */
    getConfiguration(): T
}

/**
 * Interface for components that can be scheduled to run periodically.
 *
 * Components implementing this interface can be automatically executed
 * by the digital twin engine's scheduler based on a cron expression.
 */
export interface ScheduleRunnable {
    /**
     * Executes the component's main functionality.
     *
     * @returns A promise that resolves when the run operation completes
     */
    run(): Promise<unknown>

    /**
     * Returns the cron expression defining when this component should run.
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
 */
export interface Servable {
    /**
     * Returns an array of HTTP endpoints this component exposes.
     */
    getEndpoints(): Array<{
        /** HTTP method for this endpoint (GET, POST, PUT, DELETE, etc.) */
        method: HttpMethod
        /** URL path for this endpoint (e.g., '/api/data') */
        path: string
        /** Function to handle requests to this endpoint */
        handler: (req: TypedRequest) => Promise<DataResponse>
        /** Optional response content type (defaults to 'application/json') */
        responseType?: string
    }>
}
