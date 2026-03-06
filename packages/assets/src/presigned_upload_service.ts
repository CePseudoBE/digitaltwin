import type {
    DataResponse,
    DataRecord,
    TypedRequest,
    PresignedUploadRequestBody,
    AuthResult,
    AssetsManagerConfiguration
} from '@digitaltwin/shared'
import {
    successResponse,
    errorResponse,
    badRequestResponse,
    notFoundResponse,
    validateData,
    validatePresignedUploadRequest
} from '@digitaltwin/shared'
import type { StorageService } from '@digitaltwin/storage'
import type { DatabaseAdapter, MetadataRow } from '@digitaltwin/database'
import type { AuthMiddleware } from '@digitaltwin/auth'

/**
 * Dependencies required by the presigned upload service.
 * Provided by the AssetsManager that owns this service.
 */
export interface PresignedUploadDeps {
    db: DatabaseAdapter
    storage: StorageService
    authMiddleware: AuthMiddleware
    getConfiguration(): AssetsManagerConfiguration
    getAssetById(id: string): Promise<DataRecord | undefined>
    validateOwnership(asset: DataRecord, userId: number, headers?: Record<string, string | string[] | undefined>): DataResponse | undefined
    validateFileExtension(filename: string): boolean
}

/**
 * Handles presigned URL upload flow: request generation and confirmation.
 *
 * Extracted from AssetsManager to keep upload concerns separate from
 * general asset CRUD operations.
 */
export class PresignedUploadService {
    private deps: PresignedUploadDeps

    constructor(deps: PresignedUploadDeps) {
        this.deps = deps
    }

    /**
     * Generate a presigned PUT URL for direct client-to-storage upload.
     *
     * Flow:
     * 1. Authenticate user
     * 2. Validate body (fileName, fileSize, contentType)
     * 3. Check storage supports presigned URLs
     * 4. Validate file extension
     * 5. Generate presigned PUT URL
     * 6. Save pending DB record
     * 7. Return { fileId, uploadUrl, key, expiresAt }
     */
    async handleUploadRequest(req: TypedRequest): Promise<DataResponse> {
        try {
            if (!req?.body) {
                return badRequestResponse('Invalid request: missing request body')
            }

            // Authenticate user
            const authResult = await this.deps.authMiddleware.authenticate(req)
            if (!authResult.success) {
                return authResult.response
            }
            const userId = authResult.userRecord.id
            if (!userId) {
                return errorResponse('Failed to retrieve user information')
            }

            // Check presigned URL support
            if (!this.deps.storage.supportsPresignedUrls()) {
                return badRequestResponse('Presigned uploads are not supported with the current storage backend')
            }

            // Validate request body
            const validated = await validateData<PresignedUploadRequestBody>(validatePresignedUploadRequest, req.body)
            const { fileName, contentType, description, source, is_public } = validated

            // Validate file extension
            if (!this.deps.validateFileExtension(fileName)) {
                const config = this.deps.getConfiguration()
                return badRequestResponse(`Invalid file extension. Expected: ${config.extension}`)
            }

            const config = this.deps.getConfiguration()
            const sanitizedFilename = fileName.replace(/[^a-zA-Z0-9._-]/g, '_')
            const key = `${config.name}/${Date.now()}/${sanitizedFilename}`

            // Generate presigned URL (5 min expiry)
            const presigned = await this.deps.storage.generatePresignedUploadUrl(key, contentType, 300)

            // Save pending record in database
            const metadata: MetadataRow = {
                name: config.name,
                type: contentType,
                url: '',
                date: new Date(),
                description: description || '',
                source: source || '',
                owner_id: userId,
                filename: fileName,
                is_public: is_public ?? true,
                presigned_key: presigned.key,
                presigned_expires_at: presigned.expiresAt
            }

            // Use upload_status field via updateById after save
            const savedRecord = await this.deps.db.save(metadata)
            await this.deps.db.updateById(config.name, savedRecord.id, {
                upload_status: 'pending'
            })

            return successResponse({
                fileId: savedRecord.id,
                uploadUrl: presigned.url,
                key: presigned.key,
                expiresAt: presigned.expiresAt.toISOString()
            })
        } catch (error) {
            return errorResponse(error)
        }
    }

    /**
     * Confirm that a file has been uploaded via the presigned URL.
     *
     * Flow:
     * 1. Authenticate user
     * 2. Fetch record, check ownership
     * 3. Check upload_status === 'pending'
     * 4. Verify file exists on storage via objectExists
     * 5. Update record to completed with URL = presigned_key
     */
    async handleConfirm(req: TypedRequest): Promise<DataResponse> {
        try {
            // Authenticate user
            const authResult = await this.deps.authMiddleware.authenticate(req)
            if (!authResult.success) {
                return authResult.response
            }
            const userId = authResult.userRecord.id
            if (!userId) {
                return errorResponse('Failed to retrieve user information')
            }

            const fileId = req.params?.fileId
            if (!fileId) {
                return badRequestResponse('File ID is required')
            }

            const config = this.deps.getConfiguration()
            const asset = await this.deps.getAssetById(fileId)
            if (!asset) {
                return notFoundResponse('Asset not found')
            }

            // Check ownership
            const ownershipError = this.deps.validateOwnership(asset, userId, req.headers)
            if (ownershipError) {
                return ownershipError
            }

            // Check status
            if (asset.upload_status !== 'pending') {
                return {
                    status: 409,
                    content: JSON.stringify({ error: `Upload is not pending (current status: ${asset.upload_status || 'completed'})` }),
                    headers: { 'Content-Type': 'application/json' }
                }
            }

            // Verify file exists on storage
            if (!asset.presigned_key) {
                return badRequestResponse('No presigned key found for this record')
            }

            const existsResult = await this.deps.storage.objectExists(asset.presigned_key)
            if (!existsResult.exists) {
                return badRequestResponse('File not found on storage. Please upload the file using the presigned URL first.')
            }

            // Update record to completed
            await this.deps.db.updateById(config.name, asset.id, {
                upload_status: 'completed',
                url: asset.presigned_key
            })

            return successResponse({
                message: 'Upload confirmed successfully',
                id: asset.id,
                url: asset.presigned_key
            })
        } catch (error) {
            return errorResponse(error)
        }
    }
}
