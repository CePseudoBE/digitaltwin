import { AssetsManager } from './assets_manager.js'
import type { DataResponse } from './types.js'
import type { OpenAPIComponentSpec } from '../openapi/types.js'
import type { HttpMethod } from '../engine/endpoints.js'
import { extractAndStoreArchive } from '../utils/zip_utils.js'
import { ApisixAuthParser } from '../auth/apisix_parser.js'
import { AuthConfig } from '../auth/auth_config.js'
import type { AsyncUploadable } from './async_upload.js'
import type { TilesetUploadJobData } from '../engine/upload_processor.js'
import type { Queue } from 'bullmq'
import fs from 'fs/promises'
import {
    successResponse,
    errorResponse,
    badRequestResponse,
    unauthorizedResponse,
    notFoundResponse,
    forbiddenResponse
} from '../utils/http_responses.js'

/** Threshold for async upload (50MB) */
const ASYNC_UPLOAD_THRESHOLD = 50 * 1024 * 1024

/**
 * Metadata stored in database for a tileset.
 * Simplified: Cesium accesses files directly from OVH.
 */
export interface TilesetMetadataRow {
    id?: number
    name: string
    type: string
    /** Base path in storage for deletion (e.g., tilesets/123) */
    url: string
    /** Public URL to tileset.json */
    tileset_url: string
    date: Date
    description: string
    filename: string
    owner_id: number | null
    is_public?: boolean
    upload_status?: 'pending' | 'processing' | 'completed' | 'failed'
    upload_job_id?: string
    upload_error?: string
}

/**
 * Specialized Assets Manager for handling 3D Tiles tilesets.
 *
 * This manager extracts uploaded ZIP files and stores each file in cloud storage (OVH S3),
 * allowing Cesium and other 3D viewers to load tilesets directly via public URLs.
 *
 * ## How it works
 *
 * 1. User uploads a ZIP containing a 3D Tiles tileset
 * 2. ZIP is extracted and all files are stored in OVH with public-read ACL
 * 3. Database stores only the tileset.json URL and base path
 * 4. Cesium loads tileset.json directly from OVH
 * 5. Cesium fetches tiles using relative paths in tileset.json (directly from OVH)
 *
 * ## Endpoints
 *
 * - GET /{endpoint} - List all tilesets with their public URLs
 * - POST /{endpoint} - Upload tileset ZIP (sync < 50MB, async >= 50MB)
 * - GET /{endpoint}/:id/status - Poll async upload status
 * - PUT /{endpoint}/:id - Update tileset metadata
 * - DELETE /{endpoint}/:id - Delete tileset and all files from storage
 *
 * @example
 * ```typescript
 * class MyTilesetManager extends TilesetManager {
 *   getConfiguration() {
 *     return {
 *       name: 'tilesets',
 *       description: 'Manage 3D Tiles tilesets',
 *       contentType: 'application/json',
 *       endpoint: 'api/tilesets',
 *       extension: '.zip'
 *     }
 *   }
 * }
 *
 * // After upload, response contains:
 * // { tileset_url: 'https://bucket.s3.../tilesets/123/tileset.json' }
 * //
 * // Cesium loads directly:
 * // Cesium.Cesium3DTileset.fromUrl(tileset_url)
 * ```
 */
export abstract class TilesetManager extends AssetsManager implements AsyncUploadable {
    /** Upload queue for async processing (injected by engine) */
    protected uploadQueue: Queue | null = null

    /**
     * Set the upload queue for async job processing.
     * Called by DigitalTwinEngine during initialization.
     */
    setUploadQueue(queue: Queue): void {
        this.uploadQueue = queue
    }

