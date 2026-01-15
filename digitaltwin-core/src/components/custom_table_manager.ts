import type { Servable } from './interfaces.js'
import type { StoreConfiguration, DataResponse } from './types.js'
import type { DatabaseAdapter } from '../database/database_adapter.js'
import type { HttpMethod } from '../engine/endpoints.js'
import type { UserRecord } from '../auth/types.js'
import type { OpenAPIDocumentable, OpenAPIComponentSpec } from '../openapi/types.js'
import { UserService } from '../auth/user_service.js'
import { ApisixAuthParser } from '../auth/apisix_parser.js'
import { validateIdParam, validateCustomRecordCreate, validateCustomRecordUpdate } from '../validation/index.js'
import { validateData, validateParams } from '../validation/validate.js'
import { DigitalTwinError } from '../errors/index.js'

/**
 * Helper to create error response with proper status code for DigitalTwinError
 */
function createErrorResponse(error: unknown): DataResponse {
    const statusCode = error instanceof DigitalTwinError ? error.statusCode : 500
    const message = error instanceof Error ? error.message : 'Unknown error'
    return {
        status: statusCode,
        content: JSON.stringify({ error: message }),
        headers: { 'Content-Type': 'application/json' }
    }
}

/**
 * Record representing a row in the custom table
 */
export interface CustomTableRecord {
    id: number
    owner_id?: number
    created_at: Date
    updated_at: Date
    [key: string]: any
}

/**
 * Query validation options
 */
export interface QueryValidationOptions {
    /** Required fields that must have non-empty values */
    required?: string[]
    /** Custom validation function */
    validate?: (conditions: Record<string, any>) => void
}

/**
 * Abstract base class for Custom Table Manager components in the Digital Twin framework.
 *
 * A CustomTableManager is responsible for:
 * - Managing structured data in database tables with custom columns
 * - Providing CRUD operations for the data with validation
 * - Exposing HTTP endpoints for data manipulation
 * - Creating and managing database schema automatically
 *
 * Unlike other components, CustomTableManager does NOT handle files - only structured data.
 *
 * @abstract
 * @class CustomTableManager
 * @implements {Component}
 * @implements {Servable}
 *
 * @example
 * ```typescript
 * class WMSManager extends CustomTableManager {
 *   getConfiguration(): StoreConfiguration {
 *     return {
 *       name: 'wms_layers',
 *       description: 'Manage WMS layers for mapping',
 *       columns: {
 *         'wms_url': 'text not null',
 *         'layer_name': 'text not null',
 *         'description': 'text',
 *         'active': 'boolean default true'
 *       },
 *       endpoints: [
 *         { path: '/add-layers', method: 'post', handler: 'addLayers' }
 *       ]
 *     }
 *   }
 *
 *   async addLayers(req: any): Promise<DataResponse> {
 *     // Custom endpoint implementation
 *   }
 * }
 * ```
 */
/**
 * Base component interface for CustomTableManager (doesn't extend ComponentConfiguration)
 */
export interface CustomTableComponent {
    getConfiguration(): StoreConfiguration
}

export abstract class CustomTableManager implements CustomTableComponent, Servable, OpenAPIDocumentable {
    /** Database adapter for data operations */
    protected db!: DatabaseAdapter

    /** User service for authentication and authorization */
    protected userService!: UserService

    /** Cached table name from configuration */
    protected tableName!: string

    /**
     * Injects required dependencies into the custom table manager instance.
     *
     * Called by the Digital Twin Engine during component initialization.
     *
     * @param {DatabaseAdapter} db - Database adapter for data operations
     *
     * @example
     * ```typescript
     * const customTableManager = new MyCustomTableManager()
     * customTableManager.setDependencies(databaseAdapter)
     * ```
     */
    setDependencies(db: DatabaseAdapter): void {
        this.db = db
        this.userService = new UserService(db)
        this.tableName = this.getConfiguration().name
    }

    /**
     * Returns the static configuration defining this custom table manager's behavior.
     *
     * The configuration includes the table name, description,
     * custom columns definition, and optional custom endpoints.
     *
     * @abstract
     * @returns {StoreConfiguration} The table configuration
     *
     * @example
     * ```typescript
     * getConfiguration(): StoreConfiguration {
     *   return {
     *     name: 'sensors',
     *     description: 'IoT sensors data store',
     *     columns: {
     *       'sensor_id': 'text unique not null',
     *       'type': 'text not null',
     *       'location': 'text',
     *       'active': 'boolean default true',
     *       'last_ping': 'timestamp'
     *     }
     *   }
     * }
     * ```
     */
    abstract getConfiguration(): StoreConfiguration

