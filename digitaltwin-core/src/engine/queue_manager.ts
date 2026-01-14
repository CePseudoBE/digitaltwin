// src/engine/queue_manager.ts
import type { QueueOptions, ConnectionOptions } from 'bullmq'
import { Queue } from 'bullmq'

/**
 * Configuration options for the Queue Manager
 */
export interface QueueConfig {
    /** Number of workers for collectors (data collection) */
    collectorWorkers?: number
    /** Number of workers for harvesters (data processing) */
    harvesterWorkers?: number
    /** Redis connection configuration */
    redis?: ConnectionOptions
    /** Advanced options for each queue type */
    queueOptions?: {
        collectors?: Partial<QueueOptions>
        harvesters?: Partial<QueueOptions>
        priority?: Partial<QueueOptions>
        uploads?: Partial<QueueOptions>
    }
}

/**
 * Queue configuration constants
 */
const QUEUE_DEFAULTS = {
    REDIS: {
        host: 'localhost',
        port: 6379,
        maxRetriesPerRequest: null,
        enableReadyCheck: true,
        retryStrategy: (times: number) => Math.min(times * 50, 2000)
    },
    COLLECTORS: {
        name: 'dt-collectors',
        attempts: 3,
        backoffDelay: 2000,
        keepCompleted: 100,
        keepFailed: 50
    },
    HARVESTERS: {
        name: 'dt-harvesters',
        attempts: 5,
        backoffDelay: 5000,
        keepCompleted: 50,
        keepFailed: 100
    },
    PRIORITY: {
        name: 'dt-priority',
        attempts: 2,
        priority: 1
    },
    UPLOADS: {
        name: 'dt-uploads',
        attempts: 1, // No retries - temp file is deleted after first attempt
        backoffDelay: 10000,
        keepCompleted: 50,
        keepFailed: 100
    }
} as const

/**
 * Queue Manager - Manages BullMQ queues for different component types
 *
 * Handles three types of queues:
 * - Collector queue: High priority, fast execution for data collection
 * - Harvester queue: Medium priority, slower processing for data transformation
 * - Priority queue: Urgent/manual jobs with highest priority
 *
 * @example
 * ```typescript
 * const queueManager = new QueueManager({
 *   redis: { host: 'localhost', port: 6379 },
 *   collectorWorkers: 3,
 *   harvesterWorkers: 2
 * })
 *
 * await queueManager.close()
 * ```
 */
export class QueueManager {
    readonly collectorQueue: Queue
    readonly harvesterQueue: Queue
    readonly priorityQueue: Queue
    readonly uploadQueue: Queue

    /**
     * Creates a new Queue Manager instance
     * @param config - Queue configuration options
     */
    constructor(config: QueueConfig = {}) {
        const baseConnection = config.redis || QUEUE_DEFAULTS.REDIS

        this.collectorQueue = this.#createCollectorQueue(baseConnection, config.queueOptions?.collectors)
        this.harvesterQueue = this.#createHarvesterQueue(baseConnection, config.queueOptions?.harvesters)
        this.priorityQueue = this.#createPriorityQueue(baseConnection, config.queueOptions?.priority)
        this.uploadQueue = this.#createUploadQueue(baseConnection, config.queueOptions?.uploads)
    }

