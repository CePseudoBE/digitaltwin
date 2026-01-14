import type { Component, Servable } from './interfaces.js'
import type { AssetsManagerConfiguration, DataResponse } from './types.js'
import type { HttpMethod } from '../engine/endpoints.js'
import type { StorageService } from '../storage/storage_service.js'
import type { DatabaseAdapter, MetadataRow } from '../database/database_adapter.js'
import type { DataRecord } from '../types/data_record.js'
import type { UserRecord } from '../auth/types.js'
import type { OpenAPIDocumentable, OpenAPIComponentSpec } from '../openapi/types.js'
import { ApisixAuthParser } from '../auth/apisix_parser.js'
import { UserService } from '../auth/user_service.js'
import { AuthConfig } from '../auth/auth_config.js'
import {
    successResponse,
    errorResponse,
    badRequestResponse,
    unauthorizedResponse,
    forbiddenResponse,
    notFoundResponse,
    textResponse,
    fileResponse,
    multiStatusResponse,
    HttpStatus
} from '../utils/http_responses.js'
import fs from 'fs/promises'

/**
 * Result of authentication check.
 * Either contains the authenticated user record or an error response.
 */
type AuthResult = { success: true; userRecord: UserRecord } | { success: false; response: DataResponse }

/**
 * Extracted upload data from request (potentially incomplete).
 */
interface UploadData {
    description: string
    source: string
    is_public?: boolean
    filePath?: string
    fileBuffer?: Buffer
    filename?: string
}

/**
 * Validated upload data with all required fields guaranteed.
 */
interface ValidatedUploadData {
    description: string
    source: string
    is_public: boolean
    filePath?: string
    fileBuffer?: Buffer
    filename: string
}

/**
 * Result of upload data validation.
 */
type UploadValidationResult = { success: true; data: ValidatedUploadData } | { success: false; response: DataResponse }

/**
 * Extended metadata row for assets with additional fields.
 * This will be stored as separate columns in the database table.
 *
 * @interface AssetMetadataRow
 * @extends {MetadataRow}
 *
 * @example
 * ```typescript
 * const assetMeta: AssetMetadataRow = {
 *   name: 'gltf',
 *   type: 'model/gltf-binary',
 *   url: '/storage/gltf/model.glb',
 *   date: new Date(),
 *   description: '3D building model',
 *   source: 'https://example.com/data-source',
 *   owner_id: 123,
 *   filename: 'building.glb',
 *   is_public: true
 * }
 * ```
 */
export interface AssetMetadataRow extends MetadataRow {
    /** Human-readable description of the asset */
    description: string
    /** Source URL for data provenance and licensing compliance (must be valid URL) */
    source: string
    /** ID of the user who owns this asset (for access control) */
    owner_id: number | null
    /** Original filename provided by the user */
    filename: string
    /** Whether the asset is publicly accessible (true) or private (false) */
    is_public: boolean
}

/**
 * Request payload for creating a new asset.
 *
 * @interface CreateAssetRequest
 *
 * @example
 * ```typescript
 * const request: CreateAssetRequest = {
 *   description: '3D model of building',
 *   source: 'https://city-data.example.com/buildings',
 *   owner_id: 'user123',
 *   filename: 'building.glb',
 *   file: fileBuffer,
 *   is_public: true
 * }
 * ```
 */
export interface CreateAssetRequest {
    /** Human-readable description of the asset */
    description: string
    /** Source URL for data provenance (validated as proper URL) */
    source: string
    /** Owner user ID for access control (can be null) */
    owner_id: number | null
    /** Original filename */
    filename: string
    /** File content as Buffer */
    file: Buffer
    /** Whether the asset is publicly accessible (default: true) */
    is_public?: boolean
}

/**
 * Request payload for updating asset metadata.
 *
 * @interface UpdateAssetRequest
 *
 * @example
 * ```typescript
 * const updates: UpdateAssetRequest = {
 *   description: 'Updated building model with new textures',
 *   source: 'https://updated-source.example.com',
 *   is_public: false
 * }
 * ```
 */
export interface UpdateAssetRequest {
    /** Updated description (optional) */
    description?: string
    /** Updated source URL (optional, validated if provided) */
    source?: string
    /** Updated visibility (optional) */
    is_public?: boolean
}

/**
 * Abstract base class for Assets Manager components with authentication and access control.
 *
 * Provides secure file upload, storage, and retrieval capabilities following the Digital Twin framework patterns.
 * Each concrete implementation manages a specific type of asset and creates its own database table.
 *
 * ## Authentication & Authorization
 *
 * - **Write Operations** (POST, PUT, DELETE): Require authentication via Apache APISIX headers
 * - **User Management**: Automatically creates/updates user records from Keycloak data
 * - **Access Control**: Users can only modify/delete their own assets (ownership-based)
 * - **Resource Linking**: Assets are automatically linked to their owners via user_id foreign key
 *
 * ## Required Headers for Authenticated Endpoints
 *
 * - `x-user-id`: Keycloak user UUID (required)
 * - `x-user-roles`: Comma-separated list of user roles (optional)
 *
 * These headers are automatically added by Apache APISIX after successful Keycloak authentication.
 *
 * @abstract
 * @class AssetsManager
 * @implements {Component}
 * @implements {Servable}
 *
 * @example
 * ```typescript
 * // Create concrete implementations for different asset types
 * class GLTFAssetsManager extends AssetsManager {
 *   getConfiguration() {
 *     return { name: 'gltf', description: 'GLTF 3D models manager', ... }
 *   }
 * }
 *
 * class PointCloudAssetsManager extends AssetsManager {
 *   getConfiguration() {
 *     return { name: 'pointcloud', description: 'Point cloud data manager', ... }
 *   }
 * }
 *
 * // Usage in engine
 * const gltfManager = new GLTFAssetsManager()
 * gltfManager.setDependencies(database, storage)
 *
 * // Each creates its own table and endpoints:
 * // - GLTFAssetsManager → table 'gltf', endpoints /gltf/*
 * // - PointCloudAssetsManager → table 'pointcloud', endpoints /pointcloud/*
 * ```
 *
 * @remarks
 * Asset metadata is stored as dedicated columns in the database table:
 * - id, name, url, date (standard columns)
 * - description, source, owner_id, filename (asset-specific columns)
 *
 * Each concrete AssetsManager creates its own table based on the configuration name.
 */
export abstract class AssetsManager implements Component, Servable, OpenAPIDocumentable {
    protected db!: DatabaseAdapter
    protected storage!: StorageService
    protected userService!: UserService