    /**
     * Initialize the database table with custom columns.
     *
     * Creates the table if it doesn't exist, with standard columns (id, created_at, updated_at)
     * plus the custom columns defined in the configuration.
     * Automatically adds an 'owner_id' column for user ownership tracking.
     *
     * @returns {Promise<void>}
     *
     * @example
     * ```typescript
     * // Called automatically by the framework
     * await customTableManager.initializeTable()
     * ```
     */
    async initializeTable(): Promise<void> {
        const config = this.getConfiguration()

        // Add owner_id column automatically for user ownership
        const columnsWithOwnership = {
            owner_id: 'integer',
            ...config.columns
        }

        // Use the new createTableWithColumns method from DatabaseAdapter
        await this.db.createTableWithColumns(config.name, columnsWithOwnership)
    }

    /**
     * Validate query conditions against requirements.
     *
     * @private
     * @param {Record<string, any>} conditions - Conditions to validate
     * @param {QueryValidationOptions} options - Validation options
     * @throws {Error} If validation fails
     */
    private validateQuery(conditions: Record<string, any>, options?: QueryValidationOptions): void {
        if (!options) return

        // Check required fields
        if (options.required) {
            for (const field of options.required) {
                if (!(field in conditions)) {
                    throw new Error(`Field '${field}' is required`)
                }

                const value = conditions[field]
                if (value == null || value === '') {
                    throw new Error(`Field '${field}' must have a non-empty value`)
                }
            }
        }

        // Custom validation
        if (options.validate) {
            try {
                options.validate(conditions)
            } catch (error) {
                throw new Error(
                    `Validation failed: ${error instanceof Error ? error.message : 'Unknown validation error'}`
                )
            }
        }
    }

    /**
     * Create a new record in the custom table.
     *
     * @param {Record<string, any>} data - Data to insert (excluding id, created_at, updated_at)
     * @returns {Promise<number>} The ID of the created record
     *
     * @example
     * ```typescript
     * const id = await customTableManager.create({
     *   sensor_id: 'TEMP001',
     *   type: 'temperature',
     *   location: 'Building A - Floor 1',
     *   active: true
     * })
     * console.log(`Created sensor with ID: ${id}`)
     * ```
     */
    async create(data: Record<string, any>): Promise<number> {
        // Use the specialized method for custom tables
        return await this.db.insertCustomTableRecord(this.tableName, data)
    }

    /**
     * Find all records in the custom table.
     *
     * @returns {Promise<CustomTableRecord[]>} Array of all records
     *
     * @example
     * ```typescript
     * const allSensors = await customTableManager.findAll()
     * console.log(`Found ${allSensors.length} sensors`)
     * ```
     */
    async findAll(): Promise<CustomTableRecord[]> {
        // Use specialized method for custom tables that returns raw rows
        const records = await this.db.findCustomTableRecords(this.tableName, {})

        return records.map(record => ({
            id: record.id,
            created_at: new Date(record.created_at),
            updated_at: new Date(record.updated_at),
            ...this.extractCustomFields(record)
        }))
    }

    /**
     * Find a record by its ID.
     *
     * @param {number} id - The record ID to find
     * @returns {Promise<CustomTableRecord | null>} The record or null if not found
     *
     * @example
     * ```typescript
     * const sensor = await customTableManager.findById(123)
     * if (sensor) {
     *   console.log(`Sensor: ${sensor.sensor_id}`)
     * }
     * ```
     */
    async findById(id: number): Promise<CustomTableRecord | null> {
        const record = await this.db.getCustomTableRecordById(this.tableName, id)

        if (!record) {
            return null
        }

        return {
            id: record.id,
            created_at: new Date(record.created_at),
            updated_at: new Date(record.updated_at),
            ...this.extractCustomFields(record)
        }
    }

    /**
     * Find records by a single column value with optional validation.
     *
     * @param {string} columnName - Name of the column to search by
     * @param {any} value - Value to search for
     * @param {boolean} required - Whether the value is required (default: true)
     * @returns {Promise<CustomTableRecord[]>} Array of matching records
     *
     * @example
     * ```typescript
     * const wmsLayers = await wmsManager.findByColumn('wms_url', 'https://example.com/wms')
     * const activeLayers = await wmsManager.findByColumn('active', true)
     *
     * // Optional value (won't throw if empty)
     * const layers = await wmsManager.findByColumn('description', '', false)
     * ```
     */
    async findByColumn(columnName: string, value: any, required: boolean = true): Promise<CustomTableRecord[]> {
        if (required && (value == null || value === '')) {
            throw new Error(`Value for column '${columnName}' is required and cannot be empty`)
        }

        return this.findByCondition({ [columnName]: value })
    }