    /**
     * Handle tileset upload.
     *
     * - Files < 50MB: Synchronous extraction and upload
     * - Files >= 50MB: Queued for async processing (returns 202)
     */
    async handleUpload(req: any): Promise<DataResponse> {
        try {
            if (!req?.body) {
                return badRequestResponse('Invalid request: missing request body')
            }

            // Authenticate user
            const userId = await this.authenticateUser(req)
            if (typeof userId !== 'number') {
                return userId // Returns error response
            }

            // Validate request
            const { description } = req.body
            const filePath = req.file?.path
            const fileBuffer = req.file?.buffer
            const filename = req.file?.originalname || req.body.filename
            const fileSize = req.file?.size || fileBuffer?.length || 0

            if (!filePath && !fileBuffer) {
                return badRequestResponse('Missing required field: ZIP file')
            }
            if (!description) {
                if (filePath) await fs.unlink(filePath).catch(() => {})
                return badRequestResponse('Missing required field: description')
            }
            if (!filename) {
                if (filePath) await fs.unlink(filePath).catch(() => {})
                return badRequestResponse('Filename could not be determined from uploaded file')
            }
            if (!filename.toLowerCase().endsWith('.zip')) {
                if (filePath) await fs.unlink(filePath).catch(() => {})
                return badRequestResponse('Invalid file extension. Expected: .zip')
            }

            const config = this.getConfiguration()
            const isPublic = req.body.is_public !== undefined ? Boolean(req.body.is_public) : true

            // Route to async or sync based on file size and queue availability
            if (this.uploadQueue && filePath && fileSize >= ASYNC_UPLOAD_THRESHOLD) {
                return this.handleAsyncUpload(userId, filePath, filename, description, isPublic, config)
            }

            return this.handleSyncUpload(userId, filePath, fileBuffer, filename, description, isPublic, config)
        } catch (error) {
            if (req.file?.path) await fs.unlink(req.file.path).catch(() => {})
            return errorResponse(error)
        }
    }

    /**
     * Authenticate user from request headers.
     * Returns user ID on success, or error response on failure.
     */
    private async authenticateUser(req: any): Promise<number | DataResponse> {
        if (AuthConfig.isAuthDisabled()) {
            const userRecord = await this.userService.findOrCreateUser({
                id: AuthConfig.getAnonymousUserId(),
                roles: []
            })
            return userRecord.id as number
        }

        if (!ApisixAuthParser.hasValidAuth(req.headers || {})) {
            return unauthorizedResponse()
        }

        const authUser = ApisixAuthParser.parseAuthHeaders(req.headers || {})
        if (!authUser) {
            return unauthorizedResponse('Invalid authentication headers')
        }

        const userRecord = await this.userService.findOrCreateUser(authUser)
        if (!userRecord.id) {
            return errorResponse('Failed to retrieve user information')
        }

        return userRecord.id
    }

    /**
     * Queue upload for background processing. Returns HTTP 202 immediately.
     */
    private async handleAsyncUpload(
        userId: number,
        filePath: string,
        filename: string,
        description: string,
        isPublic: boolean,
        config: ReturnType<typeof this.getConfiguration>
    ): Promise<DataResponse> {
        let recordId: number | null = null

        try {
            // Create pending record (url will be updated after extraction)
            const metadata: TilesetMetadataRow = {
                name: config.name,
                type: 'application/json',
                url: '',
                tileset_url: '',
                date: new Date(),
                description,
                filename,
                owner_id: userId,
                is_public: isPublic,
                upload_status: 'pending'
            }

            const savedRecord = await this.db.save(metadata as any)
            recordId = savedRecord.id as number

            const jobData: TilesetUploadJobData = {
                type: 'tileset',
                recordId,
                tempFilePath: filePath,
                componentName: config.name,
                userId,
                filename,
                description
            }

            const job = await this.uploadQueue?.add(`tileset-${recordId}`, jobData, {
                jobId: `tileset-upload-${recordId}`
            })

            if (!job) throw new Error('Failed to queue upload job')

            await this.db.updateById(config.name, recordId, { upload_job_id: job.id })

            return {
                status: 202,
                content: JSON.stringify({
                    message: 'Tileset upload accepted, processing in background',
                    id: recordId,
                    job_id: job.id,
                    status: 'pending',
                    status_url: `/${config.endpoint}/${recordId}/status`
                }),
                headers: { 'Content-Type': 'application/json' }
            }
        } catch (error) {
            if (recordId !== null) await this.db.delete(String(recordId), config.name).catch(() => {})
            await fs.unlink(filePath).catch(() => {})
            throw error
        }
    }

