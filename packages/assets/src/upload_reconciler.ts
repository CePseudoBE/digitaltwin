import type { StorageService } from '@digitaltwin/storage'
import type { DatabaseAdapter } from '@digitaltwin/database'
import { safeAsync, Logger } from '@digitaltwin/shared'

const logger = new Logger('UploadReconciler')

export interface ReconciliationResult {
    checked: number
    completed: number
    expired: number
    skipped: number
}

export interface UploadReconcilerOptions {
    intervalMs?: number
}

/**
 * Periodically reconciles pending presigned uploads.
 *
 * Checks all records with upload_status='pending' and presigned_key set:
 * - If presigned URL expired and file exists on S3 → mark completed
 * - If presigned URL expired and no file on S3 → mark expired
 * - If presigned URL not expired and file exists → mark completed (early confirm)
 * - If presigned URL not expired and no file → skip (still waiting)
 */
export class UploadReconciler {
    private db: DatabaseAdapter
    private storage: StorageService
    private intervalMs: number
    private timer: ReturnType<typeof setInterval> | null = null
    private tableNames: string[] = []

    constructor(db: DatabaseAdapter, storage: StorageService, options?: UploadReconcilerOptions) {
        this.db = db
        this.storage = storage
        this.intervalMs = options?.intervalMs ?? 5 * 60 * 1000 // 5 minutes default
    }

    /**
     * Register table names to reconcile.
     * Call this before start() to tell the reconciler which tables to check.
     */
    registerTables(names: string[]): void {
        for (const name of names) {
            if (!this.tableNames.includes(name)) {
                this.tableNames.push(name)
            }
        }
    }

    start(): void {
        if (this.timer) return
        if (this.tableNames.length === 0) {
            logger.info('No tables registered, upload reconciler not started')
            return
        }
        logger.info(`Starting upload reconciler (interval: ${this.intervalMs}ms, tables: ${this.tableNames.join(', ')})`)
        this.timer = setInterval(() => {
            safeAsync(() => this.reconcile(), 'upload reconciliation cycle', logger)
        }, this.intervalMs)
    }

    stop(): void {
        if (this.timer) {
            clearInterval(this.timer)
            this.timer = null
            logger.info('Upload reconciler stopped')
        }
    }

    /**
     * Run reconciliation across all registered tables.
     */
    async reconcile(): Promise<ReconciliationResult> {
        const totals: ReconciliationResult = {
            checked: 0,
            completed: 0,
            expired: 0,
            skipped: 0
        }

        if (!this.storage.supportsPresignedUrls()) {
            return totals
        }

        for (const tableName of this.tableNames) {
            const result = await this.reconcileTable(tableName)
            totals.checked += result.checked
            totals.completed += result.completed
            totals.expired += result.expired
            totals.skipped += result.skipped
        }

        if (totals.checked > 0) {
            logger.info(
                `Reconciliation totals: checked=${totals.checked}, completed=${totals.completed}, expired=${totals.expired}, skipped=${totals.skipped}`
            )
        }

        return totals
    }

    /**
     * Reconcile pending presigned uploads for a specific table.
     */
    async reconcileTable(tableName: string): Promise<ReconciliationResult> {
        const result: ReconciliationResult = {
            checked: 0,
            completed: 0,
            expired: 0,
            skipped: 0
        }

        if (!this.storage.supportsPresignedUrls()) {
            return result
        }

        try {
            // Find all pending records with a presigned_key
            const pendingRecords = await this.db.findByConditions(tableName, {
                upload_status: 'pending'
            })

            const now = new Date()

            for (const record of pendingRecords) {
                if (!record.presigned_key) continue

                result.checked++

                const isExpired = record.presigned_expires_at
                    ? new Date(record.presigned_expires_at) < now
                    : false

                try {
                    const existsResult = await this.storage.objectExists(record.presigned_key)

                    if (existsResult.exists) {
                        // File uploaded — mark completed
                        await this.db.updateById(tableName, record.id, {
                            upload_status: 'completed',
                            url: record.presigned_key
                        })
                        result.completed++
                        logger.info(`Reconciled record ${record.id}: completed (file found)`)
                    } else if (isExpired) {
                        // URL expired and no file — mark expired
                        await this.db.updateById(tableName, record.id, {
                            upload_status: 'expired'
                        })
                        result.expired++
                        logger.info(`Reconciled record ${record.id}: expired`)
                    } else {
                        // URL not expired, no file yet — skip
                        result.skipped++
                    }
                } catch (error) {
                    logger.warn(`Failed to reconcile record ${record.id}: ${error instanceof Error ? error.message : 'Unknown error'}`)
                    result.skipped++
                }
            }

            if (result.checked > 0) {
                logger.info(
                    `Reconciliation for ${tableName}: checked=${result.checked}, completed=${result.completed}, expired=${result.expired}, skipped=${result.skipped}`
                )
            }
        } catch (error) {
            logger.warn(`Failed to reconcile table ${tableName}: ${error instanceof Error ? error.message : 'Unknown error'}`)
        }

        return result
    }
}