    /**
     * Find records by multiple column values with validation support.
     *
     * @param {Record<string, any>} conditions - Key-value pairs to match
     * @param {QueryValidationOptions} options - Validation options
     * @returns {Promise<CustomTableRecord[]>} Array of matching records
     *
     * @example
     * ```typescript
     * // Simple query
     * const layers = await wmsManager.findByColumns({
     *   wms_url: 'https://example.com/wms',
     *   active: true
     * })
     *
     * // With validation
     * const layers = await wmsManager.findByColumns(
     *   { wms_url: wmsUrl, projection: projection },
     *   {
     *     required: ['wms_url', 'projection'],
     *     validate: (conditions) => {
     *       if (!conditions.wms_url.startsWith('http')) {
     *         throw new Error('WMS URL must start with http or https')
     *       }
     *     }
     *   }
     * )
     * ```
     */
    async findByColumns(
        conditions: Record<string, any>,
        options?: QueryValidationOptions
    ): Promise<CustomTableRecord[]> {
        this.validateQuery(conditions, options)
        return this.findByCondition(conditions)
    }

    /**
     * Find records matching specific conditions (base method).
     *
     * @param {Record<string, any>} conditions - Key-value pairs to match
     * @returns {Promise<CustomTableRecord[]>} Array of matching records
     *
     * @example
     * ```typescript
     * const activeSensors = await customTableManager.findByCondition({ active: true })
     * const tempSensors = await customTableManager.findByCondition({ type: 'temperature' })
     * ```
     */
    async findByCondition(conditions: Record<string, any>): Promise<CustomTableRecord[]> {
        const records = await this.db.findCustomTableRecords(this.tableName, conditions)

        return records.map(record => ({
            id: record.id,
            created_at: new Date(record.created_at),
            updated_at: new Date(record.updated_at),
            ...this.extractCustomFields(record)
        }))
    }

    /**
     * Update a record by its ID.
     *
     * @param {number} id - The record ID to update
     * @param {Record<string, any>} data - Data to update (excluding id, created_at)
     * @returns {Promise<void>}
     *
     * @example
     * ```typescript
     * await customTableManager.update(123, {
     *   active: false,
     *   last_ping: new Date()
     * })
     * ```
     */
    async update(id: number, data: Record<string, any>): Promise<void> {
        // Use the new efficient SQL UPDATE method
        await this.db.updateById(this.tableName, id, data)
    }

    /**
     * Delete a record by its ID.
     *
     * @param {number} id - The record ID to delete
     * @returns {Promise<void>}
     *
     * @example
     * ```typescript
     * await customTableManager.delete(123)
     * console.log('Sensor deleted successfully')
     * ```
     */
    async delete(id: number): Promise<void> {
        await this.db.delete(id.toString(), this.tableName)
    }

    /**
     * Delete records by a single column value.
     *
     * @param {string} columnName - Name of the column to match for deletion
     * @param {any} value - Value to match for deletion
     * @returns {Promise<number>} Number of records deleted
     *
     * @example
     * ```typescript
     * const deleted = await wmsManager.deleteByColumn('active', false)
     * console.log(`Deleted ${deleted} inactive layers`)
     * ```
     */
    async deleteByColumn(columnName: string, value: any): Promise<number> {
        return this.deleteByCondition({ [columnName]: value })
    }

    /**
     * Delete records matching specific conditions.
     *
     * @param {Record<string, any>} conditions - Key-value pairs to match for deletion
     * @returns {Promise<number>} Number of records deleted
     *
     * @example
     * ```typescript
     * const deleted = await customTableManager.deleteByCondition({ active: false })
     * console.log(`Deleted ${deleted} inactive sensors`)
     * ```
     */
    async deleteByCondition(conditions: Record<string, any>): Promise<number> {
        const recordsToDelete = await this.findByCondition(conditions)

        for (const record of recordsToDelete) {
            await this.delete(record.id)
        }

        return recordsToDelete.length
    }