    /**
     * Process upload synchronously.
     */
    private async handleSyncUpload(
        userId: number,
        filePath: string | undefined,
        fileBuffer: Buffer | undefined,
        filename: string,
        description: string,
        isPublic: boolean,
        config: ReturnType<typeof this.getConfiguration>
    ): Promise<DataResponse> {
        let zipBuffer: Buffer

        try {
            const readBuffer = fileBuffer || (filePath ? await fs.readFile(filePath) : null)
            if (!readBuffer) throw new Error('No file data available')
            zipBuffer = readBuffer
        } catch (error) {
            return errorResponse(
                `Failed to read uploaded file: ${error instanceof Error ? error.message : 'Unknown error'}`
            )
        }

        try {
            // Generate unique base path using timestamp
            const basePath = `${config.name}/${Date.now()}`

            // Extract ZIP and upload all files to storage
            const extractResult = await extractAndStoreArchive(zipBuffer, this.storage, basePath)

            if (!extractResult.root_file) {
                // Clean up uploaded files
                await this.storage.deleteByPrefix(basePath).catch(() => {})
                return badRequestResponse('Invalid tileset: no tileset.json found in the ZIP archive')
            }

            // Build the public URL for tileset.json
            const tilesetPath = `${basePath}/${extractResult.root_file}`
            const tilesetUrl = this.storage.getPublicUrl(tilesetPath)

            // Save metadata to database (url = basePath for deletion)
            const metadata: TilesetMetadataRow = {
                name: config.name,
                type: 'application/json',
                url: basePath,
                tileset_url: tilesetUrl,
                date: new Date(),
                description,
                filename,
                owner_id: userId,
                is_public: isPublic,
                upload_status: 'completed'
            }

            const savedRecord = await this.db.save(metadata as any)

            // Clean up temp file
            if (filePath) await fs.unlink(filePath).catch(() => {})

            return successResponse({
                message: 'Tileset uploaded successfully',
                id: savedRecord.id,
                tileset_url: tilesetUrl,
                file_count: extractResult.file_count
            })
        } catch (error) {
            if (filePath) await fs.unlink(filePath).catch(() => {})
            throw error
        }
    }

    /**
     * Get upload status for async uploads.
     */
    async handleGetStatus(req: any): Promise<DataResponse> {
        try {
            const { id } = req.params || {}
            if (!id) {
                return badRequestResponse('Asset ID is required')
            }

            const asset = await this.getAssetById(id)
            if (!asset) {
                return notFoundResponse('Tileset not found')
            }

            const record = asset as any

            if (record.upload_status === 'completed') {
                return successResponse({
                    id: record.id,
                    status: 'completed',
                    tileset_url: record.tileset_url
                })
            }

            if (record.upload_status === 'failed') {
                return successResponse({
                    id: record.id,
                    status: 'failed',
                    error: record.upload_error || 'Upload failed'
                })
            }

            return successResponse({
                id: record.id,
                status: record.upload_status || 'unknown',
                job_id: record.upload_job_id
            })
        } catch (error) {
            return errorResponse(error)
        }
    }

    /**
     * List all tilesets with their public URLs.
     */
    async retrieve(req?: any): Promise<DataResponse> {
        try {
            const assets = await this.getAllAssets()
            const isAdmin = req && ApisixAuthParser.isAdmin(req.headers || {})

            // Get authenticated user ID if available
            let authenticatedUserId: number | null = null
            if (req && ApisixAuthParser.hasValidAuth(req.headers || {})) {
                const authUser = ApisixAuthParser.parseAuthHeaders(req.headers || {})
                if (authUser) {
                    const userRecord = await this.userService.findOrCreateUser(authUser)
                    authenticatedUserId = userRecord.id || null
                }
            }

            // Filter to visible assets only (unless admin)
            const visibleAssets = isAdmin
                ? assets
                : assets.filter(
                      asset =>
                          asset.is_public || (authenticatedUserId !== null && asset.owner_id === authenticatedUserId)
                  )

            // Transform to response format
            const response = visibleAssets.map(asset => ({
                id: asset.id,
                description: asset.description || '',
                filename: asset.filename || '',
                date: asset.date,
                owner_id: asset.owner_id || null,
                is_public: asset.is_public ?? true,
                tileset_url: (asset as any).tileset_url || '',
                upload_status: (asset as any).upload_status || 'completed'
            }))

            return successResponse(response)
        } catch (error) {
            return errorResponse(error)
        }
    }