    /**
     * Injects dependencies into the assets manager.
     *
     * Called by the framework during component initialization.
     *
     * @param {DatabaseAdapter} db - The database adapter for metadata storage
     * @param {StorageService} storage - The storage service for file persistence
     * @param {UserService} [userService] - Optional user service for authentication (created automatically if not provided)
     *
     * @example
     * ```typescript
     * // Standard usage (UserService created automatically)
     * const assetsManager = new MyAssetsManager()
     * assetsManager.setDependencies(databaseAdapter, storageService)
     *
     * // For testing (inject mock UserService)
     * const mockUserService = new MockUserService()
     * assetsManager.setDependencies(databaseAdapter, storageService, mockUserService)
     * ```
     */
    setDependencies(db: DatabaseAdapter, storage: StorageService, userService?: UserService): void {
        this.db = db
        this.storage = storage
        this.userService = userService ?? new UserService(db)
    }

    /**
     * Returns the configuration of the assets manager.
     *
     * Must be implemented by subclasses to define the asset type,
     * table name, and content types.
     *
     * @abstract
     * @returns {ComponentConfiguration} The component configuration
     *
     * @example
     * ```typescript
     * class GLTFAssetsManager extends AssetsManager {
     *   getConfiguration(): ComponentConfiguration {
     *     return {
     *       name: 'gltf',
     *       description: 'GLTF 3D models manager',
     *       contentType: 'model/gltf-binary',
     *       tags: ['assets', '3d', 'gltf']
     *     }
     *   }
     * }
     * ```
     */
    abstract getConfiguration(): AssetsManagerConfiguration

    /**
     * Validates that a source string is a valid URL.
     *
     * Used internally to ensure data provenance URLs are properly formatted.
     *
     * @private
     * @param {string} source - The source URL to validate
     * @returns {boolean} True if the source is a valid URL, false otherwise
     *
     * @example
     * ```typescript
     * this.validateSourceURL('https://example.com/data') // returns true
     * this.validateSourceURL('not-a-url') // returns false
     * ```
     */
    private validateSourceURL(source: string): boolean {
        try {
            new URL(source)
            return true
        } catch {
            return false
        }
    }

    /**
     * Validates that a filename has the correct extension as configured.
     *
     * Used internally to ensure uploaded files match the expected extension.
     *
     * @private
     * @param {string} filename - The filename to validate
     * @returns {boolean} True if the filename has the correct extension or no extension is configured, false otherwise
     *
     * @example
     * ```typescript
     * // If config.extension = '.glb'
     * this.validateFileExtension('model.glb') // returns true
     * this.validateFileExtension('model.json') // returns false
     * this.validateFileExtension('model') // returns false
     *
     * // If config.extension is undefined
     * this.validateFileExtension('any-file.ext') // returns true
     * ```
     */
    private validateFileExtension(filename: string): boolean {
        const config = this.getConfiguration()

        // If no extension is configured, allow any file
        if (!config.extension) {
            return true
        }

        // Ensure the configured extension starts with a dot
        const requiredExtension = config.extension.startsWith('.') ? config.extension : `.${config.extension}`

        // Check if the filename ends with the required extension (case-insensitive)
        return filename.toLowerCase().endsWith(requiredExtension.toLowerCase())
    }

    /**
     * Validates that a string is valid base64-encoded data.
     *
     * Used internally to ensure file data in batch uploads is properly base64-encoded
     * before attempting to decode it.
     *
     * @private
     * @param {any} data - Data to validate as base64
     * @returns {boolean} True if data is a valid base64 string, false otherwise
     *
     * @example
     * ```typescript
     * this.validateBase64('SGVsbG8gV29ybGQ=') // returns true
     * this.validateBase64('not-base64!@#') // returns false
     * this.validateBase64(123) // returns false (not a string)
     * this.validateBase64('') // returns false (empty string)
     * ```
     */
    private validateBase64(data: any): boolean {
        // Must be a non-empty string
        if (typeof data !== 'string' || data.length === 0) {
            return false
        }

        // Base64 regex: only A-Z, a-z, 0-9, +, /, and = for padding
        // Padding (=) can only appear at the end, max 2 times
        const base64Regex = /^[A-Za-z0-9+/]+={0,2}$/

        const trimmed = data.trim()

        // Must match regex
        if (!base64Regex.test(trimmed)) {
            return false
        }

        // Length must be multiple of 4
        if (trimmed.length % 4 !== 0) {
            return false
        }

        // Try to decode to verify it's valid base64
        try {
            const decoded = Buffer.from(trimmed, 'base64').toString('base64')
            // Re-encode and compare to ensure no data loss (valid base64)
            return decoded === trimmed
        } catch {
            return false
        }
    }

    // ============================================================================
    // Authentication & Request Processing Helpers
    // ============================================================================

    /**
     * Authenticates a request and returns the user record.
     *
     * This method consolidates the authentication flow:
     * 1. Validates APISIX headers are present
     * 2. Parses authentication headers
     * 3. Finds or creates user record in database
     *
     * @param req - HTTP request object
     * @returns AuthResult with either userRecord on success or DataResponse on failure
     *
     * @example
     * ```typescript
     * const authResult = await this.authenticateRequest(req)
     * if (!authResult.success) {
     *     return authResult.response
     * }
     * const userRecord = authResult.userRecord
     * ```
     */
    private async authenticateRequest(req: any): Promise<AuthResult> {
        // If auth is disabled, create an anonymous user
        if (AuthConfig.isAuthDisabled()) {
            const anonymousUser = {
                id: AuthConfig.getAnonymousUserId(),
                roles: []
            }
            const userRecord = await this.userService.findOrCreateUser(anonymousUser)
            return { success: true, userRecord }
        }

        if (!ApisixAuthParser.hasValidAuth(req.headers || {})) {
            return { success: false, response: unauthorizedResponse() }
        }

        const authUser = ApisixAuthParser.parseAuthHeaders(req.headers || {})
        if (!authUser) {
            return { success: false, response: unauthorizedResponse('Invalid authentication headers') }
        }

        const userRecord = await this.userService.findOrCreateUser(authUser)
        if (!userRecord.id) {
            return { success: false, response: errorResponse('Failed to retrieve user information') }
        }

        return { success: true, userRecord }
    }

    /**
     * Extracts upload data from multipart form request.
     *
     * @param req - HTTP request object with body and file
     * @returns UploadData object with extracted fields
     */
    private extractUploadData(req: any): UploadData {
        return {
            description: req.body?.description,
            source: req.body?.source,
            is_public: req.body?.is_public,
            filePath: req.file?.path,
            fileBuffer: req.file?.buffer,
            filename: req.file?.originalname || req.body?.filename
        }
    }