    /**
     * Extract custom fields from a database record, excluding framework fields.
     *
     * @private
     * @param {any} record - Database record
     * @returns {Record<string, any>} Custom fields only (including owner_id)
     */
    private extractCustomFields(record: any): Record<string, any> {
        const config = this.getConfiguration()
        const customFields: Record<string, any> = {}

        // Add owner_id if present
        if ('owner_id' in record) {
            customFields.owner_id = record.owner_id
        }

        // Add all configured custom columns
        for (const columnName of Object.keys(config.columns)) {
            if (columnName in record) {
                customFields[columnName] = record[columnName]
            }
        }

        return customFields
    }

    /**
     * AUTHENTICATION HELPERS
     * These methods help custom endpoints implement authentication and authorization.
     */

    /**
     * Authenticate a request and return the user record.
     *
     * Use this for endpoints that require authentication but don't need ownership checks.
     *
     * @protected
     * @param {any} req - HTTP request object
     * @returns {Promise<UserRecord | null>} User record if authenticated, null otherwise
     *
     * @example
     * ```typescript
     * async myCustomEndpoint(req: any): Promise<DataResponse> {
     *   const userRecord = await this.authenticateRequest(req)
     *   if (!userRecord) {
     *     return this.authErrorResponse()
     *   }
     *
     *   // Use userRecord.id for your logic
     *   console.log(`User ${userRecord.id} is authenticated`)
     * }
     * ```
     */
    protected async authenticateRequest(req: any): Promise<UserRecord | null> {
        if (!ApisixAuthParser.hasValidAuth(req.headers || {})) {
            return null
        }

        const authUser = ApisixAuthParser.parseAuthHeaders(req.headers || {})
        if (!authUser) {
            return null
        }

        const userRecord = await this.userService.findOrCreateUser(authUser)
        if (!userRecord.id) {
            return null
        }

        return userRecord
    }

    /**
     * Authenticate a request and verify the user owns the specified record.
     *
     * Use this for endpoints that modify or delete specific records.
     *
     * @protected
     * @param {any} req - HTTP request object
     * @param {number} recordId - ID of the record to check ownership for
     * @returns {Promise<{ userRecord: UserRecord; record: CustomTableRecord } | null>}
     *   Both user and record if authenticated and owns the record, null otherwise
     *
     * @example
     * ```typescript
     * async deleteMyRecord(req: any): Promise<DataResponse> {
     *   const recordId = parseInt(req.params.id)
     *   const auth = await this.authenticateAndCheckOwnership(req, recordId)
     *
     *   if (!auth) {
     *     return this.authErrorResponse()
     *   }
     *
     *   if (auth.record.owner_id !== auth.userRecord.id) {
     *     return this.forbiddenErrorResponse()
     *   }
     *
     *   await this.delete(recordId)
     *   return { status: 200, content: JSON.stringify({ message: 'Deleted' }) }
     * }
     * ```
     */
    protected async authenticateAndCheckOwnership(
        req: any,
        recordId: number
    ): Promise<{ userRecord: UserRecord; record: CustomTableRecord } | null> {
        const userRecord = await this.authenticateRequest(req)
        if (!userRecord) {
            return null
        }

        const record = await this.findById(recordId)
        if (!record) {
            return null
        }

        return { userRecord, record }
    }

    /**
     * Get authenticated user from request, throwing an error response if not authenticated.
     *
     * Use this when authentication is required and you want to fail fast.
     *
     * @protected
     * @param {any} req - HTTP request object
     * @returns {Promise<UserRecord | DataResponse>} User record if authenticated, error response otherwise
     *
     * @example
     * ```typescript
     * async myProtectedEndpoint(req: any): Promise<DataResponse> {
     *   const userOrError = await this.requireAuthentication(req)
     *   if ('status' in userOrError) {
     *     return userOrError  // Return error response
     *   }
     *
     *   const userRecord = userOrError
     *   // Continue with authenticated user
     * }
     * ```
     */
    protected async requireAuthentication(req: any): Promise<UserRecord | DataResponse> {
        const userRecord = await this.authenticateRequest(req)
        if (!userRecord) {
            return this.authErrorResponse()
        }
        return userRecord
    }

    /**
     * Helper to return a 401 Unauthorized error response.
     *
     * @protected
     * @param {string} message - Custom error message (default: "Authentication required")
     * @returns {DataResponse} 401 error response
     *
     * @example
     * ```typescript
     * if (!userRecord) {
     *   return this.authErrorResponse()
     * }
     * ```
     */
    protected authErrorResponse(message: string = 'Authentication required'): DataResponse {
        return {
            status: 401,
            content: JSON.stringify({ error: message }),
            headers: { 'Content-Type': 'application/json' }
        }
    }