    /**
     * Delete tileset and all files from storage.
     */
    async handleDelete(req: any): Promise<DataResponse> {
        try {
            // Authenticate user
            const userId = await this.authenticateUser(req)
            if (typeof userId !== 'number') {
                return userId
            }

            const { id } = req.params || {}
            if (!id) {
                return badRequestResponse('Asset ID is required')
            }

            const asset = await this.getAssetById(id)
            if (!asset) {
                return notFoundResponse('Tileset not found')
            }

            // Check ownership (admins can delete any)
            const isAdmin = ApisixAuthParser.isAdmin(req.headers || {})
            if (!isAdmin && asset.owner_id !== null && asset.owner_id !== userId) {
                return forbiddenResponse('You can only delete your own assets')
            }

            // Block deletion while upload in progress
            if (asset.upload_status === 'pending' || asset.upload_status === 'processing') {
                return {
                    status: 409,
                    content: JSON.stringify({ error: 'Cannot delete tileset while upload is in progress' }),
                    headers: { 'Content-Type': 'application/json' }
                }
            }

            // Delete all files from storage
            // Support both new format (url = basePath) and legacy format (file_index.files)
            const legacyFileIndex = (asset as any).file_index as
                | { files?: Array<{ path: string }>; root_file?: string }
                | undefined

            if (legacyFileIndex?.files && legacyFileIndex.files.length > 0) {
                // Legacy format: delete individual files from file_index
                console.log(`[TilesetManager] Deleting ${legacyFileIndex.files.length} files (legacy format)`)
                for (const file of legacyFileIndex.files) {
                    await this.storage.delete(file.path).catch(() => {
                        // Ignore individual file deletion errors
                    })
                }
            } else if (asset.url) {
                // New format: url contains basePath, use deleteByPrefix
                const deletedCount = await this.storage.deleteByPrefix(asset.url)
                console.log(`[TilesetManager] Deleted ${deletedCount} files from ${asset.url}`)
            }

            // Delete database record
            await this.deleteAssetById(id)

            return successResponse({ message: 'Tileset deleted successfully' })
        } catch (error) {
            return errorResponse(error)
        }
    }

    /**
     * Get HTTP endpoints for this manager.
     */
    getEndpoints(): Array<{
        method: HttpMethod
        path: string
        handler: (...args: any[]) => any
        responseType?: string
    }> {
        const config = this.getConfiguration()

        return [
            // Status endpoint (for async upload polling)
            {
                method: 'get',
                path: `/${config.endpoint}/:id/status`,
                handler: this.handleGetStatus.bind(this),
                responseType: 'application/json'
            },
            // List tilesets
            {
                method: 'get',
                path: `/${config.endpoint}`,
                handler: this.retrieve.bind(this),
                responseType: 'application/json'
            },
            // Upload tileset
            {
                method: 'post',
                path: `/${config.endpoint}`,
                handler: this.handleUpload.bind(this),
                responseType: 'application/json'
            },
            // Update metadata
            {
                method: 'put',
                path: `/${config.endpoint}/:id`,
                handler: this.handleUpdate.bind(this),
                responseType: 'application/json'
            },
            // Delete tileset
            {
                method: 'delete',
                path: `/${config.endpoint}/:id`,
                handler: this.handleDelete.bind(this),
                responseType: 'application/json'
            }
        ]
    }