    /**
     * Validates required fields for asset upload and returns validated data.
     *
     * @param data - Upload data to validate
     * @returns UploadValidationResult with validated data on success or error response on failure
     */
    private validateUploadFields(data: UploadData): UploadValidationResult {
        const hasFile = data.filePath || data.fileBuffer
        if (!hasFile || !data.description || !data.source) {
            return {
                success: false,
                response: badRequestResponse('Missing required fields: description, source, file')
            }
        }

        if (!data.filename) {
            return {
                success: false,
                response: badRequestResponse('Filename could not be determined from uploaded file')
            }
        }

        if (!this.validateFileExtension(data.filename)) {
            const config = this.getConfiguration()
            return {
                success: false,
                response: badRequestResponse(`Invalid file extension. Expected: ${config.extension}`)
            }
        }

        return {
            success: true,
            data: {
                description: data.description,
                source: data.source,
                filePath: data.filePath,
                fileBuffer: data.fileBuffer,
                filename: data.filename,
                is_public: data.is_public !== undefined ? Boolean(data.is_public) : true
            }
        }
    }

    /**
     * Reads file content from temporary upload path.
     *
     * @param filePath - Path to temporary file
     * @returns Buffer with file content
     * @throws Error if file cannot be read
     */
    private async readTempFile(filePath: string): Promise<Buffer> {
        return fs.readFile(filePath)
    }

    /**
     * Cleans up temporary file after processing.
     * Silently ignores cleanup errors.
     *
     * @param filePath - Path to temporary file
     */
    private async cleanupTempFile(filePath: string): Promise<void> {
        await fs.unlink(filePath).catch(() => {
            // Ignore cleanup errors
        })
    }

    /**
     * Validates ownership of an asset.
     *
     * Admins can modify any asset. Regular users can only modify their own assets
     * or assets with no owner (owner_id = null).
     *
     * @param asset - Asset record to check
     * @param userId - User ID to validate against
     * @param headers - HTTP request headers (optional, for admin check)
     * @returns DataResponse with error if not owner/admin, undefined if valid
     */
    private validateOwnership(
        asset: DataRecord,
        userId: number,
        headers?: Record<string, string>
    ): DataResponse | undefined {
        // Admins can modify any asset
        if (headers && ApisixAuthParser.isAdmin(headers)) {
            return undefined
        }

        // Assets with no owner (null) can be modified by anyone
        if (asset.owner_id === null) {
            return undefined
        }
        if (asset.owner_id !== userId) {
            return forbiddenResponse('You can only modify your own assets')
        }
        return undefined
    }

    /**
     * Checks if a user can access a private asset.
     *
     * @param asset - Asset record to check
     * @param req - HTTP request for authentication context
     * @returns DataResponse with error if access denied, undefined if allowed
     */
    private async checkPrivateAssetAccess(asset: DataRecord, req: any): Promise<DataResponse | undefined> {
        // Public assets are always accessible
        if (asset.is_public) {
            return undefined
        }

        // Admins can access everything
        if (ApisixAuthParser.isAdmin(req.headers || {})) {
            return undefined
        }

        // Private asset - require authentication
        if (!ApisixAuthParser.hasValidAuth(req.headers || {})) {
            return unauthorizedResponse('Authentication required for private assets')
        }

        const authUser = ApisixAuthParser.parseAuthHeaders(req.headers || {})
        if (!authUser) {
            return unauthorizedResponse('Invalid authentication headers')
        }

        const userRecord = await this.userService.findOrCreateUser(authUser)
        if (!userRecord.id || asset.owner_id !== userRecord.id) {
            return forbiddenResponse('This asset is private')
        }

        return undefined
    }

    /**
     * Fetches an asset by ID with full access control validation.
     *
     * This method consolidates the common logic for retrieving an asset:
     * 1. Validates that ID is provided
     * 2. Fetches the asset from database
     * 3. Verifies the asset belongs to this component
     * 4. Checks access permissions for private assets
     *
     * @param req - HTTP request with params.id
     * @returns Object with asset on success, or DataResponse on failure
     */
    private async fetchAssetWithAccessCheck(
        req: any
    ): Promise<{ success: true; asset: DataRecord } | { success: false; response: DataResponse }> {
        const { id } = req.params || {}

        if (!id) {
            return { success: false, response: badRequestResponse('Asset ID is required') }
        }

        const asset = await this.getAssetById(id)
        if (!asset) {
            return { success: false, response: textResponse(HttpStatus.NOT_FOUND, 'Asset not found') }
        }

        // Verify this asset belongs to our component
        const config = this.getConfiguration()
        if (asset.name !== config.name) {
            return { success: false, response: textResponse(HttpStatus.NOT_FOUND, 'Asset not found') }
        }

        // Check access permissions for private assets
        const accessError = await this.checkPrivateAssetAccess(asset, req)
        if (accessError) {
            return { success: false, response: accessError }
        }

        return { success: true, asset }
    }

    /**
     * Upload a new asset file with metadata.
     *
     * Stores the file using the storage service and saves metadata to the database.
     * Asset metadata is stored as dedicated columns in the database table.
     *
     * @param {CreateAssetRequest} request - The asset upload request
     * @throws {Error} If source URL is invalid
     *
     * @example
     * ```typescript
     * await assetsManager.uploadAsset({
     *   description: '3D building model',
     *   source: 'https://city-data.example.com/buildings',
     *   owner_id: 'user123',
     *   filename: 'building.glb',
     *   file: fileBuffer,
     *   is_public: true
     * })
     * ```
     */
    async uploadAsset(request: CreateAssetRequest): Promise<void> {
        if (!this.validateSourceURL(request.source)) {
            throw new Error('Invalid source URL')
        }

        if (!this.validateFileExtension(request.filename)) {
            const config = this.getConfiguration()
            throw new Error(`Invalid file extension. Expected: ${config.extension}`)
        }

        const config = this.getConfiguration()
        const now = new Date()

        // Store file using framework pattern
        const url = await this.storage.save(request.file, config.name, request.filename)

        // Create metadata with all asset-specific fields
        const metadata: AssetMetadataRow = {
            name: config.name,
            type: config.contentType,
            url,
            date: now,
            description: request.description,
            source: request.source,
            owner_id: request.owner_id,
            filename: request.filename,
            is_public: request.is_public ?? true // Default to public if not specified
        }

        await this.db.save(metadata)
    }

