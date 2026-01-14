/**
 * @fileoverview Type definitions for digital twin component configurations
 *
 * This module defines the configuration interfaces used by all digital twin
 * components including collectors, harvesters, handlers, and asset managers.
 */

/**
 * Base configuration interface for all digital twin components.
 *
 * Every component must provide this minimal configuration to identify
 * itself within the system and define its data handling characteristics.
 *
 * @interface ComponentConfiguration
 *
 * @example
 * ```typescript
 * const config: ComponentConfiguration = {
 *   name: 'weather-collector',
 *   description: 'Collects weather data from external API',
 *   contentType: 'application/json',
 *   tags: ['weather', 'external-api'],
 *   extension: '.json'
 * }
 * ```
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
 *
 * @interface AssetsManagerConfiguration
 * @extends {ComponentConfiguration}
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
 *
 * @interface CollectorConfiguration
 * @extends {ComponentConfiguration}
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
 *
 * @interface HarvesterConfiguration
 * @extends {ComponentConfiguration}
 *
 * @example
 * ```typescript
 * const config: HarvesterConfiguration = {
 *   name: 'traffic-analysis',
 *   description: 'Analyzes traffic patterns',
 *   contentType: 'application/json',
 *   endpoint: 'api/traffic-analysis',
 *   source: 'traffic-collector',
 *   source_range: '1h',
 *   triggerMode: 'on-source',
 *   dependencies: ['weather-collector'],
 *   dependenciesLimit: [1]
 * }
 * ```
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
 * @interface AssetsConfiguration
 * @extends {ComponentConfiguration}
 * @deprecated Use AssetsManagerConfiguration instead
 */
export interface AssetsConfiguration extends ComponentConfiguration {
    /** HTTP endpoint path */
    endpoint: string
}

/**
 * Standard HTTP response structure for component endpoints.
 *
 * All component handlers return this structure to provide consistent
 * API responses across the digital twin system.
 *
 * @interface DataResponse
 *
 * @example
 * ```typescript
 * // Success response with JSON data
 * const response: DataResponse = {
 *   status: 200,
 *   content: JSON.stringify({ data: 'value' }),
 *   headers: { 'Content-Type': 'application/json' }
 * }
 *
 * // Binary response for file download
 * const fileResponse: DataResponse = {
 *   status: 200,
 *   content: fileBuffer,
 *   headers: {
 *     'Content-Type': 'application/octet-stream',
 *     'Content-Disposition': 'attachment; filename="data.bin"'
 *   }
 * }
 * ```
 */
export interface DataResponse {
    /** HTTP status code (200, 400, 401, 404, 500, etc.) */
    status: number
    /** Response body (Buffer for binary, string for text/JSON) */
    content: Buffer | string
    /** Optional HTTP headers to include in response */
    headers?: Record<string, string>
}

/**
 * Configuration for CustomTableManager components.
 *
 * Allows defining custom database tables with arbitrary columns
 * and optional custom endpoints for specialized data management.
 *
 * @interface StoreConfiguration
 *
 * @example
 * ```typescript
 * const config: StoreConfiguration = {
 *   name: 'wms_layers',
 *   description: 'Manage WMS map layers',
 *   columns: {
 *     wms_url: 'text not null',
 *     layer_name: 'text not null',
 *     active: 'boolean default true'
 *   },
 *   endpoints: [
 *     { path: '/toggle/:id', method: 'put', handler: 'toggleLayer' }
 *   ]
 * }
 * ```
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
 *
 * @interface EndpointDefinition
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
