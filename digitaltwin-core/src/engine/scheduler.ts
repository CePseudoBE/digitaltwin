// src/engine/scheduler.ts
import { Collector } from '../components/collector.js'
import { Harvester } from '../components/harvester.js'
import { Worker } from 'bullmq'
import type { QueueManager } from './queue_manager.js'
import { Logger, LogLevel } from '../utils/logger.js'
import { engineEventBus } from './events.js'
import debounce from 'lodash/debounce.js'
import type { HarvesterConfiguration } from '../components/types.js'

/**
 * Worker configuration constants
 */
const WORKER_CONFIG = {
    COLLECTOR: {
        concurrency: 5,
        limiter: { max: 10, duration: 60000 }
    },
    HARVESTER: {
        concurrency: 3,
        limiter: { max: 20, duration: 60000 }
    },
    PRIORITY: {
        concurrency: 1 // One priority task at a time
    },
    SINGLE_QUEUE: {
        concurrency: (componentCount: number) => Math.max(componentCount, 1)
    }
} as const

/**
 * Default job options for event-triggered harvesters
 */
const EVENT_JOB_OPTIONS = {
    removeOnComplete: true,
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 }
} as const

/**
 * Component Scheduler - Manages scheduling and execution of collectors and harvesters
 *
 * The scheduler supports two modes:
 * - Multi-queue mode: Separate queues for collectors, harvesters, and priority jobs
 * - Single-queue mode: All components share one queue (legacy mode)
 *
 * @class ComponentScheduler
 */
class ComponentScheduler {
    private readonly components: Array<Collector | Harvester>
    private readonly queueManager: QueueManager
    private readonly multiQueue: boolean
    private readonly logger: Logger
    private readonly componentMap: Record<string, Collector | Harvester> = {}
    private readonly debouncedTriggers: Record<string, (...args: any[]) => void> = {}

    /**
     * Creates a new Component Scheduler instance
     * @param components - Array of components to schedule
     * @param queueManager - Queue manager instance
     * @param multiQueue - Whether to use multi-queue mode
     * @param logLevel - Log level for the scheduler (optional)
     */
    constructor(
        components: Array<Collector | Harvester>,
        queueManager: QueueManager,
        multiQueue: boolean = true,
        logLevel?: LogLevel
    ) {
        this.components = components
        this.queueManager = queueManager
        this.multiQueue = multiQueue
        this.logger = new Logger(
            'DigitalTwin',
            logLevel ?? (process.env.NODE_ENV === 'test' ? LogLevel.SILENT : LogLevel.INFO)
        )

        this.#buildComponentMap()
    }

    /**
     * Schedules all components and creates workers
     * @returns Array of created workers
     */
    async schedule(): Promise<Worker[]> {
        this.#setupEventListeners()

        if (this.multiQueue) {
            return this.#scheduleMultiQueue()
        } else {
            return this.#scheduleSingleQueue()
        }
    }