    /**
     * Retrieve all assets for this component (like other components).
     *
     * Returns a JSON list of all assets with their metadata, following the
     * framework pattern but adapted for assets management.
     *
     * Access control:
     * - Unauthenticated users: Can only see public assets
     * - Authenticated users: Can see public assets + their own private assets
     * - Admin users: Can see all assets (public and private from all users)
     *
     * @returns {Promise<DataResponse>} JSON response with all assets
     */
    async retrieve(req?: any): Promise<DataResponse> {
        try {
            const assets = await this.getAllAssets()
            const isAdmin = req && ApisixAuthParser.isAdmin(req.headers || {})

            // Admin can see everything
            if (isAdmin) {
                return successResponse(this.formatAssetsForResponse(assets))
            }

            // Get authenticated user ID if available
            const authenticatedUserId = await this.getAuthenticatedUserId(req)

            // Filter to visible assets only
            const visibleAssets = assets.filter(
                asset => asset.is_public || (authenticatedUserId !== null && asset.owner_id === authenticatedUserId)
            )

            return successResponse(this.formatAssetsForResponse(visibleAssets))
        } catch (error) {
            return errorResponse(error)
        }
    }

    /**
     * Gets the authenticated user's database ID from request headers.
     *
     * @param req - HTTP request object
     * @returns User ID or null if not authenticated
     */
    private async getAuthenticatedUserId(req: any): Promise<number | null> {
        if (!req || !ApisixAuthParser.hasValidAuth(req.headers || {})) {
            return null
        }

        const authUser = ApisixAuthParser.parseAuthHeaders(req.headers || {})
        if (!authUser) {
            return null
        }

        const userRecord = await this.userService.findOrCreateUser(authUser)
        return userRecord.id || null
    }

    /**
     * Formats assets for API response with metadata and URLs.
     *
     * @param assets - Array of asset records
     * @returns Formatted assets array ready for JSON serialization
     */
    private formatAssetsForResponse(assets: DataRecord[]): object[] {
        const config = this.getConfiguration()

        return assets.map(asset => ({
            id: asset.id,
            name: asset.name,
            date: asset.date,
            contentType: asset.contentType,
            description: asset.description || '',
            source: asset.source || '',
            owner_id: asset.owner_id || null,
            filename: asset.filename || '',
            is_public: asset.is_public ?? true,
            url: `/${config.endpoint}/${asset.id}`,
            download_url: `/${config.endpoint}/${asset.id}/download`
        }))
    }

    /**
     * Get all assets for this component type.
     *
     * Retrieves all assets managed by this component, with their metadata.
     * Uses a very old start date to get all records.
     *
     * @returns {Promise<DataRecord[]>} Array of all asset records
     *
     * @example
     * ```typescript
     * const allAssets = await assetsManager.getAllAssets()
     * // Returns: [{ id, name, type, url, date, contentType }, ...]
     * ```
     */
    async getAllAssets(): Promise<DataRecord[]> {
        const config = this.getConfiguration()
        // Get all assets and sort by date descending (newest first)
        const veryOldDate = new Date('1970-01-01')
        const farFutureDate = new Date('2099-12-31')
        const assets = await this.db.getByDateRange(config.name, veryOldDate, farFutureDate, 1000) // Max 1000 assets

        // Sort by date descending (newest first) since getByDateRange returns ascending
        return assets.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    }

    /**
     * Get asset by specific ID.
     *
     * @param {string} id - The asset ID to retrieve
     * @returns {Promise<DataRecord | undefined>} The asset record or undefined if not found
     *
     * @example
     * ```typescript
     * const asset = await assetsManager.getAssetById('123')
     * if (asset) {
     *   const fileData = await asset.data()
     * }
     * ```
     */
    async getAssetById(id: string): Promise<DataRecord | undefined> {
        return await this.db.getById(id, this.getConfiguration().name)
    }

    /**
     * Update asset metadata by ID.
     *
     * Updates the metadata (description, source, and/or visibility) of a specific asset.
     * Asset metadata is stored as dedicated columns in the database.
     *
     * @param {string} id - The ID of the asset to update
     * @param {UpdateAssetRequest} updates - The metadata updates to apply
     * @throws {Error} If source URL is invalid or asset not found
     *
     * @example
     * ```typescript
     * await assetsManager.updateAssetMetadata('123', {
     *   description: 'Updated building model with new textures',
     *   source: 'https://updated-source.example.com',
     *   is_public: false
     * })
     * ```
     */
    async updateAssetMetadata(id: string, updates: UpdateAssetRequest): Promise<void> {
        if (updates.source && !this.validateSourceURL(updates.source)) {
            throw new Error('Invalid source URL')
        }

        const record = await this.db.getById(id, this.getConfiguration().name)

        if (!record) {
            throw new Error(`Asset with ID ${id} not found`)
        }

        // Verify this asset belongs to our component
        const config = this.getConfiguration()
        if (record.name !== config.name) {
            throw new Error(`Asset ${id} does not belong to component ${config.name}`)
        }

        // Apply updates, keeping existing values for non-updated fields
        const updatedMetadata: AssetMetadataRow = {
            id: parseInt(id),
            name: config.name,
            type: record.contentType,
            url: record.url,
            date: record.date, // Keep original date
            description: updates.description ?? record.description ?? '',
            source: updates.source ?? record.source ?? '',
            owner_id: record.owner_id ?? null,
            filename: record.filename ?? '',
            is_public: updates.is_public !== undefined ? updates.is_public : (record.is_public ?? true)
        }

        // Update the record - delete and re-create with updated metadata
        await this.db.delete(id, this.getConfiguration().name)
        await this.db.save(updatedMetadata)
    }

    /**
     * Delete asset by ID.
     *
     * Removes a specific asset.
     *
     * @param {string} id - The ID of the asset to delete
     * @throws {Error} If asset not found or doesn't belong to this component
     *
     * @example
     * ```typescript
     * await assetsManager.deleteAssetById('123')
     * ```
     */
    async deleteAssetById(id: string): Promise<void> {
        const record = await this.db.getById(id, this.getConfiguration().name)

        if (!record) {
            throw new Error(`Asset with ID ${id} not found`)
        }

        // Verify this asset belongs to our component
        const config = this.getConfiguration()
        if (record.name !== config.name) {
            throw new Error(`Asset ${id} does not belong to component ${config.name}`)
        }

        await this.db.delete(id, this.getConfiguration().name)
    }

