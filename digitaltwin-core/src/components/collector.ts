import type { Component, ScheduleRunnable, Servable } from './interfaces.js'
import type { CollectorConfiguration } from './types.js'
import type { DatabaseAdapter } from '../database/database_adapter.js'
import type { StorageService } from '../storage/storage_service.js'
import type { DataResponse } from './types.js'
import type { HttpMethod } from '../engine/endpoints.js'
import type { OpenAPIDocumentable, OpenAPIComponentSpec } from '../openapi/types.js'
import { engineEventBus } from '../engine/events.js'
import { StorageError } from '../errors/index.js'
import { Logger } from '../utils/logger.js'

/**
 * Abstract base class for data collection components in the Digital Twin framework.
 *
 * A Collector is responsible for:
 * - Fetching raw data from external sources on a scheduled basis
 * - Persisting data through the StorageService
 * - Indexing metadata via the DatabaseAdapter
 * - Exposing HTTP endpoints for data retrieval
 *
 * @abstract
 * @class Collector
 * @implements {Component<CollectorConfiguration>}
 * @implements {ScheduleRunnable}
 * @implements {Servable}
 *
 * @example
 * ```typescript
 * class WeatherCollector extends Collector {
 *   getConfiguration(): CollectorConfiguration {
 *     return {
 *       name: 'weather-data',
 *       description: 'Collects weather information from API',
 *       contentType: 'application/json',
 *       endpoint: 'weather'
 *     }
 *   }
 *
 *   getSchedule(): string {
 *     return '0 *\/15 * * * *' // Every 15 minutes
 *   }
 *
 *   async collect(): Promise<Buffer> {
 *     const response = await fetch('https://api.weather.com/data')
 *     return Buffer.from(await response.text())
 *   }
 * }
 * ```
 */
