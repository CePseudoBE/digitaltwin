/**
 * StorageService for any S3-compatible object storage (AWS S3, MinIO, Scaleway, ...)
 * through @aws-sdk/client-s3
 */
import {
    S3Client,
    PutObjectCommand,
    GetObjectCommand,
    DeleteObjectCommand,
    DeleteObjectsCommand,
    ListObjectsV2Command,
    HeadObjectCommand,
    PutBucketCorsCommand,
    ObjectCannedACL
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { StorageService } from '../storage_service.js'
import type { PresignedUploadResult, ObjectExistsResult } from '../storage_service.js'
import { safeAsync, Logger, StorageError } from '@cepseudo/shared'
import type { Readable } from 'stream'

const logger = new Logger('S3Storage')

export interface S3StorageConfig {
    accessKey: string
    secretKey: string
    /** e.g. 'https://s3.eu-west-1.amazonaws.com', 'http://localhost:9000' */
    endpoint: string
    /** Default: 'us-east-1' */
    region?: string
    bucket: string
    /** Address the bucket in the path (`<endpoint>/<bucket>/<key>`) rather than the host; MinIO needs it. Default: false */
    pathStyle?: boolean
    /** Base URL for public links instead of the bucket URL, e.g. a CDN or custom domain */
    publicUrl?: string
}

export class S3StorageService extends StorageService {
    #s3: S3Client
    readonly #bucket: string
    readonly #endpoint: string
    readonly #pathStyle: boolean
    readonly #publicUrl?: string

    constructor(config: S3StorageConfig) {
        super()
        this.#bucket = config.bucket
        this.#endpoint = config.endpoint
        this.#pathStyle = config.pathStyle ?? false
        this.#publicUrl = config.publicUrl
        this.#s3 = new S3Client({
            endpoint: config.endpoint,
            region: config.region ?? 'us-east-1',
            credentials: {
                accessKeyId: config.accessKey,
                secretAccessKey: config.secretKey
            },
            forcePathStyle: this.#pathStyle,
            // Several S3-compatible services reject the checksum headers the SDK sends by default
            requestChecksumCalculation: 'WHEN_REQUIRED',
            responseChecksumValidation: 'WHEN_REQUIRED'
        })
    }

    /**
     * Uploads a file to the bucket.
     * @param buffer - File contents to upload
     * @param collectorName - Folder/prefix to store under
     * @param extension - Optional file extension (e.g. 'json')
     * @returns The relative path (key) of the stored object
     */
    async save(buffer: Buffer, collectorName: string, extension?: string): Promise<string> {
        const now = new Date()
        const timestamp = now.toISOString().replace(/[:.]/g, '-')
        const key = `${collectorName || 'default'}/${timestamp}${extension ? '.' + extension : ''}`

        await this.#s3.send(
            new PutObjectCommand({
                Bucket: this.#bucket,
                Key: key,
                Body: buffer,
                ACL: ObjectCannedACL.private
            })
        )

        return key
    }

    /**
     * Downloads and returns a stored object as a Buffer.
     * @param relativePath - The key/path of the object to retrieve
     * @returns The object contents as a Buffer
     */
    async retrieve(relativePath: string): Promise<Buffer> {
        const res = await this.#s3.send(
            new GetObjectCommand({
                Bucket: this.#bucket,
                Key: relativePath
            })
        )

        const chunks: Buffer[] = []
        const stream = res.Body as Readable

        for await (const chunk of stream) {
            chunks.push(Buffer.from(chunk))
        }

        return Buffer.concat(chunks)
    }

    /**
     * Deletes an object from the storage bucket.
     * @param relativePath - The key/path of the object to delete
     */
    async delete(relativePath: string): Promise<void> {
        await this.#s3.send(
            new DeleteObjectCommand({
                Bucket: this.#bucket,
                Key: relativePath
            })
        )
    }

    /**
     * Uploads a file at a specific path (preserves filename).
     * Unlike save(), this method does not auto-generate a timestamp filename.
     * Files are uploaded with public-read ACL for direct access (e.g., Cesium tilesets).
     * @param buffer - File contents to upload
     * @param relativePath - Full relative path including filename (e.g., 'tilesets/123/tileset.json')
     * @returns The same relative path that was provided
     */
    async saveWithPath(buffer: Buffer, relativePath: string): Promise<string> {
        await this.#s3.send(
            new PutObjectCommand({
                Bucket: this.#bucket,
                Key: relativePath,
                Body: buffer,
                ACL: ObjectCannedACL.public_read
            })
        )

        return relativePath
    }

    /**
     * Deletes multiple objects in batch using S3 DeleteObjects API.
     * Much faster than individual deletes - can delete up to 1000 objects per request.
     * @param paths - Array of object keys to delete
     */
    override async deleteBatch(paths: string[]): Promise<void> {
        if (paths.length === 0) return

        // S3 DeleteObjects supports max 1000 objects per request
        const BATCH_SIZE = 1000
        const batches: string[][] = []

        for (let i = 0; i < paths.length; i += BATCH_SIZE) {
            batches.push(paths.slice(i, i + BATCH_SIZE))
        }

        // Process batches in parallel (but limit concurrency to avoid overwhelming the API)
        const MAX_CONCURRENT = 5
        for (let i = 0; i < batches.length; i += MAX_CONCURRENT) {
            const concurrentBatches = batches.slice(i, i + MAX_CONCURRENT)
            await Promise.all(
                concurrentBatches.map((batch, index) =>
                    safeAsync(() => this.#deleteObjects(batch), `delete batch ${i + index + 1}/${batches.length}`, logger)
                )
            )
        }
    }

    /**
     * Returns the public URL for a stored file: `<publicUrl>/<key>` when configured, otherwise
     * `<endpoint>/<bucket>/<key>` in path style or `<scheme>://<bucket>.<endpoint host>/<key>`.
     * Each path segment is URL-encoded, so keys with spaces or `#` stay loadable.
     * @param relativePath - The storage path/key of the file
     * @returns The public URL to access the file directly
     */
    getPublicUrl(relativePath: string): string {
        const key = relativePath.split('/').map(encodeURIComponent).join('/')
        if (this.#publicUrl) return `${this.#publicUrl.replace(/\/+$/, '')}/${key}`
        if (this.#pathStyle) return `${this.#endpoint.replace(/\/+$/, '')}/${this.#bucket}/${key}`
        const { protocol, host } = new URL(this.#endpoint)
        return `${protocol}//${this.#bucket}.${host}/${key}`
    }

    /**
     * Deletes all objects under a given prefix (folder).
     * Lists objects by prefix and deletes them in batches for performance.
     * @param prefix - The folder/prefix to delete (e.g., 'tilesets/123')
     * @returns Number of files deleted
     */
    async deleteByPrefix(prefix: string): Promise<number> {
        let totalDeleted = 0
        let continuationToken: string | undefined

        // Ensure prefix ends with '/' to avoid partial matches
        const safePrefix = this.assertDeletablePrefix(prefix)
        const normalizedPrefix = safePrefix.endsWith('/') ? safePrefix : `${safePrefix}/`

        do {
            // List objects with prefix (max 1000 per request)
            const listResponse = await this.#s3.send(
                new ListObjectsV2Command({
                    Bucket: this.#bucket,
                    Prefix: normalizedPrefix,
                    ContinuationToken: continuationToken
                })
            )

            const objects = listResponse.Contents || []
            if (objects.length === 0) break

            // Delete objects in batch
            const keys = objects.map(obj => obj.Key).filter((key): key is string => !!key)

            if (keys.length > 0) {
                await this.#deleteObjects(keys)
                totalDeleted += keys.length
            }

            continuationToken = listResponse.NextContinuationToken
        } while (continuationToken)

        return totalDeleted
    }

    /**
     * Deletes up to 1000 keys in one request.
     * @throws {StorageError} When S3 reports keys it could not delete
     */
    async #deleteObjects(keys: string[]): Promise<void> {
        const { Errors } = await this.#s3.send(
            new DeleteObjectsCommand({
                Bucket: this.#bucket,
                Delete: { Objects: keys.map(key => ({ Key: key })), Quiet: true }
            })
        )
        // Quiet mode still lists the failed keys: an HTTP 200 alone does not mean they are gone
        if (Errors && Errors.length > 0) {
            const [first] = Errors
            throw new StorageError(
                `Failed to delete ${Errors.length} of ${keys.length} objects (${first.Key}: ${first.Code} ${first.Message})`,
                { keys: Errors.map(error => error.Key) }
            )
        }
    }

    /**
     * This storage backend supports presigned URLs for direct client uploads.
     */
    override supportsPresignedUrls(): boolean {
        return true
    }

    /**
     * Generate a presigned PUT URL for direct client-to-S3 uploads.
     */
    override async generatePresignedUploadUrl(
        key: string,
        contentType: string,
        expiresInSeconds: number = 300
    ): Promise<PresignedUploadResult> {
        const command = new PutObjectCommand({
            Bucket: this.#bucket,
            Key: key,
            ContentType: contentType
        })

        const url = await getSignedUrl(this.#s3, command, { expiresIn: expiresInSeconds })
        const expiresAt = new Date(Date.now() + expiresInSeconds * 1000)

        return { url, key, expiresAt }
    }

    /**
     * Check if an object exists in the S3 bucket using HeadObject.
     */
    override async objectExists(key: string): Promise<ObjectExistsResult> {
        try {
            const response = await this.#s3.send(
                new HeadObjectCommand({
                    Bucket: this.#bucket,
                    Key: key
                })
            )
            return {
                exists: true,
                contentLength: response.ContentLength,
                contentType: response.ContentType
            }
        } catch (error: unknown) {
            const name = (error as { name?: string })?.name
            if (name === 'NotFound' || name === 'NoSuchKey') {
                return { exists: false }
            }
            throw error
        }
    }

    /**
     * Configure CORS settings for the bucket.
     * Required for browser-based access to public files (e.g., Cesium loading tilesets).
     * Should be called once during application startup.
     *
     * @param allowedOrigins - List of allowed origins (default: ['*'])
     * @param allowedMethods - List of allowed HTTP methods (default: ['GET', 'HEAD'])
     * @param allowedHeaders - List of allowed headers (default: ['*', 'Authorization'])
     * @returns true if successful, false otherwise
     */
    async configureCors(
        allowedOrigins: string[] = ['*'],
        allowedMethods: string[] = ['GET', 'HEAD', 'PUT'],
        allowedHeaders: string[] = ['*', 'Authorization']
    ): Promise<boolean> {
        try {
            await this.#s3.send(
                new PutBucketCorsCommand({
                    Bucket: this.#bucket,
                    CORSConfiguration: {
                        CORSRules: [
                            {
                                AllowedOrigins: allowedOrigins,
                                AllowedMethods: allowedMethods,
                                AllowedHeaders: allowedHeaders,
                                ExposeHeaders: ['ETag', 'Content-Length'],
                                MaxAgeSeconds: 3000
                            }
                        ]
                    }
                })
            )
            console.log('[S3StorageService] CORS configured successfully')
            return true
        } catch (error) {
            console.error('[S3StorageService] Error configuring CORS:', error)
            return false
        }
    }
}