    /**
     * Delete latest asset (simplified)
     *
     * Removes the most recently uploaded asset for this component type.
     *
     * @throws {Error} If no assets exist to delete
     *
     * @example
     * ```typescript
     * await assetsManager.deleteLatestAsset()
     * ```
     */
    async deleteLatestAsset(): Promise<void> {
        const config = this.getConfiguration()
        const record = await this.db.getLatestByName(config.name)

        if (record) {
            await this.db.delete(record.id.toString(), this.getConfiguration().name)
        }
    }

    /**
     * Upload multiple assets in batch for better performance
     *
     * @param {CreateAssetRequest[]} requests - Array of asset upload requests
     * @throws {Error} If any source URL is invalid
     *
     * @example
     * ```typescript
     * await assetsManager.uploadAssetsBatch([
     *   { description: 'Model 1', source: 'https://example.com/1', file: buffer1, ... },
     *   { description: 'Model 2', source: 'https://example.com/2', file: buffer2, ... }
     * ])
     * ```
     */
    async uploadAssetsBatch(requests: CreateAssetRequest[]): Promise<void> {
        if (requests.length === 0) return

        // Validate all URLs and extensions first
        for (const request of requests) {
            if (!this.validateSourceURL(request.source)) {
                throw new Error(`Invalid source URL: ${request.source}`)
            }
            if (!this.validateFileExtension(request.filename)) {
                const config = this.getConfiguration()
                throw new Error(`Invalid file extension for ${request.filename}. Expected: ${config.extension}`)
            }
        }

        const config = this.getConfiguration()
        const now = new Date()
        const metadataList: AssetMetadataRow[] = []

        // Store files and prepare metadata
        for (const request of requests) {
            const url = await this.storage.save(request.file, config.name, request.filename)

            const metadata: AssetMetadataRow = {
                name: config.name,
                type: config.contentType,
                url,
                date: now,
                description: request.description,
                source: request.source,
                owner_id: request.owner_id,
                filename: request.filename,
                is_public: request.is_public ?? true
            }

            metadataList.push(metadata)
        }

        // Save all metadata individually (compatible with all adapters)
        for (const metadata of metadataList) {
            await this.db.save(metadata)
        }
    }

    /**
     * Delete multiple assets by IDs in batch
     *
     * @param {string[]} ids - Array of asset IDs to delete
     * @throws {Error} If any asset not found or doesn't belong to this component
     */
    async deleteAssetsBatch(ids: string[]): Promise<void> {
        if (ids.length === 0) return

        // Delete assets individually (compatible with all adapters)
        for (const id of ids) {
            await this.deleteAssetById(id)
        }
    }

    /**
     * Get endpoints following the framework pattern
     */
    /**
     * Get HTTP endpoints exposed by this assets manager.
     *
     * Returns the standard CRUD endpoints following the framework pattern.
     *
     * @returns {Array} Array of endpoint descriptors with methods, paths, and handlers
     *
     * @example
     * ```typescript
     * // For a manager with assetType: 'gltf', provides:
     * GET    /gltf         - Get all assets
     * POST   /gltf/upload  - Upload new asset
     * GET    /gltf/123     - Get specific asset
     * PUT    /gltf/123     - Update asset metadata
     * GET    /gltf/123/download - Download asset
     * DELETE /gltf/123     - Delete asset
     * ```
     */
    getEndpoints(): Array<{
        method: HttpMethod
        path: string
        handler: (...args: any[]) => any
        responseType?: string
    }> {
        const config = this.getConfiguration()
        return [
            {
                method: 'get',
                path: `/${config.endpoint}`,
                handler: this.retrieve.bind(this),
                responseType: 'application/json'
            },
            {
                method: 'post',
                path: `/${config.endpoint}`,
                handler: this.handleUpload.bind(this),
                responseType: 'application/json'
            },
            {
                method: 'get',
                path: `/${config.endpoint}/:id`,
                handler: this.handleGetAsset.bind(this),
                responseType: config.contentType
            },
            {
                method: 'put',
                path: `/${config.endpoint}/:id`,
                handler: this.handleUpdate.bind(this),
                responseType: 'application/json'
            },
            {
                method: 'get',
                path: `/${config.endpoint}/:id/download`,
                handler: this.handleDownload.bind(this),
                responseType: config.contentType
            },
            {
                method: 'delete',
                path: `/${config.endpoint}/:id`,
                handler: this.handleDelete.bind(this),
                responseType: 'application/json'
            },
            {
                method: 'post',
                path: `/${config.endpoint}/batch`,
                handler: this.handleUploadBatch.bind(this),
                responseType: 'application/json'
            },
            {
                method: 'delete',
                path: `/${config.endpoint}/batch`,
                handler: this.handleDeleteBatch.bind(this),
                responseType: 'application/json'
            }
        ]
    }

