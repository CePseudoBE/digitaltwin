import { Worker, type Job } from 'bullmq'
import type { ConnectionOptions } from 'bullmq'
import type { StorageService } from '@digitaltwin/storage'
import type { DatabaseAdapter } from '@digitaltwin/database'
import { extractAndStoreArchive } from './utils/zip_utils.js'
import { safeAsync, safeCleanup, Logger } from '@digitaltwin/shared'
import fs from 'fs/promises'

const logger = new Logger('UploadProcessor')

export interface TilesetUploadJobData {
    type: 'tileset'
    recordId: number
    tempFilePath: string
    componentName: string
    userId: number
    filename: string
    description: string
    /** S3 key for presigned uploads (when set, download from S3 instead of reading temp file) */
    presignedKey?: string
}

export type UploadJobData = TilesetUploadJobData
export type UploadStatus = 'pending' | 'processing' | 'completed' | 'failed'

/**
 * Background worker for processing large file uploads (tileset extraction).
 * Prevents HTTP timeout by queuing jobs and processing asynchronously.
 *
 * Flow:
 * 1. Read ZIP from temp file
 * 2. Extract and upload all files to storage (OVH S3)
 * 3. Update database with tileset_url and base_path
 * 4. Clean up temp file
 */
export class UploadProcessor {
    private worker: Worker | null = null
    private storage: StorageService
    private db: DatabaseAdapter

    constructor(storage: StorageService, db: DatabaseAdapter) {
        this.storage = storage
        this.db = db
    }

    start(connection: ConnectionOptions): void {
        this.worker = new Worker('dt-uploads', async (job: Job<UploadJobData>) => this.processJob(job), {
            connection,
            concurrency: 2,
            limiter: { max: 5, duration: 60000 }
        })

        this.worker.on('completed', job => console.log(`[UploadProcessor] Job ${job.id} completed`))
        this.worker.on('failed', (job, err) => console.error(`[UploadProcessor] Job ${job?.id} failed:`, err.message))
    }

    async stop(): Promise<void> {
        if (this.worker) {
            await this.worker.close()
            this.worker = null
        }
    }

    private async processJob(job: Job<UploadJobData>): Promise<void> {
        if (job.data.type === 'tileset') {
            await this.processTilesetUpload(job as Job<TilesetUploadJobData>)
        } else {
            throw new Error(`Unknown upload job type: ${String((job.data as unknown as Record<string, unknown>).type)}`)
        }
    }

    /**
     * Process a tileset upload job. Public for testability.
     */
    async processTilesetUpload(job: Job<TilesetUploadJobData>): Promise<void> {
        const { recordId, tempFilePath, componentName, presignedKey } = job.data
        let basePath: string | null = null

        try {
            await this.updateRecordStatus(recordId, componentName, 'processing')
            await job.updateProgress(10)

            // Read ZIP file from presigned S3 key or temp file
            let zipBuffer: Buffer
            if (presignedKey) {
                zipBuffer = await this.storage.retrieve(presignedKey).catch(err => {
                    throw new Error(`Failed to download presigned file from storage: ${err.message}`)
                })
            } else {
                zipBuffer = await fs.readFile(tempFilePath).catch(err => {
                    throw new Error(`Failed to read temp file: ${err.message}`)
                })
            }
            await job.updateProgress(20)

            // Generate unique base path
            basePath = `${componentName}/${Date.now()}`

            // Extract and upload all files to storage
            const extractResult = await extractAndStoreArchive(zipBuffer, this.storage, basePath)
            await job.updateProgress(80)

            // Validate tileset.json exists
            if (!extractResult.root_file) {
                // Clean up uploaded files (basePath is always set at this point)
                if (basePath) {
                    const pathToDelete = basePath
                    await safeAsync(
                        () => this.storage.deleteByPrefix(pathToDelete),
                        'cleanup storage on invalid tileset',
                        logger
                    )
                }
                throw new Error('Invalid tileset: no tileset.json found in the ZIP archive')
            }

            // Build the public URL for tileset.json
            const tilesetPath = `${basePath}/${extractResult.root_file}`
            const tilesetUrl = this.storage.getPublicUrl(tilesetPath)

            // Update database record (url = basePath for deletion)
            await this.db.updateById(componentName, recordId, {
                url: basePath,
                tileset_url: tilesetUrl,
                upload_status: 'completed'
            })
            await job.updateProgress(90)

            // Clean up source file
            if (presignedKey) {
                // Delete the original ZIP from S3 (extraction created individual files)
                await safeAsync(() => this.storage.delete(presignedKey), 'cleanup presigned ZIP after extraction', logger)
            } else if (tempFilePath) {
                await safeAsync(() => fs.unlink(tempFilePath), 'cleanup temp file after upload', logger)
            }
            await job.updateProgress(100)

            logger.info(`Tileset ${recordId} uploaded: ${extractResult.file_count} files`)
        } catch (error) {
            // Update record as failed (don't delete - keep for debugging)
            const errorMessage = error instanceof Error ? error.message : 'Unknown error'
            await safeAsync(
                () =>
                    this.db.updateById(componentName, recordId, {
                        upload_status: 'failed',
                        upload_error: errorMessage
                    }),
                'update record status to failed',
                logger
            )

            // Clean up: uploaded files and source file
            const pathToClean = basePath // Capture for closure
            const cleanupOps: Array<{ operation: () => Promise<unknown>; context: string }> = []
            if (pathToClean) {
                cleanupOps.push({
                    operation: () => this.storage.deleteByPrefix(pathToClean),
                    context: 'cleanup storage on upload error'
                })
            }
            if (presignedKey) {
                cleanupOps.push({
                    operation: () => this.storage.delete(presignedKey),
                    context: 'cleanup presigned ZIP on upload error'
                })
            } else if (tempFilePath) {
                cleanupOps.push({
                    operation: () => fs.unlink(tempFilePath),
                    context: 'cleanup temp file on upload error'
                })
            }
            await safeCleanup(cleanupOps, logger)

            throw error
        }
    }

    private async updateRecordStatus(id: number, tableName: string, status: UploadStatus): Promise<void> {
        await this.db.updateById(tableName, id, { upload_status: status })
    }
}