    /**
     * Generate OpenAPI specification.
     */
    getOpenAPISpec(): OpenAPIComponentSpec {
        const config = this.getConfiguration()
        const basePath = `/${config.endpoint}`
        const tagName = config.tags?.[0] || config.name

        return {
            paths: {
                [basePath]: {
                    get: {
                        summary: 'List all tilesets',
                        description: 'Returns all tilesets with their public URLs for Cesium loading',
                        tags: [tagName],
                        responses: {
                            '200': {
                                description: 'List of tilesets',
                                content: {
                                    'application/json': {
                                        schema: {
                                            type: 'array',
                                            items: { $ref: '#/components/schemas/TilesetResponse' }
                                        }
                                    }
                                }
                            }
                        }
                    },
                    post: {
                        summary: 'Upload a tileset',
                        description:
                            'Upload a ZIP file containing a 3D Tiles tileset. Files < 50MB are processed synchronously, larger files are queued.',
                        tags: [tagName],
                        security: [{ ApiKeyAuth: [] }],
                        requestBody: {
                            required: true,
                            content: {
                                'multipart/form-data': {
                                    schema: {
                                        type: 'object',
                                        required: ['file', 'description'],
                                        properties: {
                                            file: {
                                                type: 'string',
                                                format: 'binary',
                                                description: 'ZIP file containing tileset'
                                            },
                                            description: { type: 'string', description: 'Tileset description' },
                                            is_public: {
                                                type: 'boolean',
                                                description: 'Whether tileset is public (default: true)'
                                            }
                                        }
                                    }
                                }
                            }
                        },
                        responses: {
                            '200': {
                                description: 'Tileset uploaded successfully (sync)',
                                content: {
                                    'application/json': {
                                        schema: {
                                            type: 'object',
                                            properties: {
                                                message: { type: 'string' },
                                                id: { type: 'integer' },
                                                tileset_url: {
                                                    type: 'string',
                                                    description: 'Public URL to load in Cesium'
                                                },
                                                file_count: { type: 'integer' }
                                            }
                                        }
                                    }
                                }
                            },
                            '202': {
                                description: 'Upload accepted for async processing',
                                content: {
                                    'application/json': {
                                        schema: {
                                            type: 'object',
                                            properties: {
                                                message: { type: 'string' },
                                                id: { type: 'integer' },
                                                status: { type: 'string' },
                                                status_url: { type: 'string' }
                                            }
                                        }
                                    }
                                }
                            },
                            '400': { description: 'Bad request - missing fields or invalid file' },
                            '401': { description: 'Unauthorized' }
                        }
                    }
                },
                [`${basePath}/{id}/status`]: {
                    get: {
                        summary: 'Get upload status',
                        description: 'Poll the status of an async upload',
                        tags: [tagName],
                        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                        responses: {
                            '200': {
                                description: 'Upload status',
                                content: {
                                    'application/json': {
                                        schema: {
                                            type: 'object',
                                            properties: {
                                                id: { type: 'integer' },
                                                status: {
                                                    type: 'string',
                                                    enum: ['pending', 'processing', 'completed', 'failed']
                                                },
                                                tileset_url: { type: 'string' },
                                                error: { type: 'string' }
                                            }
                                        }
                                    }
                                }
                            },
                            '404': { description: 'Tileset not found' }
                        }
                    }
                },
                [`${basePath}/{id}`]: {
                    put: {
                        summary: 'Update tileset metadata',
                        tags: [tagName],
                        security: [{ ApiKeyAuth: [] }],
                        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                        requestBody: {
                            content: {
                                'application/json': {
                                    schema: {
                                        type: 'object',
                                        properties: {
                                            description: { type: 'string' },
                                            is_public: { type: 'boolean' }
                                        }
                                    }
                                }
                            }
                        },
                        responses: {
                            '200': { description: 'Updated successfully' },
                            '401': { description: 'Unauthorized' },
                            '403': { description: 'Forbidden' },
                            '404': { description: 'Not found' }
                        }
                    },
                    delete: {
                        summary: 'Delete tileset',
                        description: 'Delete tileset and all files from storage',
                        tags: [tagName],
                        security: [{ ApiKeyAuth: [] }],
                        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                        responses: {
                            '200': { description: 'Deleted successfully' },
                            '401': { description: 'Unauthorized' },
                            '403': { description: 'Forbidden' },
                            '404': { description: 'Not found' },
                            '409': { description: 'Upload in progress' }
                        }
                    }
                }
            },
            tags: [{ name: tagName, description: config.description }],
            schemas: {
                TilesetResponse: {
                    type: 'object',
                    properties: {
                        id: { type: 'integer' },
                        description: { type: 'string' },
                        filename: { type: 'string' },
                        date: { type: 'string', format: 'date-time' },
                        owner_id: { type: 'integer', nullable: true },
                        is_public: { type: 'boolean' },
                        tileset_url: { type: 'string', description: 'Public URL to load in Cesium' },
                        upload_status: { type: 'string', enum: ['pending', 'processing', 'completed', 'failed'] }
                    }
                }
            }
        }
    }
}