    /**
     * Creates collector queue with optimized settings for data collection
     * @private
     */
    #createCollectorQueue(connection: ConnectionOptions, options?: Partial<QueueOptions>): Queue {
        return new Queue(QUEUE_DEFAULTS.COLLECTORS.name, {
            connection,
            defaultJobOptions: {
                attempts: QUEUE_DEFAULTS.COLLECTORS.attempts,
                backoff: { type: 'exponential', delay: QUEUE_DEFAULTS.COLLECTORS.backoffDelay },
                removeOnComplete: { count: QUEUE_DEFAULTS.COLLECTORS.keepCompleted },
                removeOnFail: { count: QUEUE_DEFAULTS.COLLECTORS.keepFailed }
            },
            ...options
        })
    }

    /**
     * Creates harvester queue with settings optimized for data processing
     * @private
     */
    #createHarvesterQueue(connection: ConnectionOptions, options?: Partial<QueueOptions>): Queue {
        return new Queue(QUEUE_DEFAULTS.HARVESTERS.name, {
            connection,
            defaultJobOptions: {
                attempts: QUEUE_DEFAULTS.HARVESTERS.attempts,
                backoff: { type: 'exponential', delay: QUEUE_DEFAULTS.HARVESTERS.backoffDelay },
                removeOnComplete: { count: QUEUE_DEFAULTS.HARVESTERS.keepCompleted },
                removeOnFail: { count: QUEUE_DEFAULTS.HARVESTERS.keepFailed }
            },
            ...options
        })
    }

    /**
     * Creates priority queue for urgent/manual jobs
     * @private
     */
    #createPriorityQueue(connection: ConnectionOptions, options?: Partial<QueueOptions>): Queue {
        return new Queue(QUEUE_DEFAULTS.PRIORITY.name, {
            connection,
            defaultJobOptions: {
                priority: QUEUE_DEFAULTS.PRIORITY.priority,
                attempts: QUEUE_DEFAULTS.PRIORITY.attempts,
                removeOnComplete: true,
                removeOnFail: false
            },
            ...options
        })
    }

    /**
     * Creates upload queue for async file processing (tileset extraction, large uploads)
     * @private
     */
    #createUploadQueue(connection: ConnectionOptions, options?: Partial<QueueOptions>): Queue {
        return new Queue(QUEUE_DEFAULTS.UPLOADS.name, {
            connection,
            defaultJobOptions: {
                attempts: QUEUE_DEFAULTS.UPLOADS.attempts,
                backoff: { type: 'exponential', delay: QUEUE_DEFAULTS.UPLOADS.backoffDelay },
                removeOnComplete: { count: QUEUE_DEFAULTS.UPLOADS.keepCompleted },
                removeOnFail: { count: QUEUE_DEFAULTS.UPLOADS.keepFailed }
            },
            ...options
        })
    }

    /**
     * Closes all queues gracefully
     * @returns Promise that resolves when all queues are closed
     */
    async close(): Promise<void> {
        const closePromises: Promise<void>[] = []

        // Close all queues with timeout protection
        const queues = [this.collectorQueue, this.harvesterQueue, this.priorityQueue, this.uploadQueue]

        for (const queue of queues) {
            closePromises.push(
                Promise.race([
                    queue.close(),
                    new Promise<void>((_, reject) => setTimeout(() => reject(new Error('Queue close timeout')), 3000))
                ]).catch(async () => {
                    // Force close if timeout - try to access Redis connection directly
                    try {
                        const redisConnection = (queue as any).redisConnection
                        if (redisConnection && typeof redisConnection.disconnect === 'function') {
                            await redisConnection.disconnect()
                        }
                    } catch {
                        // Ignore forced cleanup errors
                    }
                })
            )
        }

        await Promise.all(closePromises)

        // Wait for connections to fully close
        await new Promise(resolve => setTimeout(resolve, 300))
    }

    /**
     * Gets statistics for all queues
     * @returns Object containing stats for each queue type
     */
    async getQueueStats() {
        const [collectorStats, harvesterStats, priorityStats, uploadStats] = await Promise.all([
            this.#getStats(this.collectorQueue),
            this.#getStats(this.harvesterQueue),
            this.#getStats(this.priorityQueue),
            this.#getStats(this.uploadQueue)
        ])

        return {
            collectors: collectorStats,
            harvesters: harvesterStats,
            priority: priorityStats,
            uploads: uploadStats
        }
    }

    /**
     * Gets statistics for a specific queue
     * @private
     */
    async #getStats(queue: Queue) {
        const [waiting, active, completed, failed] = await Promise.all([
            queue.getWaitingCount(),
            queue.getActiveCount(),
            queue.getCompletedCount(),
            queue.getFailedCount()
        ])

        return { waiting, active, completed, failed }
    }
}
