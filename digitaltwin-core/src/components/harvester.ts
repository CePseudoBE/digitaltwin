import type { Component, ScheduleRunnable, Servable } from './interfaces.js'
import type { DataResponse, HarvesterConfiguration } from './types.js'
import type { DataRecord } from '../types/data_record.js'
import type { DatabaseAdapter } from '../database/database_adapter.js'
import type { StorageService } from '../storage/storage_service.js'
import type { HttpMethod } from '../engine/endpoints.js'
import type { OpenAPIDocumentable, OpenAPIComponentSpec } from '../openapi/types.js'

/**
 * Result of source range parsing for harvester data retrieval.
 *
 * Defines the time range and limits for data harvesting operations
 * based on the parsed source_range configuration.
 */
interface SourceRangeResult {
    /** Starting date for the data range */
    startDate: Date

    /** Optional ending date for time-based ranges */
    endDate?: Date

    /** Optional record limit for count-based ranges */
    limit?: number
}

/**
 * Utility class for parsing harvester source range configurations.
 *
 * Handles conversion of various source range formats (time-based like '1h', '30m'
 * or count-based like '100') into structured date ranges for data retrieval.
 *
 * @example
 * ```typescript
 * // Parse time-based range: get data from last hour
 * const result = SourceRangeParser.parseSourceRange(new Date(), '1h');
 *
 * // Parse count-based range: get last 50 records
 * const result = SourceRangeParser.parseSourceRange(new Date(), 50);
 * ```
 */
class SourceRangeParser {
    private static readonly ZERO_DATE = new Date('1970-01-01T00:00:00Z')

    /**
     * Gets the zero date used as fallback for empty datasets.
     *
     * @returns Unix epoch date (1970-01-01T00:00:00Z)
     */
    static get zeroDate(): Date {
        return new Date(this.ZERO_DATE)
    }

    /**
     * Parses source range configuration into a structured result.
     *
     * @param latestDate - The latest date in the existing data
     * @param sourceRange - Range specification (e.g., '1h', '30m', '7d', or number for count)
     * @returns Parsed range result with start/end dates or record limit
     *
     * @throws {Error} When source range format is invalid
     */
    static parseSourceRange(latestDate: Date, sourceRange?: string | number): SourceRangeResult {
        if (!sourceRange) {
            return { startDate: latestDate, limit: 1 }
        }

        // If it's a number or numeric string (limit mode)
        if (typeof sourceRange === 'number' || /^\d+$/.test(sourceRange)) {
            return { startDate: latestDate, limit: Number(sourceRange) }
        }

        const sourceRangeStr = sourceRange.toString()
        let value: number
        let unit: string

        // Parse time-based ranges
        if (sourceRangeStr.includes('d')) {
            value = parseInt(sourceRangeStr.replace('d', ''))
            unit = 'days'
        } else if (sourceRangeStr.includes('h')) {
            value = parseInt(sourceRangeStr.replace('h', ''))
            unit = 'hours'
        } else if (sourceRangeStr.includes('m')) {
            value = parseInt(sourceRangeStr.replace('m', ''))
            unit = 'minutes'
        } else if (sourceRangeStr.includes('s')) {
            value = parseInt(sourceRangeStr.replace('s', ''))
            unit = 'seconds'
        } else {
            throw new Error(`Invalid source range format: ${sourceRange}`)
        }

        // For time-based ranges, start from latestDate and go forward
        const startDate = latestDate
        const endDate = this.addTime(startDate, value, unit)

        return { startDate, endDate }
    }

    /**
     * Adds time to a date based on the specified unit.
     *
     * @param date - Base date to add time to
     * @param value - Amount of time to add
     * @param unit - Time unit ('days', 'hours', 'minutes', 'seconds')
     * @returns New date with added time
     */
    private static addTime(date: Date, value: number, unit: string): Date {
        const result = new Date(date)

        switch (unit) {
            case 'days':
                result.setDate(result.getDate() + value)
                break
            case 'hours':
                result.setHours(result.getHours() + value)
                break
            case 'minutes':
                result.setMinutes(result.getMinutes() + value)
                break
            case 'seconds':
                result.setSeconds(result.getSeconds() + value)
                break
        }

        return result
    }
}

/**
 * Abstract base class for data harvesting components.
 *
 * Harvesters process and analyze data that has been collected by Collectors,
 * applying transformations, aggregations, or other data processing operations.
 * They can be triggered by new source data or run on a schedule.
 *
 * Key features:
 * - Process existing collected data with configurable ranges
 * - Support both time-based and count-based data retrieval
 * - Can be triggered by source data changes or scheduled execution
 * - Provide HTTP endpoints for accessing processed results
 *
 * @example
 * ```typescript
 * class TrafficAnalysisHarvester extends Harvester {
 *   getUserConfiguration() {
 *     return {
 *       name: 'traffic-analysis',
 *       type: 'harvester',
 *       source: 'traffic-collector',
 *       source_range: '1h', // Process last hour of data
 *       schedule: '0 *\/15 * * * *' // Run every 15 minutes
 *     };
 *   }
 *
 *   async harvest(data: DataRecord[]): Promise<DataRecord[]> {
 *     // Process traffic data and return analysis results
 *     return this.analyzeTrafficPatterns(data);
 *   }
 * }
 * ```
 */