    /**
     * Helper to return a 403 Forbidden error response.
     *
     * @protected
     * @param {string} message - Custom error message (default: "You don't have permission to access this resource")
     * @returns {DataResponse} 403 error response
     *
     * @example
     * ```typescript
     * if (record.owner_id !== userRecord.id) {
     *   return this.forbiddenErrorResponse('You can only modify your own records')
     * }
     * ```
     */
    protected forbiddenErrorResponse(
        message: string = "You don't have permission to access this resource"
    ): DataResponse {
        return {
            status: 403,
            content: JSON.stringify({ error: message }),
            headers: { 'Content-Type': 'application/json' }
        }
    }

    /**
     * Helper to check if a user owns a specific record.
     *
     * Returns false if the record doesn't have an owner_id (legacy records without ownership).
     *
     * @protected
     * @param {CustomTableRecord} record - The record to check
     * @param {UserRecord} userRecord - The user to check against
     * @returns {boolean} True if user owns the record, false otherwise
     *
     * @example
     * ```typescript
     * const record = await this.findById(recordId)
     * const userRecord = await this.authenticateRequest(req)
     *
     * if (!this.userOwnsRecord(record, userRecord)) {
     *   return this.forbiddenErrorResponse()
     * }
     * ```
     */
    protected userOwnsRecord(record: CustomTableRecord, userRecord: UserRecord): boolean {
        // If record doesn't have an owner_id, deny access for security
        if (!record.owner_id) {
            return false
        }
        return record.owner_id === userRecord.id
    }

    /**
     * Get HTTP endpoints exposed by this custom table manager.
     *
     * Returns both standard CRUD endpoints and custom endpoints defined in configuration.
     *
     * @returns {Array} Array of endpoint descriptors with methods, paths, and handlers
     *
     * @example
     * ```typescript
     * // Standard endpoints for a table named 'sensors':
     * GET    /sensors         - Get all records
     * POST   /sensors         - Create new record
     * GET    /sensors/:id     - Get specific record
     * PUT    /sensors/:id     - Update specific record
     * DELETE /sensors/:id     - Delete specific record
     *
     * // Plus any custom endpoints defined in configuration
     * ```
     */
    getEndpoints(): Array<{
        method: HttpMethod
        path: string
        handler: (...args: any[]) => any
        responseType?: string
    }> {
        const config = this.getConfiguration()
        const endpoints = []

        // Custom endpoints from configuration - MUST be registered BEFORE :id routes
        // to avoid Express matching /proxy as /:id
        if (config.endpoints) {
            for (const endpoint of config.endpoints) {
                const handlerMethod = (this as any)[endpoint.handler]
                if (typeof handlerMethod === 'function') {
                    endpoints.push({
                        method: endpoint.method as HttpMethod,
                        path: `/${config.name}${endpoint.path}`,
                        handler: handlerMethod.bind(this),
                        responseType: endpoint.responseType || 'application/json'
                    })
                }
            }
        }

        // Standard CRUD endpoints
        endpoints.push({
            method: 'get' as HttpMethod,
            path: `/${config.name}`,
            handler: this.handleGetAll.bind(this),
            responseType: 'application/json'
        })

        endpoints.push({
            method: 'post' as HttpMethod,
            path: `/${config.name}`,
            handler: this.handleCreate.bind(this),
            responseType: 'application/json'
        })

        // :id routes MUST come AFTER custom endpoints
        endpoints.push({
            method: 'get' as HttpMethod,
            path: `/${config.name}/:id`,
            handler: this.handleGetById.bind(this),
            responseType: 'application/json'
        })

        endpoints.push({
            method: 'put' as HttpMethod,
            path: `/${config.name}/:id`,
            handler: this.handleUpdate.bind(this),
            responseType: 'application/json'
        })

        endpoints.push({
            method: 'delete' as HttpMethod,
            path: `/${config.name}/:id`,
            handler: this.handleDelete.bind(this),
            responseType: 'application/json'
        })

        return endpoints
    }

