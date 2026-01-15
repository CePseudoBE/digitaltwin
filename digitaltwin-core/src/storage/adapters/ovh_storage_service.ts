/**
 * OVH Object Storage implementation of StorageService
 * via S3-compatible API using @aws-sdk/client-s3
 */
import {
    S3Client,
    PutObjectCommand,
    GetObjectCommand,
    DeleteObjectCommand,
    DeleteObjectsCommand,
    ListObjectsV2Command,
    PutBucketCorsCommand,
    ObjectCannedACL
} from '@aws-sdk/client-s3'
import { StorageService } from '../storage_service.js'
import { safeAsync } from '../../utils/safe_async.js'
import { Logger } from '../../utils/logger.js'
import type { Readable } from 'stream'

const logger = new Logger('OvhS3Storage')

export interface OvhS3Config {
    accessKey: string
    secretKey: string
    endpoint: string // e.g. 'https://s3.gra.io.cloud.ovh.net'
    region?: string // e.g. 'gra'
    bucket: string
}

export class OvhS3StorageService extends StorageService {
    #s3: S3Client
    readonly #bucket: string
    readonly #endpoint: string

    constructor(config: OvhS3Config) {
        super()
        this.#bucket = config.bucket
        this.#endpoint = config.endpoint
        this.#s3 = new S3Client({
            endpoint: config.endpoint,
            region: config.region ?? 'gra',
            credentials: {
                accessKeyId: config.accessKey,
                secretAccessKey: config.secretKey
            },
            forcePathStyle: false,
            // Match Python boto3 config for OVH compatibility
            requestChecksumCalculation: 'WHEN_REQUIRED',
            responseChecksumValidation: 'WHEN_REQUIRED'
        })
    }

    /**
     * Uploads a file to the OVH S3-compatible object storage.
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
     * Uploads a file to OVH S3 at a specific path (preserves filename).
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
                    safeAsync(
                        () =>
                            this.#s3.send(
                                new DeleteObjectsCommand({
                                    Bucket: this.#bucket,
                                    Delete: {
                                        Objects: batch.map(key => ({ Key: key })),
                                        Quiet: true // Don't return info about each deleted object
                                    }
                                })
                            ),
                        `delete batch ${i + index + 1}/${batches.length}`,
                        logger
                    )
                )
            )
        }
    }

    /**
     * Returns the public URL for a stored file.
     * Constructs the OVH S3 public URL format: https://{bucket}.{endpoint_host}/{key}
     * @param relativePath - The storage path/key of the file
     * @returns The public URL to access the file directly
     */
    getPublicUrl(relativePath: string): string {
        // Extract host from endpoint (e.g., 'https://s3.gra.io.cloud.ovh.net' -> 's3.gra.io.cloud.ovh.net')
        const endpointHost = this.#endpoint.replace(/^https?:\/\//, '')
        // OVH S3 URL format: https://{bucket}.{endpoint_host}/{key}
        return `https://${this.#bucket}.${endpointHost}/${relativePath}`
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
        const normalizedPrefix = prefix.endsWith('/') ? prefix : `${prefix}/`

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
                await this.#s3.send(
                    new DeleteObjectsCommand({
                        Bucket: this.#bucket,
                        Delete: {
                            Objects: keys.map(key => ({ Key: key })),
                            Quiet: true
                        }
                    })
                )
                totalDeleted += keys.length
            }

            continuationToken = listResponse.NextContinuationToken
        } while (continuationToken)

        return totalDeleted
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
        allowedMethods: string[] = ['GET', 'HEAD'],
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
            console.log('[OvhS3StorageService] CORS configured successfully')
            return true
        } catch (error) {
            console.error('[OvhS3StorageService] Error configuring CORS:', error)
            return false
        }
    }
}