export abstract class Harvester
    implements Component<HarvesterConfiguration>, ScheduleRunnable, Servable, OpenAPIDocumentable
{
    protected db!: DatabaseAdapter
    protected storage!: StorageService
    private _configCache?: HarvesterConfiguration

    /**
     * Injects database and storage dependencies into the harvester.
     *
     * Called during component initialization to provide access to
     * data storage and file operations.
     *
     * @param db - Database adapter for reading source data
     * @param storage - Storage service for file operations
     */
    setDependencies(db: DatabaseAdapter, storage: StorageService) {
        this.db = db
        this.storage = storage
    }

    /**
     * Provides the basic harvester configuration.
     *
     * Implementations must return configuration specifying the harvester's
     * name, data source, processing range, and scheduling information.
     *
     * @returns Basic harvester configuration without defaults applied
     *
     * @example
     * ```typescript
     * getUserConfiguration() {
     *   return {
     *     name: 'weather-analysis',
     *     type: 'harvester',
     *     source: 'weather-collector',
     *     source_range: '24h',
     *     schedule: '0 0 * * * *' // Daily at midnight
     *   };
     * }
     * ```
     */
    abstract getUserConfiguration(): HarvesterConfiguration

    /**
     * Returns the complete harvester configuration with defaults applied.
     *
     * Merges user configuration with sensible defaults for optional settings.
     * This final configuration is used by the engine and scheduler.
     *
     * @returns Complete configuration with all defaults applied
     */
    getConfiguration(): HarvesterConfiguration {
        if (this._configCache) {
            return this._configCache
        }

        const userConfig = this.getUserConfiguration()

        // Apply defaults first, then user config
        const defaults: Partial<HarvesterConfiguration> = {
            triggerMode: 'on-source',
            source_range: 1,
            multiple_results: false,
            source_range_min: false,
            debounceMs: 1000,
            dependencies: [],
            dependenciesLimit: []
        }

        this._configCache = {
            ...defaults,
            ...userConfig
        } as HarvesterConfiguration

        return this._configCache
    }

    /**
     * Returns the cron schedule for this harvester.
     *
     * For 'on-source' trigger mode, returns empty string (no schedule).
     * For 'scheduled' mode, uses the provided schedule or defaults to every minute.
     *
     * @returns Cron expression string or empty string for source-triggered mode
     */
    getSchedule(): string {
        const config = this.getConfiguration()
        if (config.triggerMode === 'on-source') {
            return ''
        }
        // Default to every minute instead of every second
        return '0 * * * * *'
    }

    /**
     * Allows subclasses to define a custom schedule.
     *
     * Override this method to provide a custom cron expression
     * that differs from the default every-minute schedule.
     *
     * @returns Custom cron expression string
     *
     * @example
     * ```typescript
     * getCustomSchedule() {
     *   return '0 0 *\/6 * * *'; // Every 6 hours
     * }
     * ```
     */
    getCustomSchedule?(): string

    /**
     * Processes source data and returns harvested results.
     *
     * This is the main data processing method that implementations must provide.
     * It receives source data (from the configured source component) and any
     * dependency data, then performs analysis, transformation, or aggregation.
     *
     * @param sourceData - Data from the source component (single record or array)
     * @param dependenciesData - Data from dependency components, keyed by component name
     * @returns Processed data as Buffer(s) to be stored
     *
     * @example
     * ```typescript
     * async harvest(sourceData: DataRecord[], dependenciesData: Record<string, DataRecord[]>) {
     *   const trafficData = sourceData.map(r => JSON.parse(r.data.toString()));
     *   const analysis = this.performTrafficAnalysis(trafficData);
     *   return Buffer.from(JSON.stringify(analysis));
     * }
     * ```
     */
    abstract harvest(
        sourceData: DataRecord | DataRecord[],
        dependenciesData: Record<string, DataRecord | DataRecord[] | null>
    ): Promise<Buffer | Buffer[]>

    /**
     * Main execution method for the harvester.
     *
     * Orchestrates the harvesting process by:
     * 1. Determining the date range for data retrieval
     * 2. Fetching source and dependency data
     * 3. Calling the harvest method with the data
     * 4. Storing the results in the database
     *
     * @returns True if harvesting was successful, false if no data to process
     *
     * @throws {Error} When source component is not specified
     * @throws {Error} When data processing fails
     */
    async run(): Promise<boolean> {
        const config = this.getConfiguration()

        if (!config.source) {
            throw new Error(`Harvester ${config.name} must specify a source component`)
        }

        // Get the latest harvested date
        const latestHarvestedRecord = await this.db.getLatestByName(config.name)

        // Calculate the starting point for harvesting
        let latestDate: Date
        if (!latestHarvestedRecord) {
            // First run - get first source record and start from one second before
            const firstSourceRecord = await this.db.getFirstByName(config.source)
            if (!firstSourceRecord) {
                return false
            }
            latestDate = new Date(firstSourceRecord.date.getTime() - 1000)
        } else {
            latestDate = latestHarvestedRecord.date
        }

        // Parse source range
        const { startDate, endDate, limit } = SourceRangeParser.parseSourceRange(latestDate, config.source_range)

        // Get source data based on range
        const sourceData = await this.getSourceData(config.source, startDate, endDate, limit)

        if (!sourceData || sourceData.length === 0) {
            return false
        }

        // Check if we have enough data (strict mode)
        if (limit && config.source_range_min && sourceData.length < limit) {
            return false
        }

        // Calculate storage date
        const storageDate = endDate || sourceData[sourceData.length - 1].date

        // Prepare source data for harvesting
        const sourceForHarvesting = limit === 1 && !endDate ? sourceData[0] : sourceData

        // Get dependencies data
        const dependenciesData = await this.getDependenciesData(
            config.dependencies || [],
            config.dependenciesLimit || [],
            storageDate
        )

        // Execute harvesting
        const result = await this.harvest(sourceForHarvesting, dependenciesData)

        // Store results
        await this.storeResults(config, result, sourceData, storageDate)

        return true
    }

    /**
     * HTTP endpoints
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
     * Retrieve latest harvested data
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
     * Get source data within the specified range
     */
    private async getSourceData(
        sourceName: string,
        startDate: Date,
        endDate?: Date,
        limit?: number
    ): Promise<DataRecord[]> {
        let sourceData: DataRecord[]

        if (endDate) {
            // Time-based range: get records between startDate and endDate
            sourceData = await this.db.getByDateRange(sourceName, startDate, endDate, limit)
        } else if (limit) {
            // Count-based: get records after startDate with limit
            sourceData = await this.db.getAfterDate(sourceName, startDate, limit)
        } else {
            // Default: get latest record after startDate
            sourceData = await this.db.getAfterDate(sourceName, startDate, 1)
        }

        return sourceData
    }

    /**
     * Get data from dependent components
     */
    private async getDependenciesData(
        dependencies: string[],
        dependenciesLimit: number[],
        storageDate: Date
    ): Promise<Record<string, DataRecord | DataRecord[] | null>> {
        const dependenciesData: Record<string, DataRecord | DataRecord[] | null> = {}

        for (let i = 0; i < dependencies.length; i++) {
            const dependency = dependencies[i]
            const limit = dependenciesLimit[i] || 1

            if (limit === 1) {
                // Get single latest record before storage date
                const dependencyRecord = await this.db.getLatestBefore(dependency, storageDate)
                dependenciesData[dependency] = dependencyRecord || null
            } else {
                // Get multiple latest records before storage date
                const dependencyRecords = await this.db.getLatestRecordsBefore(dependency, storageDate, limit)
                dependenciesData[dependency] = dependencyRecords.length > 0 ? dependencyRecords : null
            }
        }

        return dependenciesData
    }

    /**
     * Store harvesting results
     */
    private async storeResults(
        config: HarvesterConfiguration,
        result: Buffer | Buffer[],
        sourceData: DataRecord | DataRecord[],
        storageDate: Date
    ): Promise<void> {
        if (config.multiple_results && Array.isArray(result) && Array.isArray(sourceData)) {
            // Store each result with its corresponding source date
            for (let i = 0; i < result.length; i++) {
                const item = result[i]
                const source = sourceData[i]

                const url = await this.storage.save(item, config.name)
                await this.db.save({
                    name: config.name,
                    type: config.contentType,
                    url,
                    date: source.date
                })
            }
        } else {
            // Store single result
            const buffer = Array.isArray(result) ? result[0] : result
            const url = await this.storage.save(buffer, config.name)

            await this.db.save({
                name: config.name,
                type: config.contentType,
                url,
                date: storageDate
            })
        }
    }

    /**
     * Returns the OpenAPI specification for this harvester's endpoints.
     *
     * Generates documentation for the GET endpoint that retrieves harvested data.
     * Can be overridden by subclasses for more detailed specifications.
     *
     * @returns {OpenAPIComponentSpec} OpenAPI paths, tags, and schemas for this harvester
     */
    getOpenAPISpec(): OpenAPIComponentSpec {
        const config = this.getConfiguration()
        const path = `/${config.endpoint}`
        const tagName = config.tags?.[0] || config.name

        return {
            paths: {
                [path]: {
                    get: {
                        summary: `Get ${config.name} harvested data`,
                        description: config.description,
                        tags: [tagName],
                        responses: {
                            '200': {
                                description: 'Latest harvested data',
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