export abstract class Collector
    implements Component<CollectorConfiguration>, ScheduleRunnable, Servable, OpenAPIDocumentable
{
    /** Database adapter for persisting collection metadata */
    protected db!: DatabaseAdapter

    /** Storage service for persisting collected data blobs */
    protected storage!: StorageService

    /**
     * Injects required dependencies into the collector instance.
     *
     * Called by the Digital Twin Engine during component initialization.
     *
     * @param {DatabaseAdapter} db - Database adapter for metadata operations
     * @param {StorageService} storage - Storage service for data persistence
     *
     * @example
     * ```typescript
     * const collector = new MyCollector()
     * collector.setDependencies(databaseAdapter, storageService)
     * ```
     */
    setDependencies(db: DatabaseAdapter, storage: StorageService) {
        this.db = db
        this.storage = storage
    }

    /**
     * Returns the static configuration defining this collector's behavior.
     *
     * The configuration includes the collector name, description, content type,
     * and HTTP endpoint path for data retrieval.
     *
     * @abstract
     * @returns {CollectorConfiguration} The collector configuration
     *
     * @example
     * ```typescript
     * getConfiguration(): CollectorConfiguration {
     *   return {
     *     name: 'sensor-data',
     *     description: 'IoT sensor data collector',
     *     contentType: 'application/json',
     *     endpoint: 'sensors'
     *   }
     * }
     * ```
     */
    abstract getConfiguration(): CollectorConfiguration

    /**
     * Returns a cron expression defining when this collector should execute.
     *
     * Uses standard cron syntax: `second minute hour day month weekday`
     *
     * @abstract
     * @returns {string} Cron expression for scheduling
     *
     * @example
     * ```typescript
     * getSchedule(): string {
     *   return '0 *\/5 * * * *' // Every 5 minutes
     * }
     *
     * // Common patterns:
     * // '0 0 * * * *'     - Every hour
     * // '0 *\/30 * * * *'  - Every 30 minutes
     * // '0 0 9 * * *'     - Every day at 9 AM
     * ```
     */
    abstract getSchedule(): string

    /**
     * Implements the core data collection logic.
     *
     * This method contains the specific logic for fetching data from your source
     * (APIs, files, databases, sensors, etc.). The returned Buffer will be
     * persisted by the framework.
     *
     * @abstract
     * @returns {Promise<Buffer>} Raw collected data as Buffer
     * @throws {Error} When collection fails
     *
     * @example
     * ```typescript
     * async collect(): Promise<Buffer> {
     *   try {
     *     const response = await fetch('https://api.example.com/data')
     *     const data = await response.json()
     *     return Buffer.from(JSON.stringify(data))
     *   } catch (error) {
     *     throw new Error(`Failed to collect data: ${error.message}`)
     *   }
     * }
     * ```
     */
    abstract collect(): Promise<Buffer>

    /**
     * Executes the complete collection workflow.
     *
     * This method orchestrates the collection process:
     * 1. Calls the collect() method to fetch data
     * 2. Persists data through StorageService
     * 3. Saves metadata to DatabaseAdapter
     * 4. Emits completion events
     *
     * Called automatically by the scheduler based on getSchedule().
     *
     * @returns {Promise<Buffer | void>} The collected data buffer, or void if no data
     * @throws {Error} When storage or database operations fail
     *
     * @example
     * ```typescript
     * // Called automatically by the framework:
     * const result = await collector.run()
     * if (result) {
     *   console.log(`Collected ${result.length} bytes`)
     * }
     * ```
     */
    async run(): Promise<Buffer | void> {
        const config = this.getConfiguration()
        const logger = new Logger(`Collector:${config.name}`)

        try {
            const result = await this.collect()

            if (result) {
                const now = new Date()

                const url = await this.storage.save(result, config.name)

                await this.db.save({
                    name: config.name,
                    type: config.contentType,
                    url,
                    date: now
                })

                // Emit completion event for monitoring and integration
                engineEventBus.emit('component:event', {
                    type: 'collector:completed',
                    componentName: config.name,
                    timestamp: now,
                    data: { bytesCollected: result.length }
                })
            }

            return result
        } catch (error) {
            logger.error(`Collector execution failed: ${error instanceof Error ? error.message : String(error)}`, {
                collectorName: config.name,
                stack: error instanceof Error ? error.stack : undefined
            })
            throw new StorageError(
                `Collector ${config.name} execution failed: ${error instanceof Error ? error.message : String(error)}`,
                { collectorName: config.name }
            )
        }
    }

    /**
     * Defines HTTP endpoints exposed by this collector.
     *
     * By default, exposes a GET endpoint at the configured path that returns
     * the most recently collected data.
     *
     * @returns {Array} Array of endpoint descriptors
     *
     * @example
     * ```typescript
     * // For a collector with endpoint: 'weather'
     * // Exposes: GET /weather
     * ```
     */
    getEndpoints(): Array<{
        method: HttpMethod
        path: string
        handler: (...args: any[]) => any
        responseType?: string
    }> {
        return [
            {
                method: 'get',
                path: `/${this.getConfiguration().endpoint}`,
                handler: this.retrieve.bind(this),
                responseType: this.getConfiguration().contentType
            }
        ]
    }

    /**
     * HTTP handler for retrieving the most recently collected data.
     *
     * Returns the latest data collected by this collector with appropriate
     * content headers. Used by the framework to serve HTTP requests.
     *
     * @returns {Promise<DataResponse>} HTTP response with data or error status
     *
     * @example
     * ```typescript
     * // GET /weather -> Returns latest weather data
     * // Response: { status: 200, content: Buffer, headers: {...} }
     * ```
     */
    async retrieve(): Promise<DataResponse> {
        const config = this.getConfiguration()
        const record = await this.db.getLatestByName(config.name)

        if (!record) {
            return {
                status: 404,
                content: 'No data available'
            }
        }

        const blob = await record.data()

        return {
            status: 200,
            content: blob,
            headers: { 'Content-Type': record.contentType }
        }
    }

    /**
     * Returns the OpenAPI specification for this collector's endpoints.
     *
     * Generates documentation for the GET endpoint that retrieves collected data.
     * Can be overridden by subclasses for more detailed specifications.
     *
     * @returns {OpenAPIComponentSpec} OpenAPI paths, tags, and schemas for this collector
     */
    getOpenAPISpec(): OpenAPIComponentSpec {
        const config = this.getConfiguration()
        const path = `/${config.endpoint}`
        const tagName = config.tags?.[0] || config.name

        return {
            paths: {
                [path]: {
                    get: {
                        summary: `Get ${config.name} data`,
                        description: config.description,
                        tags: [tagName],
                        responses: {
                            '200': {
                                description: 'Latest collected data',
                                content: {
                                    [config.contentType]: {
                                        schema: { type: 'object' }
                                    }
                                }
                            },
                            '404': {
                                description: 'No data available'
                            }
                        }
                    }
                }
            },
            tags: [
                {
                    name: tagName,
                    description: config.description
                }
            ]
        }
    }
}