    /**
     * Builds a map of component names to component instances
     * @private
     */
    #buildComponentMap(): void {
        for (const comp of this.components) {
            const config = comp.getConfiguration()
            this.componentMap[config.name] = comp
        }
    }

    /**
     * Sets up event listeners for harvesters with on-source trigger
     * @private
     */
    #setupEventListeners(): void {
        this.#setupHarvesterTriggers()
        this.#setupCollectorEventListener()
    }

    /**
     * Creates debounced trigger functions for event-driven harvesters
     * @private
     */
    #setupHarvesterTriggers(): void {
        for (const comp of this.components) {
            if (!(comp instanceof Harvester)) continue

            const config = comp.getConfiguration()
            if (!this.#shouldSetupEventTrigger(config)) continue

            const triggerFunction = this.#createTriggerFunction(config)
            const debounceMs = config.debounceMs || 1000
            this.debouncedTriggers[config.name] = debounce(triggerFunction, debounceMs)
        }
    }

    /**
     * Checks if a harvester should have event trigger setup
     * @private
     */
    #shouldSetupEventTrigger(config: HarvesterConfiguration): boolean {
        return config.triggerMode === 'on-source' || config.triggerMode === 'both'
    }

    /**
     * Creates a trigger function for a harvester
     * @private
     */
    #createTriggerFunction(config: HarvesterConfiguration): () => Promise<void> {
        return async () => {
            const queue = this.multiQueue ? this.queueManager.harvesterQueue : this.queueManager.collectorQueue

            await queue.add(
                config.name,
                {
                    type: 'harvester',
                    triggeredBy: 'source-event',
                    source: config.source
                },
                EVENT_JOB_OPTIONS
            )

            this.logger.debug(`Triggered harvester ${config.name} from source event`)
        }
    }

    /**
     * Sets up listener for collector completion events
     * @private
     */
    #setupCollectorEventListener(): void {
        engineEventBus.on('component:event', async event => {
            if (event.type !== 'collector:completed') return

            this.logger.debug(`Received collector:completed event from ${event.componentName}`)
            try {
                await this.#triggerDependentHarvesters(event.componentName)
            } catch (error) {
                this.logger.error(`Failed to trigger harvesters for ${event.componentName}: ${error instanceof Error ? error.message : String(error)}`, {
                    componentName: event.componentName,
                    stack: error instanceof Error ? error.stack : undefined
                })
            }
        })
    }

    /**
     * Triggers harvesters that depend on a completed collector
     * @private
     */
    async #triggerDependentHarvesters(collectorName: string): Promise<void> {
        for (const comp of this.components) {
            if (!(comp instanceof Harvester)) continue

            const config = comp.getConfiguration()
            if (config.source === collectorName && this.debouncedTriggers[config.name]) {
                this.logger.debug(`Triggering harvester "${config.name}" from "${collectorName}"`)
                this.debouncedTriggers[config.name]()
            }
        }
    }

    /**
     * Schedules components in multi-queue mode
     * @private
     */
    async #scheduleMultiQueue(): Promise<Worker[]> {
        await this.#scheduleCollectors()
        await this.#scheduleHarvesters()

        return [this.#createCollectorWorker(), this.#createHarvesterWorker(), this.#createPriorityWorker()]
    }

    /**
     * Schedules all collectors in multi-queue mode
     * @private
     */
    async #scheduleCollectors(): Promise<void> {
        const collectors = this.components.filter((comp): comp is Collector => comp instanceof Collector)

        for (const collector of collectors) {
            const config = collector.getConfiguration()
            const schedule = collector.getSchedule()

            await this.queueManager.collectorQueue.upsertJobScheduler(
                config.name,
                { pattern: schedule },
                {
                    name: config.name,
                    data: { type: 'collector', triggeredBy: 'schedule' }
                }
            )

            this.logger.info(`Collector "${config.name}" scheduled: ${schedule}`)
        }
    }

    /**
     * Schedules harvesters (only those not exclusively on-source) in multi-queue mode
     * @private
     */
    async #scheduleHarvesters(): Promise<void> {
        const harvesters = this.components.filter((comp): comp is Harvester => comp instanceof Harvester)

        for (const harvester of harvesters) {
            const config = harvester.getConfiguration()
            const schedule = harvester.getSchedule()

            if (schedule && config.triggerMode !== 'on-source') {
                await this.queueManager.harvesterQueue.upsertJobScheduler(
                    config.name,
                    { pattern: schedule },
                    {
                        name: config.name,
                        data: { type: 'harvester', triggeredBy: 'schedule' }
                    }
                )

                this.logger.info(`Harvester "${config.name}" scheduled: ${schedule}`)
            }
        }
    }

    /**
     * Creates collector worker for multi-queue mode
     * @private
     */
    #createCollectorWorker(): Worker {
        return new Worker('dt-collectors', async job => this.#processCollectorJob(job), {
            connection: this.queueManager.collectorQueue.opts.connection,
            concurrency: WORKER_CONFIG.COLLECTOR.concurrency,
            limiter: WORKER_CONFIG.COLLECTOR.limiter
        })
    }

    /**
     * Creates harvester worker for multi-queue mode
     * @private
     */
    #createHarvesterWorker(): Worker {
        return new Worker('dt-harvesters', async job => this.#processHarvesterJob(job), {
            connection: this.queueManager.harvesterQueue.opts.connection,
            concurrency: WORKER_CONFIG.HARVESTER.concurrency,
            limiter: WORKER_CONFIG.HARVESTER.limiter
        })
    }

    /**
     * Creates priority worker for multi-queue mode
     * @private
     */
    #createPriorityWorker(): Worker {
        return new Worker('dt-priority', async job => this.#processPriorityJob(job), {
            connection: this.queueManager.priorityQueue.opts.connection,
            concurrency: WORKER_CONFIG.PRIORITY.concurrency
        })
    }

    /**
     * Processes a collector job
     * @private
     */
    async #processCollectorJob(job: any): Promise<any> {
        const comp = this.componentMap[job.name] as Collector
        if (!comp) return

        this.logger.debug(`Running collector: ${job.name}`)

        try {
            const result = await comp.run()

            return {
                success: true,
                bytes: result?.length || 0,
                timestamp: new Date().toISOString()
            }
        } catch (error) {
            this.logger.error(`Collector ${job.name} failed:`, error)
            throw error
        }
    }

    /**
     * Processes a harvester job
     * @private
     */
    async #processHarvesterJob(job: any): Promise<any> {
        const comp = this.componentMap[job.name] as Harvester
        if (!comp) return

        this.logger.debug(`Running harvester: ${job.name} (${job.data.triggeredBy})`)

        try {
            const result = await comp.run()

            // Emit harvester completion event
            engineEventBus.emit('component:event', {
                type: 'harvester:completed',
                componentName: comp.getConfiguration().name,
                timestamp: new Date(),
                data: { success: result }
            })

            return {
                success: result,
                timestamp: new Date().toISOString()
            }
        } catch (error) {
            this.logger.error(`Harvester ${job.name} failed:`, error)
            throw error
        }
    }

    /**
     * Processes a priority job
     * @private
     */
    async #processPriorityJob(job: any): Promise<any> {
        const comp = this.componentMap[job.name]
        if (!comp) return

        this.logger.debug(`Running priority job: ${job.name}`)
        const result = await comp.run()
        return { success: true, result }
    }

    /**
     * Schedules components in single-queue mode (legacy)
     * @private
     */
    async #scheduleSingleQueue(): Promise<Worker[]> {
        this.logger.warn('Single-queue mode (not recommended for production)')

        const singleQueue = this.queueManager.collectorQueue
        await this.#scheduleAllComponentsInSingleQueue(singleQueue)

        const worker = new Worker(singleQueue.name, async job => this.#processSingleQueueJob(job), {
            connection: singleQueue.opts.connection,
            concurrency: WORKER_CONFIG.SINGLE_QUEUE.concurrency(this.components.length)
        })

        return [worker]
    }

    /**
     * Schedules all components in single queue
     * @private
     */
    async #scheduleAllComponentsInSingleQueue(singleQueue: any): Promise<void> {
        for (const comp of this.components) {
            const config = comp.getConfiguration()
            const schedule = comp.getSchedule()

            const shouldSchedule =
                comp instanceof Harvester
                    ? schedule && comp.getConfiguration().triggerMode !== 'on-source'
                    : schedule !== null

            if (shouldSchedule) {
                await singleQueue.upsertJobScheduler(
                    config.name,
                    { pattern: schedule },
                    {
                        name: config.name,
                        data: {
                            type: comp instanceof Collector ? 'collector' : 'harvester',
                            triggeredBy: 'schedule'
                        }
                    }
                )
            }
        }
    }

    /**
     * Processes a job in single-queue mode
     * @private
     */
    async #processSingleQueueJob(job: any): Promise<any> {
        const comp = this.componentMap[job.name]
        if (!comp) return

        this.logger.debug(`Running ${job.data.type}: ${job.name}`)
        const result = await comp.run()
        return { success: true, result }
    }
}

/**
 * Schedules components for execution using the queue manager
 *
 * This function creates a scheduler instance and sets up:
 * - Job scheduling based on component schedules
 * - Event-driven harvester triggers
 * - Workers for processing jobs
 *
 * @param components - Array of components to schedule
 * @param queueManager - Queue manager instance
 * @param multiQueue - Whether to use multi-queue mode (default: true)
 * @param logLevel - Log level for the scheduler (optional)
 * @returns Promise that resolves to array of created workers
 *
 * @example
 * ```typescript
 * const workers = await scheduleComponents(
 *   [collector1, harvester1],
 *   queueManager,
 *   true
 * )
 * ```
 */
export async function scheduleComponents(
    components: Array<Collector | Harvester>,
    queueManager: QueueManager,
    multiQueue: boolean = true,
    logLevel?: LogLevel
): Promise<Worker[]> {
    const scheduler = new ComponentScheduler(components, queueManager, multiQueue, logLevel)
    return scheduler.schedule()
}