    /**
     * Returns the OpenAPI specification for this assets manager's endpoints.
     *
     * Generates documentation for all CRUD endpoints including batch operations.
     * Can be overridden by subclasses for more detailed specifications.
     *
     * @returns {OpenAPIComponentSpec} OpenAPI paths, tags, and schemas for this assets manager
     */
    getOpenAPISpec(): OpenAPIComponentSpec {
        const config = this.getConfiguration()
        const basePath = `/${config.endpoint}`
        const tagName = config.tags?.[0] || config.name

        return {
            paths: {
                [basePath]: {
                    get: {
                        summary: `List all ${config.name} assets`,
                        description: config.description,
                        tags: [tagName],
                        responses: {
                            '200': {
                                description: 'List of assets',
                                content: {
                                    'application/json': {
                                        schema: {
                                            type: 'array',
                                            items: { $ref: '#/components/schemas/AssetResponse' }
                                        }
                                    }
                                }
                            }
                        }
                    },
                    post: {
                        summary: `Upload a new ${config.name} asset`,
                        description: 'Upload a new asset file with metadata. Requires authentication.',
                        tags: [tagName],
                        security: [{ ApiKeyAuth: [] }],
                        requestBody: {
                            required: true,
                            content: {
                                'multipart/form-data': {
                                    schema: {
                                        type: 'object',
                                        required: ['file', 'description', 'source'],
                                        properties: {
                                            file: {
                                                type: 'string',
                                                format: 'binary',
                                                description: 'The file to upload'
                                            },
                                            description: { type: 'string', description: 'Asset description' },
                                            source: {
                                                type: 'string',
                                                format: 'uri',
                                                description: 'Source URL for provenance'
                                            },
                                            is_public: {
                                                type: 'boolean',
                                                description: 'Whether asset is public (default: true)'
                                            }
                                        }
                                    }
                                }
                            }
                        },
                        responses: {
                            '200': {
                                description: 'Asset uploaded successfully',
                                content: {
                                    'application/json': {
                                        schema: { $ref: '#/components/schemas/SuccessResponse' }
                                    }
                                }
                            },
                            '400': { description: 'Bad request - missing or invalid fields' },
                            '401': { description: 'Unauthorized - authentication required' }
                        }
                    }
                },
                [`${basePath}/{id}`]: {
                    get: {
                        summary: `Get ${config.name} asset by ID`,
                        description: 'Returns the asset file content',
                        tags: [tagName],
                        parameters: [
                            {
                                name: 'id',
                                in: 'path',
                                required: true,
                                schema: { type: 'string' },
                                description: 'Asset ID'
                            }
                        ],
                        responses: {
                            '200': {
                                description: 'Asset file content',
                                content: {
                                    [config.contentType]: {
                                        schema: { type: 'string', format: 'binary' }
                                    }
                                }
                            },
                            '404': { description: 'Asset not found' }
                        }
                    },
                    put: {
                        summary: `Update ${config.name} asset metadata`,
                        description:
                            'Update asset description, source, or visibility. Requires authentication and ownership.',
                        tags: [tagName],
                        security: [{ ApiKeyAuth: [] }],
                        parameters: [
                            {
                                name: 'id',
                                in: 'path',
                                required: true,
                                schema: { type: 'string' },
                                description: 'Asset ID'
                            }
                        ],
                        requestBody: {
                            required: true,
                            content: {
                                'application/json': {
                                    schema: {
                                        type: 'object',
                                        properties: {
                                            description: { type: 'string' },
                                            source: { type: 'string', format: 'uri' },
                                            is_public: { type: 'boolean' }
                                        }
                                    }
                                }
                            }
                        },
                        responses: {
                            '200': {
                                description: 'Asset updated successfully',
                                content: {
                                    'application/json': {
                                        schema: { $ref: '#/components/schemas/SuccessResponse' }
                                    }
                                }
                            },
                            '400': { description: 'Bad request' },
                            '401': { description: 'Unauthorized' },
                            '403': { description: 'Forbidden - not owner' },
                            '404': { description: 'Asset not found' }
                        }
                    },
                    delete: {
                        summary: `Delete ${config.name} asset`,
                        description: 'Delete an asset. Requires authentication and ownership.',
                        tags: [tagName],
                        security: [{ ApiKeyAuth: [] }],
                        parameters: [
                            {
                                name: 'id',
                                in: 'path',
                                required: true,
                                schema: { type: 'string' },
                                description: 'Asset ID'
                            }
                        ],
                        responses: {
                            '200': {
                                description: 'Asset deleted successfully',
                                content: {
                                    'application/json': {
                                        schema: { $ref: '#/components/schemas/SuccessResponse' }
                                    }
                                }
                            },
                            '401': { description: 'Unauthorized' },
                            '403': { description: 'Forbidden - not owner' },
                            '404': { description: 'Asset not found' }
                        }
                    }
                },
                [`${basePath}/{id}/download`]: {
                    get: {
                        summary: `Download ${config.name} asset`,
                        description: 'Download the asset file with Content-Disposition header',
                        tags: [tagName],
                        parameters: [
                            {
                                name: 'id',
                                in: 'path',
                                required: true,
                                schema: { type: 'string' },
                                description: 'Asset ID'
                            }
                        ],
                        responses: {
                            '200': {
                                description: 'Asset file download',
                                content: {
                                    [config.contentType]: {
                                        schema: { type: 'string', format: 'binary' }
                                    }
                                }
                            },
                            '404': { description: 'Asset not found' }
                        }
                    }
                },
                [`${basePath}/batch`]: {
                    post: {
                        summary: `Batch upload ${config.name} assets`,
                        description: 'Upload multiple assets in one request. Files must be base64 encoded.',
                        tags: [tagName],
                        security: [{ ApiKeyAuth: [] }],
                        requestBody: {
                            required: true,
                            content: {
                                'application/json': {
                                    schema: {
                                        type: 'object',
                                        required: ['requests'],
                                        properties: {
                                            requests: {
                                                type: 'array',
                                                items: {
                                                    type: 'object',
                                                    required: ['file', 'description', 'source', 'filename'],
                                                    properties: {
                                                        file: {
                                                            type: 'string',
                                                            format: 'byte',
                                                            description: 'Base64 encoded file'
                                                        },
                                                        filename: { type: 'string' },
                                                        description: { type: 'string' },
                                                        source: { type: 'string', format: 'uri' },
                                                        is_public: { type: 'boolean' }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        },
                        responses: {
                            '200': { description: 'All assets uploaded successfully' },
                            '207': { description: 'Partial success - some uploads failed' },
                            '400': { description: 'Bad request' },
                            '401': { description: 'Unauthorized' }
                        }
                    },
                    delete: {
                        summary: `Batch delete ${config.name} assets`,
                        description:
                            'Delete multiple assets by IDs. Requires authentication and ownership. Pass IDs as comma-separated query parameter.',
                        tags: [tagName],
                        security: [{ ApiKeyAuth: [] }],
                        parameters: [
                            {
                                name: 'ids',
                                in: 'query',
                                required: true,
                                schema: {
                                    type: 'string'
                                },
                                description: 'Comma-separated list of asset IDs to delete (e.g., 1,2,3)'
                            }
                        ],
                        responses: {
                            '200': { description: 'All assets deleted successfully' },
                            '207': { description: 'Partial success - some deletions failed' },
                            '400': { description: 'Bad request' },
                            '401': { description: 'Unauthorized' }
                        }
                    }
                }
            },
            tags: [
                {
                    name: tagName,
                    description: config.description
                }
            ],
            schemas: {
                AssetResponse: {
                    type: 'object',
                    properties: {
                        id: { type: 'integer' },
                        name: { type: 'string' },
                        date: { type: 'string', format: 'date-time' },
                        contentType: { type: 'string' },
                        description: { type: 'string' },
                        source: { type: 'string' },
                        owner_id: { type: 'integer', nullable: true },
                        filename: { type: 'string' },
                        is_public: { type: 'boolean' },
                        url: { type: 'string' },
                        download_url: { type: 'string' }
                    }
                },
                SuccessResponse: {
                    type: 'object',
                    properties: {
                        message: { type: 'string' }
                    }
                }
            }
        }
    }

    /**
     * Handle single asset upload via HTTP POST.
     *
     * Flow:
     * 1. Validate request structure and authentication
     * 2. Extract user identity from Apache APISIX headers
     * 3. Validate file extension and read uploaded file
     * 4. Store file via storage service and metadata in database
     * 5. Set owner_id to authenticated user (prevents ownership spoofing)
     * 6. Apply is_public setting (defaults to true if not specified)
     *
     * Authentication: Required
     * Ownership: Automatically set to authenticated user
     *
     * @param req - HTTP request with multipart/form-data file upload
     * @returns HTTP response with success/error status
     *
     * @example
     * POST /assets
     * Content-Type: multipart/form-data
     * x-user-id: user-uuid
     * x-user-roles: user,premium
     *
     * Form data:
     * - file: <binary file>
     * - description: "3D model of building"
     * - source: "https://source.com"
     * - is_public: true
     */
    async handleUpload(req: any): Promise<DataResponse> {
        try {
            // Validate request structure
            if (!req?.body) {
                return badRequestResponse('Invalid request: missing request body')
            }

            // Authenticate user
            const authResult = await this.authenticateRequest(req)
            if (!authResult.success) {
                return authResult.response
            }
            const userId = authResult.userRecord.id
            if (!userId) {
                return errorResponse('Failed to retrieve user information')
            }

            // Extract and validate upload data
            const uploadData = this.extractUploadData(req)
            const validation = this.validateUploadFields(uploadData)
            if (!validation.success) {
                return validation.response
            }
            const validData = validation.data

            // Get file buffer from memory or read from temporary location
            let fileBuffer: Buffer
            if (validData.fileBuffer) {
                // Memory storage: buffer already available
                fileBuffer = validData.fileBuffer
            } else if (validData.filePath) {
                // Disk storage: read from temp file
                try {
                    fileBuffer = await this.readTempFile(validData.filePath)
                } catch (error) {
                    return errorResponse(
                        `Failed to read uploaded file: ${error instanceof Error ? error.message : 'Unknown error'}`
                    )
                }
            } else {
                return badRequestResponse('No file data available')
            }

            // Upload asset and cleanup
            try {
                await this.uploadAsset({
                    description: validData.description,
                    source: validData.source,
                    owner_id: userId,
                    filename: validData.filename,
                    file: fileBuffer,
                    is_public: validData.is_public
                })
                if (validData.filePath) {
                    await this.cleanupTempFile(validData.filePath)
                }
            } catch (error) {
                if (validData.filePath) {
                    await this.cleanupTempFile(validData.filePath)
                }
                throw error
            }

            return successResponse({ message: 'Asset uploaded successfully' })
        } catch (error) {
            return errorResponse(error)
        }
    }

    /**
     * Handle update endpoint (PUT).
     *
     * Updates metadata for a specific asset by ID.
     *
     * @param {any} req - HTTP request object with params.id and body containing updates
     * @returns {Promise<DataResponse>} HTTP response
     *
     * @example
     * ```typescript
     * // PUT /gltf/123
     * // Body: { "description": "Updated model", "source": "https://new-source.com" }
     * ```
     */
    async handleUpdate(req: any): Promise<DataResponse> {
        try {
            if (!req) {
                return badRequestResponse('Invalid request: missing request object')
            }

            // Authenticate user
            const authResult = await this.authenticateRequest(req)
            if (!authResult.success) {
                return authResult.response
            }
            const userId = authResult.userRecord.id
            if (!userId) {
                return errorResponse('Failed to retrieve user information')
            }

            const { id } = req.params || {}
            const { description, source, is_public } = req.body || {}

            if (!id) {
                return badRequestResponse('Asset ID is required')
            }

            if (!description && !source && is_public === undefined) {
                return badRequestResponse(
                    'At least one field (description, source, or is_public) must be provided for update'
                )
            }

            // Check if asset exists
            const asset = await this.getAssetById(id)
            if (!asset) {
                return notFoundResponse('Asset not found')
            }

            // Check ownership (admins can modify any asset)
            const ownershipError = this.validateOwnership(asset, userId, req.headers)
            if (ownershipError) {
                return ownershipError
            }

            // Build and apply updates
            const updates: UpdateAssetRequest = {}
            if (description !== undefined) updates.description = description
            if (source !== undefined) updates.source = source
            if (is_public !== undefined) updates.is_public = Boolean(is_public)

            await this.updateAssetMetadata(id, updates)

            return successResponse({ message: 'Asset metadata updated successfully' })
        } catch (error) {
            return errorResponse(error)
        }
    }

    /**
     * Handle get asset endpoint (GET).
     *
     * Returns the file content of a specific asset by ID for display/use in front-end.
     * No download headers - just the raw file content.
     *
     * Access control:
     * - Public assets: Accessible to everyone
     * - Private assets: Accessible only to owner
     * - Admin users: Can access all assets (public and private)
     *
     * @param {any} req - HTTP request object with params.id
     * @returns {Promise<DataResponse>} HTTP response with file content
     *
     * @example
     * ```typescript
     * // GET /gltf/123
     * // Returns the .glb file content for display in 3D viewer
     * ```
     */
    async handleGetAsset(req: any): Promise<DataResponse> {
        try {
            const result = await this.fetchAssetWithAccessCheck(req)
            if (!result.success) {
                return result.response
            }

            const fileContent = await result.asset.data()
            return fileResponse(fileContent, this.getConfiguration().contentType)
        } catch (error) {
            return errorResponse(error)
        }
    }

    /**
     * Handle download endpoint (GET).
     *
     * Downloads the file content of a specific asset by ID with download headers.
     * Forces browser to download the file rather than display it.
     *
     * Access control:
     * - Public assets: Accessible to everyone
     * - Private assets: Accessible only to owner
     * - Admin users: Can download all assets (public and private)
     *
     * @param {any} req - HTTP request object with params.id
     * @returns {Promise<DataResponse>} HTTP response with file content and download headers
     *
     * @example
     * ```typescript
     * // GET /gltf/123/download
     * // Returns the .glb file with download headers - browser will save it
     * ```
     */
    async handleDownload(req: any): Promise<DataResponse> {
        try {
            const result = await this.fetchAssetWithAccessCheck(req)
            if (!result.success) {
                return result.response
            }

            const fileContent = await result.asset.data()
            const filename = result.asset.filename || `asset_${req.params?.id}`
            return fileResponse(fileContent, this.getConfiguration().contentType, filename)
        } catch (error) {
            return errorResponse(error)
        }
    }

    /**
     * Handle delete endpoint (DELETE).
     *
     * Deletes a specific asset by ID.
     *
     * @param {any} req - HTTP request object with params.id
     * @returns {Promise<DataResponse>} HTTP response
     *
     * @example
     * ```typescript
     * // DELETE /gltf/123
     * ```
     */
    async handleDelete(req: any): Promise<DataResponse> {
        try {
            // Authenticate user
            const authResult = await this.authenticateRequest(req)
            if (!authResult.success) {
                return authResult.response
            }
            const userId = authResult.userRecord.id
            if (!userId) {
                return errorResponse('Failed to retrieve user information')
            }

            const { id } = req.params || {}
            if (!id) {
                return badRequestResponse('Asset ID is required')
            }

            // Check if asset exists
            const asset = await this.getAssetById(id)
            if (!asset) {
                return notFoundResponse('Asset not found')
            }

            // Check ownership (admins can delete any asset)
            const ownershipError = this.validateOwnership(asset, userId, req.headers)
            if (ownershipError) {
                return ownershipError
            }

            await this.deleteAssetById(id)
            return successResponse({ message: 'Asset deleted successfully' })
        } catch (error) {
            return errorResponse(error)
        }
    }

    /**
     * Handle batch upload endpoint
     */
    async handleUploadBatch(req: any): Promise<DataResponse> {
        try {
            if (!req?.body) {
                return badRequestResponse('Invalid request: missing request body')
            }

            // Authenticate user
            const authResult = await this.authenticateRequest(req)
            if (!authResult.success) {
                return authResult.response
            }
            const userId = authResult.userRecord.id
            if (!userId) {
                return errorResponse('Failed to retrieve user information')
            }

            const requests = req.body.requests
            if (!Array.isArray(requests) || requests.length === 0) {
                return badRequestResponse('Requests array is required and must not be empty')
            }

            // Validate all requests first
            const validationError = this.validateBatchRequests(requests)
            if (validationError) {
                return validationError
            }

            // Process each request
            const results = await this.processBatchUploads(requests, userId)

            const successCount = results.filter(r => r.success).length
            const failureCount = results.length - successCount
            const message = `${successCount}/${requests.length} assets uploaded successfully`

            if (failureCount > 0) {
                return multiStatusResponse(message, results)
            }
            return successResponse({ message, results })
        } catch (error) {
            return errorResponse(error)
        }
    }

    /**
     * Validates all requests in a batch upload.
     *
     * @param requests - Array of upload requests to validate
     * @returns DataResponse with error if validation fails, undefined if valid
     */
    private validateBatchRequests(requests: any[]): DataResponse | undefined {
        const config = this.getConfiguration()

        for (const request of requests) {
            if (!request.file || !request.description || !request.source || !request.filename) {
                return badRequestResponse('Each request must have description, source, filename, and file')
            }

            if (!this.validateBase64(request.file)) {
                return badRequestResponse(
                    `Invalid base64 data for file: ${request.filename}. File must be a valid base64-encoded string.`
                )
            }

            if (!this.validateFileExtension(request.filename)) {
                return badRequestResponse(
                    `Invalid file extension for ${request.filename}. Expected: ${config.extension}`
                )
            }
        }

        return undefined
    }

    /**
     * Processes batch upload requests.
     *
     * @param requests - Array of upload requests
     * @param ownerId - Owner user ID
     * @returns Array of results for each upload
     */
    private async processBatchUploads(
        requests: any[],
        ownerId: number
    ): Promise<Array<{ success: boolean; filename: string; error?: string }>> {
        const results: Array<{ success: boolean; filename: string; error?: string }> = []

        for (const request of requests) {
            try {
                await this.uploadAsset({
                    description: request.description,
                    source: request.source,
                    owner_id: ownerId,
                    filename: request.filename,
                    file: Buffer.from(request.file, 'base64'),
                    is_public: request.is_public !== undefined ? Boolean(request.is_public) : true
                })
                results.push({ success: true, filename: request.filename })
            } catch (error) {
                results.push({
                    success: false,
                    filename: request.filename,
                    error: error instanceof Error ? error.message : 'Unknown error'
                })
            }
        }

        return results
    }

    /**
     * Handle batch delete endpoint
     */
    async handleDeleteBatch(req: any): Promise<DataResponse> {
        try {
            if (!req?.body) {
                return badRequestResponse('Invalid request: missing request body')
            }

            // Authenticate user
            const authResult = await this.authenticateRequest(req)
            if (!authResult.success) {
                return authResult.response
            }
            const userId = authResult.userRecord.id
            if (!userId) {
                return errorResponse('Failed to retrieve user information')
            }

            const { ids } = req.body
            if (!Array.isArray(ids) || ids.length === 0) {
                return badRequestResponse('IDs array is required and must not be empty')
            }

            // Process deletions (admins can delete any asset)
            const results = await this.processBatchDeletes(ids, userId, req.headers)

            const successCount = results.filter(r => r.success).length
            const failureCount = results.length - successCount
            const message = `${successCount}/${ids.length} assets deleted successfully`

            if (failureCount > 0) {
                return multiStatusResponse(message, results)
            }
            return successResponse({ message, results })
        } catch (error) {
            return errorResponse(error)
        }
    }

    /**
     * Processes batch delete requests.
     *
     * Admins can delete any asset. Regular users can only delete their own assets
     * or assets with no owner.
     *
     * @param ids - Array of asset IDs to delete
     * @param userId - User ID for ownership validation
     * @param headers - HTTP request headers (for admin check)
     * @returns Array of results for each deletion
     */
    private async processBatchDeletes(
        ids: string[],
        userId: number,
        headers?: Record<string, string>
    ): Promise<Array<{ success: boolean; id: string; error?: string }>> {
        const results: Array<{ success: boolean; id: string; error?: string }> = []
        const isAdmin = headers && ApisixAuthParser.isAdmin(headers)

        for (const id of ids) {
            try {
                const asset = await this.getAssetById(id)
                if (!asset) {
                    results.push({ success: false, id, error: 'Asset not found' })
                    continue
                }

                // Allow deletion if: admin OR owner is the current user OR asset has no owner
                if (!isAdmin && asset.owner_id !== null && asset.owner_id !== userId) {
                    results.push({ success: false, id, error: 'You can only delete your own assets' })
                    continue
                }

                await this.deleteAssetById(id)
                results.push({ success: true, id })
            } catch (error) {
                results.push({
                    success: false,
                    id,
                    error: error instanceof Error ? error.message : 'Unknown error'
                })
            }
        }

        return results
    }
}
