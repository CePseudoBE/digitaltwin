import { Worker, type Job } from 'bullmq'
import type { ConnectionOptions } from 'bullmq'
import type { StorageService } from '../storage/storage_service.js'
import type { DatabaseAdapter } from '../database/database_adapter.js'
import { extractAndStoreArchive } from '../utils/zip_utils.js'
import { safeAsync, safeCleanup } from '../utils/safe_async.js'
import { Logger } from '../utils/logger.js'
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
            throw new Error(`Unknown upload job type: ${(job.data as any).type}`)
        }
    }

    private async processTilesetUpload(job: Job<TilesetUploadJobData>): Promise<void> {
        const { recordId, tempFilePath, componentName } = job.data
        let basePath: string | null = null

        try {
            await this.updateRecordStatus(recordId, componentName, 'processing')
            await job.updateProgress(10)

            // Read ZIP file
            const zipBuffer = await fs.readFile(tempFilePath).catch(err => {
                throw new Error(`Failed to read temp file: ${err.message}`)
            })
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

            // Clean up temp file
            await safeAsync(() => fs.unlink(tempFilePath), 'cleanup temp file after upload', logger)
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

            // Clean up: uploaded files and temp file
            const pathToClean = basePath // Capture for closure
            await safeCleanup(
                [
                    ...(pathToClean
                        ? [
                              {
                                  operation: () => this.storage.deleteByPrefix(pathToClean),
                                  context: 'cleanup storage on upload error'
                              }
                          ]
                        : []),
                    { operation: () => fs.unlink(tempFilePath), context: 'cleanup temp file on upload error' }
                ],
                logger
            )

            throw error
        }
    }

    private async updateRecordStatus(id: number, tableName: string, status: UploadStatus): Promise<void> {
        await this.db.updateById(tableName, id, { upload_status: status })
    }
}