    /**
     * Returns the OpenAPI specification for this custom table manager's endpoints.
     *
     * Generates documentation for all CRUD endpoints and custom endpoints.
     * Can be overridden by subclasses for more detailed specifications.
     *
     * @returns {OpenAPIComponentSpec} OpenAPI paths, tags, and schemas for this custom table manager
     */
    getOpenAPISpec(): OpenAPIComponentSpec {
        const config = this.getConfiguration()
        const basePath = `/${config.name}`
        const tagName = config.tags?.[0] || config.name

        // Build properties schema from columns
        const columnProperties: Record<string, any> = {
            id: { type: 'integer', readOnly: true },
            owner_id: { type: 'integer', nullable: true },
            created_at: { type: 'string', format: 'date-time', readOnly: true },
            updated_at: { type: 'string', format: 'date-time', readOnly: true }
        }

        // Add configured columns to the schema
        for (const [columnName, columnDef] of Object.entries(config.columns)) {
            columnProperties[columnName] = this.columnDefToOpenAPISchema(columnDef)
        }

        const paths: Record<string, any> = {
            [basePath]: {
                get: {
                    summary: `List all ${config.name} records`,
                    description: config.description,
                    tags: [tagName],
                    responses: {
                        '200': {
                            description: 'List of records',
                            content: {
                                'application/json': {
                                    schema: {
                                        type: 'array',
                                        items: { $ref: `#/components/schemas/${config.name}Record` }
                                    }
                                }
                            }
                        }
                    }
                },
                post: {
                    summary: `Create a new ${config.name} record`,
                    description: 'Create a new record. Requires authentication.',
                    tags: [tagName],
                    security: [{ ApiKeyAuth: [] }],
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: { $ref: `#/components/schemas/${config.name}Input` }
                            }
                        }
                    },
                    responses: {
                        '201': {
                            description: 'Record created successfully',
                            content: {
                                'application/json': {
                                    schema: {
                                        type: 'object',
                                        properties: {
                                            id: { type: 'integer' },
                                            message: { type: 'string' }
                                        }
                                    }
                                }
                            }
                        },
                        '400': { description: 'Bad request' },
                        '401': { description: 'Unauthorized' }
                    }
                }
            },
            [`${basePath}/{id}`]: {
                get: {
                    summary: `Get ${config.name} record by ID`,
                    description: 'Returns a single record',
                    tags: [tagName],
                    parameters: [
                        {
                            name: 'id',
                            in: 'path',
                            required: true,
                            schema: { type: 'integer' },
                            description: 'Record ID'
                        }
                    ],
                    responses: {
                        '200': {
                            description: 'Record details',
                            content: {
                                'application/json': {
                                    schema: { $ref: `#/components/schemas/${config.name}Record` }
                                }
                            }
                        },
                        '404': { description: 'Record not found' }
                    }
                },
                put: {
                    summary: `Update ${config.name} record`,
                    description: 'Update a record. Requires authentication and ownership.',
                    tags: [tagName],
                    security: [{ ApiKeyAuth: [] }],
                    parameters: [
                        {
                            name: 'id',
                            in: 'path',
                            required: true,
                            schema: { type: 'integer' },
                            description: 'Record ID'
                        }
                    ],
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: { $ref: `#/components/schemas/${config.name}Input` }
                            }
                        }
                    },
                    responses: {
                        '200': { description: 'Record updated successfully' },
                        '400': { description: 'Bad request' },
                        '401': { description: 'Unauthorized' },
                        '403': { description: 'Forbidden - not owner' },
                        '404': { description: 'Record not found' }
                    }
                },
                delete: {
                    summary: `Delete ${config.name} record`,
                    description: 'Delete a record. Requires authentication and ownership.',
                    tags: [tagName],
                    security: [{ ApiKeyAuth: [] }],
                    parameters: [
                        {
                            name: 'id',
                            in: 'path',
                            required: true,
                            schema: { type: 'integer' },
                            description: 'Record ID'
                        }
                    ],
                    responses: {
                        '200': { description: 'Record deleted successfully' },
                        '401': { description: 'Unauthorized' },
                        '403': { description: 'Forbidden - not owner' },
                        '404': { description: 'Record not found' }
                    }
                }
            }
        }

        // Add custom endpoints from configuration
        if (config.endpoints) {
            for (const endpoint of config.endpoints) {
                const fullPath = `${basePath}${endpoint.path}`
                const method = endpoint.method.toLowerCase()

                if (!paths[fullPath]) {
                    paths[fullPath] = {}
                }

                paths[fullPath][method] = {
                    summary: `Custom endpoint: ${endpoint.path}`,
                    tags: [tagName],
                    responses: {
                        '200': { description: 'Successful response' }
                    }
                }
            }
        }

        // Build input schema (excludes readonly fields)
        const inputProperties: Record<string, any> = {}
        for (const [columnName, columnDef] of Object.entries(config.columns)) {
            inputProperties[columnName] = this.columnDefToOpenAPISchema(columnDef)
        }

        return {
            paths,
            tags: [
                {
                    name: tagName,
                    description: config.description
                }
            ],
            schemas: {
                [`${config.name}Record`]: {
                    type: 'object',
                    properties: columnProperties
                },
                [`${config.name}Input`]: {
                    type: 'object',
                    properties: inputProperties
                }
            }
        }
    }

    /**
     * Convert SQL column definition to OpenAPI schema type.
     *
     * @private
     * @param {string} columnDef - SQL column definition (e.g., 'text not null', 'integer default 0')
     * @returns {object} OpenAPI schema object
     */
    private columnDefToOpenAPISchema(columnDef: string): Record<string, any> {
        const lowerDef = columnDef.toLowerCase()

        if (lowerDef.includes('integer') || lowerDef.includes('int')) {
            return { type: 'integer' }
        } else if (lowerDef.includes('real') || lowerDef.includes('float') || lowerDef.includes('double')) {
            return { type: 'number' }
        } else if (lowerDef.includes('boolean') || lowerDef.includes('bool')) {
            return { type: 'boolean' }
        } else if (lowerDef.includes('timestamp') || lowerDef.includes('datetime')) {
            return { type: 'string', format: 'date-time' }
        } else if (lowerDef.includes('date')) {
            return { type: 'string', format: 'date' }
        } else {
            return { type: 'string' }
        }
    }

    /**
     * Standard endpoint handlers for CRUD operations
     */

    async handleGetAll(_req: any): Promise<DataResponse> {
        try {
            const records = await this.findAll()
            return {
                status: 200,
                content: JSON.stringify(records),
                headers: { 'Content-Type': 'application/json' }
            }
        } catch (error) {
            return createErrorResponse(error)
        }
    }

    async handleCreate(req: any): Promise<DataResponse> {
        try {
            // Check authentication
            if (!ApisixAuthParser.hasValidAuth(req.headers || {})) {
                return {
                    status: 401,
                    content: JSON.stringify({ error: 'Authentication required' }),
                    headers: { 'Content-Type': 'application/json' }
                }
            }

            // Parse authenticated user
            const authUser = ApisixAuthParser.parseAuthHeaders(req.headers || {})
            if (!authUser) {
                return {
                    status: 401,
                    content: JSON.stringify({ error: 'Invalid authentication headers' }),
                    headers: { 'Content-Type': 'application/json' }
                }
            }

            if (!req?.body) {
                return {
                    status: 400,
                    content: JSON.stringify({ error: 'Request body is required' }),
                    headers: { 'Content-Type': 'application/json' }
                }
            }

            // Validate request body (ValidationError bubbles up to global handler -> 422)
            const validatedBody = await validateData<Record<string, unknown>>(
                validateCustomRecordCreate,
                req.body,
                'Record data'
            )

            // Find or create user in database
            const userRecord = await this.userService.findOrCreateUser(authUser)

            if (!userRecord.id) {
                return {
                    status: 500,
                    content: JSON.stringify({ error: 'Failed to retrieve user information' }),
                    headers: { 'Content-Type': 'application/json' }
                }
            }

            // Add owner_id to the data
            const dataWithOwner = {
                ...validatedBody,
                owner_id: userRecord.id
            }

            const id = await this.create(dataWithOwner)
            return {
                status: 201,
                content: JSON.stringify({ id, message: 'Record created successfully' }),
                headers: { 'Content-Type': 'application/json' }
            }
        } catch (error) {
            return createErrorResponse(error)
        }
    }

    async handleGetById(req: any): Promise<DataResponse> {
        try {
            // Validate ID parameter (ValidationError bubbles up to global handler -> 422)
            const validatedParams = await validateParams<{ id: number }>(validateIdParam, req.params || {}, 'Record ID')

            const record = await this.findById(validatedParams.id)
            if (!record) {
                return {
                    status: 404,
                    content: JSON.stringify({ error: 'Record not found' }),
                    headers: { 'Content-Type': 'application/json' }
                }
            }

            return {
                status: 200,
                content: JSON.stringify(record),
                headers: { 'Content-Type': 'application/json' }
            }
        } catch (error) {
            return createErrorResponse(error)
        }
    }

    async handleUpdate(req: any): Promise<DataResponse> {
        try {
            // Check authentication
            if (!ApisixAuthParser.hasValidAuth(req.headers || {})) {
                return {
                    status: 401,
                    content: JSON.stringify({ error: 'Authentication required' }),
                    headers: { 'Content-Type': 'application/json' }
                }
            }

            // Parse authenticated user
            const authUser = ApisixAuthParser.parseAuthHeaders(req.headers || {})
            if (!authUser) {
                return {
                    status: 401,
                    content: JSON.stringify({ error: 'Invalid authentication headers' }),
                    headers: { 'Content-Type': 'application/json' }
                }
            }

            // Validate ID parameter (ValidationError bubbles up to global handler -> 422)
            const validatedParams = await validateParams<{ id: number }>(validateIdParam, req.params || {}, 'Record ID')

            if (!req?.body) {
                return {
                    status: 400,
                    content: JSON.stringify({ error: 'Request body is required' }),
                    headers: { 'Content-Type': 'application/json' }
                }
            }

            // Validate request body (ValidationError bubbles up to global handler -> 422)
            const validatedBody = await validateData<Record<string, unknown>>(
                validateCustomRecordUpdate,
                req.body,
                'Record data'
            )

            // Find or create user in database
            const userRecord = await this.userService.findOrCreateUser(authUser)

            if (!userRecord.id) {
                return {
                    status: 500,
                    content: JSON.stringify({ error: 'Failed to retrieve user information' }),
                    headers: { 'Content-Type': 'application/json' }
                }
            }

            // Check if record exists and belongs to this user
            const existingRecord = await this.findById(validatedParams.id)
            if (!existingRecord) {
                return {
                    status: 404,
                    content: JSON.stringify({ error: 'Record not found' }),
                    headers: { 'Content-Type': 'application/json' }
                }
            }

            // Check ownership (only owner can modify their records)
            if (!existingRecord.owner_id || existingRecord.owner_id !== userRecord.id) {
                return {
                    status: 403,
                    content: JSON.stringify({ error: 'You can only modify your own records' }),
                    headers: { 'Content-Type': 'application/json' }
                }
            }

            await this.update(validatedParams.id, validatedBody)
            return {
                status: 200,
                content: JSON.stringify({ message: 'Record updated successfully' }),
                headers: { 'Content-Type': 'application/json' }
            }
        } catch (error) {
            return createErrorResponse(error)
        }
    }

    async handleDelete(req: any): Promise<DataResponse> {
        try {
            // Check authentication
            if (!ApisixAuthParser.hasValidAuth(req.headers || {})) {
                return {
                    status: 401,
                    content: JSON.stringify({ error: 'Authentication required' }),
                    headers: { 'Content-Type': 'application/json' }
                }
            }

            // Parse authenticated user
            const authUser = ApisixAuthParser.parseAuthHeaders(req.headers || {})
            if (!authUser) {
                return {
                    status: 401,
                    content: JSON.stringify({ error: 'Invalid authentication headers' }),
                    headers: { 'Content-Type': 'application/json' }
                }
            }

            // Validate ID parameter (ValidationError bubbles up to global handler -> 422)
            const validatedParams = await validateParams<{ id: number }>(validateIdParam, req.params || {}, 'Record ID')

            // Find or create user in database
            const userRecord = await this.userService.findOrCreateUser(authUser)

            if (!userRecord.id) {
                return {
                    status: 500,
                    content: JSON.stringify({ error: 'Failed to retrieve user information' }),
                    headers: { 'Content-Type': 'application/json' }
                }
            }

            // Check if record exists and belongs to this user
            const existingRecord = await this.findById(validatedParams.id)
            if (!existingRecord) {
                return {
                    status: 404,
                    content: JSON.stringify({ error: 'Record not found' }),
                    headers: { 'Content-Type': 'application/json' }
                }
            }

            // Check ownership (only owner can delete their records)
            if (!existingRecord.owner_id || existingRecord.owner_id !== userRecord.id) {
                return {
                    status: 403,
                    content: JSON.stringify({ error: 'You can only delete your own records' }),
                    headers: { 'Content-Type': 'application/json' }
                }
            }

            await this.delete(validatedParams.id)
            return {
                status: 200,
                content: JSON.stringify({ message: 'Record deleted successfully' }),
                headers: { 'Content-Type': 'application/json' }
            }
        } catch (error) {
            return createErrorResponse(error)
        }
    }
}
