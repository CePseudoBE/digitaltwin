import type { Collector } from '../components/collector.js'
import type { Harvester } from '../components/harvester.js'
import type { Handler } from '../components/handler.js'
import type { AssetsManager } from '../components/assets_manager.js'
import type { CustomTableManager } from '../components/custom_table_manager.js'
import type { StorageService } from '../storage/storage_service.js'
import type { DatabaseAdapter } from '../database/database_adapter.js'
import type { Router as ExpressRouter } from 'ultimate-express'
import express from 'ultimate-express'
import multer from 'multer'
import type { ConnectionOptions, Worker } from 'bullmq'
import fs from 'fs/promises'
import cors from 'cors'

import { initializeComponents, initializeAssetsManagers } from './initializer.js'
import {
    type AnyComponent,
    type ComponentTypeName,
    type LoadedComponents,
    detectComponentType,
    isCollector,
    isHarvester,
    isHandler,
    isAssetsManager,
    isCustomTableManager
} from './component_types.js'
import { UserService } from '../auth/user_service.js'
import { exposeEndpoints } from './endpoints.js'
import { scheduleComponents } from './scheduler.js'
import { LogLevel } from '../utils/logger.js'
import type { QueueConfig } from './queue_manager.js'
import { QueueManager } from './queue_manager.js'
import { UploadProcessor } from './upload_processor.js'
import { engineEventBus } from './events.js'
import { isAsyncUploadable } from '../components/async_upload.js'
import {
    HealthChecker,
    createDatabaseCheck,
    createRedisCheck,
    createStorageCheck,
    livenessCheck,
    type HealthCheckFn
} from './health.js'

/**
 * Result of component validation
 */
export interface ComponentValidationResult {
    /** Component name */
    name: string
    /** Component type */
    type: 'collector' | 'harvester' | 'handler' | 'assets_manager' | 'custom_table_manager'
    /** Validation status */
    valid: boolean
    /** Validation errors if any */
    errors: string[]
    /** Validation warnings if any */
    warnings: string[]
}

/**
 * Overall validation result
 */
export interface ValidationResult {
    /** Overall validation status */
    valid: boolean
    /** Individual component results */
    components: ComponentValidationResult[]
    /** Engine-level errors */
    engineErrors: string[]
    /** Summary statistics */
    summary: {
        total: number
        valid: number
        invalid: number
        warnings: number
    }
}

/**
 * Configuration options for the Digital Twin Engine
 *
 * @interface EngineOptions
 * @example
 * ```typescript
 * const options: EngineOptions = {
 *   storage: storageService,
 *   database: databaseAdapter,
 *   collectors: [myCollector],
 *   harvesters: [myHarvester],
 *   handlers: [myHandler],
 *   server: { port: 3000, host: 'localhost' },
 *   queues: {
 *     multiQueue: true,
 *     workers: { collectors: 2, harvesters: 1 }
 *   }
 * }
 * ```
 */
export interface EngineOptions {
    /** Array of data collectors to register with the engine */
    collectors?: Collector[]
    /** Array of data harvesters to register with the engine */
    harvesters?: Harvester[]
    /** Array of request handlers to register with the engine */
    handlers?: Handler[]
    /** Array of assets managers to register with the engine */
    assetsManagers?: AssetsManager[]
    /** Array of custom table managers to register with the engine */
    customTableManagers?: CustomTableManager[]
    /** Storage service instance for persisting data (required) */
    storage: StorageService
    /** Database adapter instance for data operations (required) */
    database: DatabaseAdapter
    /** Redis connection options for queue management */
    redis?: ConnectionOptions
    /** Queue configuration options */
    queues?: {
        /** Enable multi-queue mode (default: true) */
        multiQueue?: boolean
        /** Worker configuration for different component types */
        workers?: {
            /** Number of collector workers (default: 1) */
            collectors?: number
            /** Number of harvester workers (default: 1) */
            harvesters?: number
        }
        /** Additional queue configuration options */
        options?: QueueConfig['queueOptions']
    }
    /** HTTP server configuration */
    server?: {
        /** Server port (default: 3000) */
        port: number
        /** Server host (default: '0.0.0.0') */
        host?: string
    }
    /** Logging configuration */
    logging?: {
        /** Log level (default: LogLevel.INFO) */
        level: LogLevel
        /** Log format (default: 'text') */
        format?: 'json' | 'text'
    }
    /** Dry run mode - validate configuration without persisting data (default: false) */
    dryRun?: boolean
    /**
     * Enable automatic schema migration for existing tables (default: true)
     *
     * When enabled, the engine will automatically add missing columns with safe defaults
     * to existing tables at startup. Only safe operations are performed:
     * - Adding columns with DEFAULT values
     * - Adding nullable columns
     * - Adding indexes
     *
     * Set to false to require manual migrations via SQL scripts.
     */
    autoMigration?: boolean
}

/**
 * Digital Twin Engine - Core orchestrator for collectors, harvesters, and handlers
 *
 * The engine manages the lifecycle of all components, sets up queues for processing,
 * exposes HTTP endpoints, and handles the overall coordination of the digital twin system.
 *
 * @class DigitalTwinEngine
 * @example
 * ```TypeScript
 * import { DigitalTwinEngine } from './digital_twin_engine.js'
 * import { StorageServiceFactory } from '../storage/storage_factory.js'
 * import { KnexDatabaseAdapter } from '../database/adapters/knex_database_adapter.js'
 *
 * const storage = StorageServiceFactory.create()
 * const database = new KnexDatabaseAdapter({ client: 'sqlite3', connection: ':memory:' }, storage)
 *
 * const engine = new DigitalTwinEngine({
 *   storage,
 *   database,
 *   collectors: [myCollector],
 *   server: { port: 3000 }
 * })
 *
 * await engine.start()
 * ```
 */
export class DigitalTwinEngine {
    readonly #collectors: Collector[]
    readonly #harvesters: Harvester[]
    readonly #handlers: Handler[]
    readonly #assetsManagers: AssetsManager[]
    readonly #customTableManagers: CustomTableManager[]
    readonly #storage: StorageService
    readonly #database: DatabaseAdapter
    readonly #app: ReturnType<typeof express>
    readonly #router: ExpressRouter
    readonly #options: EngineOptions
    readonly #queueManager: QueueManager | null
    readonly #uploadProcessor: UploadProcessor | null
    /** uWebSockets.js TemplatedApp - has close() method to shut down all connections */
    #server?: { close(): unknown }
    #workers: Worker[] = []
    #isShuttingDown = false
    #shutdownTimeout = 30000
    readonly #healthChecker = new HealthChecker()

    // Mutable arrays for dynamically registered components
    readonly #dynamicCollectors: Collector[] = []
    readonly #dynamicHarvesters: Harvester[] = []
    readonly #dynamicHandlers: Handler[] = []
    readonly #dynamicAssetsManagers: AssetsManager[] = []
    readonly #dynamicCustomTableManagers: CustomTableManager[] = []

    /** Get all collectors (from constructor + register()) */
    get #allCollectors(): Collector[] {
        return [...this.#collectors, ...this.#dynamicCollectors]
    }

    /** Get all harvesters (from constructor + register()) */
    get #allHarvesters(): Harvester[] {
        return [...this.#harvesters, ...this.#dynamicHarvesters]
    }

    /** Get all handlers (from constructor + register()) */
    get #allHandlers(): Handler[] {
        return [...this.#handlers, ...this.#dynamicHandlers]
    }

    /** Get all assets managers (from constructor + register()) */
    get #allAssetsManagers(): AssetsManager[] {
        return [...this.#assetsManagers, ...this.#dynamicAssetsManagers]
    }

    /** Get all custom table managers (from constructor + register()) */
    get #allCustomTableManagers(): CustomTableManager[] {
        return [...this.#customTableManagers, ...this.#dynamicCustomTableManagers]
    }

    /** Get all active components (collectors and harvesters) */
    get #activeComponents(): (Collector | Harvester)[] {
        return [...this.#allCollectors, ...this.#allHarvesters]
    }

    /** Get all components (collectors + harvesters + handlers + assetsManagers + customTableManagers) */
    get #allComponents(): (Collector | Harvester | Handler | AssetsManager | CustomTableManager)[] {
        return [
            ...this.#allCollectors,
            ...this.#allHarvesters,
            ...this.#allHandlers,
            ...this.#allAssetsManagers,
            ...this.#allCustomTableManagers
        ]
    }

    /** Check if multi-queue mode is enabled */
    get #isMultiQueueEnabled(): boolean {
        return this.#options.queues?.multiQueue ?? true
    }

    /**
     * Creates a new Digital Twin Engine instance
     *
     * @param {EngineOptions} options - Configuration options for the engine
     * @throws {Error} If required options (storage, database) are missing
     *
     * @example
     * ```TypeScript
     * const engine = new DigitalTwinEngine({
     *   storage: myStorageService,
     *   database: myDatabaseAdapter,
     *   collectors: [collector1, collector2],
     *   server: { port: 4000, host: 'localhost' }
     * })
     * ```
     */
    constructor(options: EngineOptions) {
        this.#options = this.#applyDefaults(options)
        this.#collectors = this.#options.collectors ?? []
        this.#harvesters = this.#options.harvesters ?? []
        this.#handlers = this.#options.handlers ?? []
        this.#assetsManagers = this.#options.assetsManagers ?? []
        this.#customTableManagers = this.#options.customTableManagers ?? []
        this.#storage = this.#options.storage
        this.#database = this.#options.database
        this.#app = express()
        this.#router = express.Router()
        this.#queueManager = this.#createQueueManager()
        this.#uploadProcessor = this.#createUploadProcessor()
    }

    #createUploadProcessor(): UploadProcessor | null {
        // Only create upload processor if we have a queue manager (which means Redis is available)
        if (!this.#queueManager) {
            return null
        }
        return new UploadProcessor(this.#storage, this.#database)
    }

    #applyDefaults(options: EngineOptions): EngineOptions {
        return {
            collectors: [],
            harvesters: [],
            handlers: [],
            assetsManagers: [],
            customTableManagers: [],
            server: {
                port: 3000,
                host: '0.0.0.0',
                ...options.server
            },
            queues: {
                multiQueue: true,
                workers: {
                    collectors: 1,
                    harvesters: 1,
                    ...options.queues?.workers
                },
                ...options.queues
            },
            logging: {
                level: LogLevel.INFO,
                format: 'text',
                ...options.logging
            },
            dryRun: false,
            ...options
        }
    }

    #createQueueManager(): QueueManager | null {
        // Create queue manager if we have collectors, harvesters, OR assets managers that may need async uploads
        // Note: At construction time, only constructor-provided components are available
        // Dynamic components registered via register() will be handled at start() time
        const hasActiveComponents = this.#collectors.length > 0 || this.#harvesters.length > 0
        const hasAssetsManagers = this.#assetsManagers.length > 0

        if (!hasActiveComponents && !hasAssetsManagers) {
            return null
        }

        return new QueueManager({
            redis: this.#options.redis,
            collectorWorkers: this.#options.queues?.workers?.collectors,
            harvesterWorkers: this.#options.queues?.workers?.harvesters,
            queueOptions: this.#options.queues?.options
        })
    }

    /**
     * Initialize store managers and create their database tables
     * @private
     */
    async #initializeCustomTableManagers(): Promise<void> {
        for (const customTableManager of this.#customTableManagers) {
            // Inject dependencies
            customTableManager.setDependencies(this.#database)

            // Initialize the table with custom columns
            await customTableManager.initializeTable()
        }
    }

    /**
     * Ensure temporary upload directory exists
     * @private
     */
    async #ensureTempUploadDir(): Promise<void> {
        const tempDir = process.env.TEMP_UPLOAD_DIR || '/tmp/digitaltwin-uploads'
        try {
            await fs.mkdir(tempDir, { recursive: true })
        } catch (error) {
            throw new Error(`Failed to create temp upload directory ${tempDir}: ${error}`)
        }
    }

    /**
     * Setup monitoring endpoints for queue statistics and health checks
     * @private
     */
    #setupMonitoringEndpoints(): void {
        // Register default health checks
        this.#healthChecker.registerCheck('database', createDatabaseCheck(this.#database))

        if (this.#queueManager) {
            this.#healthChecker.registerCheck('redis', createRedisCheck(this.#queueManager))
        }

        this.#healthChecker.registerCheck('storage', createStorageCheck(this.#storage))

        // Set component counts (includes both constructor and dynamically registered components)
        this.#healthChecker.setComponentCounts({
            collectors: this.#allCollectors.length,
            harvesters: this.#allHarvesters.length,
            handlers: this.#allHandlers.length,
            assetsManagers: this.#allAssetsManagers.length
        })

        // Liveness probe - shallow check, always returns ok if process is running
        this.#router.get('/api/health/live', (req, res) => {
            res.status(200).json(livenessCheck())
        })

        // Readiness probe - deep check with database and redis verification
        this.#router.get('/api/health/ready', async (req, res) => {
            const health = await this.#healthChecker.performCheck()
            const statusCode = health.status === 'unhealthy' ? 503 : 200
            res.status(statusCode).json(health)
        })

        // Full health check endpoint (detailed)
        this.#router.get('/api/health', async (req, res) => {
            const health = await this.#healthChecker.performCheck()
            res.json(health)
        })

        // Queue statistics endpoint
        this.#router.get('/api/queues/stats', async (req, res) => {
            if (this.#queueManager) {
                const stats = await this.#queueManager.getQueueStats()
                res.json(stats)
            } else {
                res.json({
                    collectors: { status: 'No collectors configured' },
                    harvesters: { status: 'No harvesters configured' }
                })
            }
        })
    }

    /**
     * Starts the Digital Twin Engine
     *
     * This method:
     * 1. Initializes all registered components (collectors, harvesters, handlers)
     * 2. Set up HTTP endpoints for component access
     * 3. Configures and starts background job queues
     * 4. Starts the HTTP server
     * 5. Exposes queue monitoring endpoints
     *
     * @async
     * @returns {Promise<void>}
     *
     * @example
     * ```TypeScript
     * await engine.start()
     * console.log('Engine is running!')
     * ```
     */
    async start(): Promise<void> {
        const isDryRun = this.#options.dryRun ?? false

        if (isDryRun) {
            // In dry run, just validate everything without creating tables
            const validationResult = await this.validateConfiguration()

            if (!validationResult.valid) {
                throw new Error(`Validation failed:\n${validationResult.engineErrors.join('\n')}`)
            }
            return
        }

        // Normal startup - initialize user management tables first
        const userService = new UserService(this.#database)
        await userService.initializeTables()

        // Get autoMigration setting (default: true)
        const autoMigration = this.#options.autoMigration ?? true

        // Initialize components and create tables if needed
        await initializeComponents(this.#activeComponents, this.#database, this.#storage, autoMigration)

        // Initialize assets managers and create their tables if needed
        await initializeAssetsManagers(this.#assetsManagers, this.#database, this.#storage, autoMigration)

        // Initialize store managers and create their tables if needed
        await this.#initializeCustomTableManagers()

        // Initialize handlers (inject dependencies if needed)
        for (const handler of this.#handlers) {
            if ('setDependencies' in handler && typeof handler.setDependencies === 'function') {
                handler.setDependencies(this.#database, this.#storage)
            }
            // If it's a GlobalAssetsHandler, inject the AssetsManager instances
            if ('setAssetsManagers' in handler && typeof handler.setAssetsManagers === 'function') {
                handler.setAssetsManagers(this.#assetsManagers)
            }
        }

        // Inject upload queue to components that support async uploads
        if (this.#queueManager) {
            for (const manager of this.#allAssetsManagers) {
                if (isAsyncUploadable(manager)) {
                    manager.setUploadQueue(this.#queueManager.uploadQueue)
                }
            }
        }

        // Start upload processor worker (for async file processing)
        // Uses same Redis config as QueueManager (defaults to localhost:6379 if not specified)
        if (this.#uploadProcessor) {
            const redisConfig = this.#options.redis || {
                host: 'localhost',
                port: 6379,
                maxRetriesPerRequest: null
            }
            this.#uploadProcessor.start(redisConfig)
        }

        await exposeEndpoints(this.#router, this.#allComponents)

        // Setup component scheduling with queue manager (only if we have active components)
        if (this.#activeComponents.length > 0 && this.#queueManager) {
            this.#workers = await scheduleComponents(
                this.#activeComponents,
                this.#queueManager,
                this.#isMultiQueueEnabled
            )
        }

        this.#setupMonitoringEndpoints()

        // Ensure temporary upload directory exists
        await this.#ensureTempUploadDir()

        // Enable CORS for cross-origin requests from frontend applications
        this.#app.use(
            cors({
                origin: process.env.CORS_ORIGIN || true, // Allow all origins by default, configure in production
                methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
                allowedHeaders: ['Content-Type', 'Authorization'],
                credentials: true // Allow cookies/credentials
            })
        )

        // Configure Express middlewares for body parsing - no limits for large files
        this.#app.use(express.json({ limit: '10gb' }))
        this.#app.use(express.urlencoded({ extended: true, limit: '10gb' }))

        // Add multipart/form-data support for file uploads with disk storage for large files
        const upload = multer({
            storage: multer.diskStorage({
                destination: (req, file, cb) => {
                    // Use temporary directory, will be cleaned up after processing
                    const tempDir = process.env.TEMP_UPLOAD_DIR || '/tmp/digitaltwin-uploads'
                    cb(null, tempDir)
                },
                filename: (req, file, cb) => {
                    // Generate unique filename to avoid conflicts
                    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9)
                    cb(null, file.fieldname + '-' + uniqueSuffix + '-' + file.originalname)
                }
            }),
            limits: {
                // Remove file size limit to allow large files (10GB+)
                files: 1, // Only one file per request for safety
                parts: 10, // Limit form parts
                headerPairs: 2000 // Limit header pairs
            }
        })
        this.#app.use(upload.single('file') as any)

        this.#app.use(this.#router)

        const { port, host = '0.0.0.0' } = this.#options.server ?? {
            port: 3000,
            host: '0.0.0.0'
        }

        // Wait for server to be ready
        // Note: ultimate-express types say (host, port, callback) but implementation accepts (port, host, callback)
        // The implementation internally reorders to (host, port) for uWebSockets.js
        // Using type assertion to work around this types bug in ultimate-express
        await new Promise<void>(resolve => {
            const app = this.#app as unknown as {
                listen(port: number, host: string, callback: () => void): { close(): unknown }
            }
            this.#server = app.listen(port, host, () => {
                resolve()
            })
        })

        // Note: uWebSockets.js (used by ultimate-express) handles timeouts differently than Node.js http.Server:
        // - HTTP idle timeout is 10 seconds (only when connection is inactive)
        // - During active data transfer (file uploads), the connection stays open
        // - Properties like timeout, keepAliveTimeout, headersTimeout don't exist on TemplatedApp
        // For large file uploads, this should work fine as the connection remains active during transfer.
    }

    /**
     * Get the server port
     *
     * @returns {number | undefined} The server port or undefined if not started
     *
     * @example
     * ```TypeScript
     * const port = engine.getPort()
     * console.log(`Server running on port ${port}`)
     * ```
     */
    getPort(): number | undefined {
        if (!this.#server) return undefined
        // ultimate-express stores port on the app instance
        // Use type assertion to access the port property
        const app = this.#app as unknown as { port?: number }
        return app.port ?? this.#options.server?.port
    }

    /**
     * Registers a single component with automatic type detection.
     *
     * The engine automatically detects the component type based on its class
     * and adds it to the appropriate internal collection.
     *
     * @param component - Component instance to register
     * @returns The engine instance for method chaining
     * @throws Error if component type cannot be determined or is already registered
     *
     * @example
     * ```typescript
     * const engine = new DigitalTwinEngine({ storage, database })
     *
     * engine
     *   .register(new WeatherCollector())
     *   .register(new TrafficAnalysisHarvester())
     *   .register(new ApiHandler())
     *   .register(new GLTFAssetsManager())
     *
     * await engine.start()
     * ```
     */
    register(component: AnyComponent): this {
        const type = detectComponentType(component)
        const config = component.getConfiguration()

        // Check for duplicate registration
        if (this.#isComponentRegistered(config.name, type)) {
            throw new Error(
                `Component "${config.name}" of type "${type}" is already registered. ` +
                    'Each component must have a unique name within its type.'
            )
        }

        switch (type) {
            case 'collector':
                if (isCollector(component)) {
                    this.#dynamicCollectors.push(component)
                }
                break
            case 'harvester':
                if (isHarvester(component)) {
                    this.#dynamicHarvesters.push(component)
                }
                break
            case 'handler':
                if (isHandler(component)) {
                    this.#dynamicHandlers.push(component)
                }
                break
            case 'assets_manager':
                if (isAssetsManager(component)) {
                    this.#dynamicAssetsManagers.push(component)
                }
                break
            case 'custom_table_manager':
                if (isCustomTableManager(component)) {
                    this.#dynamicCustomTableManagers.push(component)
                }
                break
        }

        return this
    }

    /**
     * Registers multiple components at once with automatic type detection.
     *
     * Useful for registering all components from a module or when loading
     * components dynamically.
     *
     * @param components - Array of component instances to register
     * @returns The engine instance for method chaining
     * @throws Error if any component type cannot be determined or is duplicate
     *
     * @example
     * ```typescript
     * const engine = new DigitalTwinEngine({ storage, database })
     *
     * engine.registerAll([
     *   new WeatherCollector(),
     *   new TrafficCollector(),
     *   new AnalysisHarvester(),
     *   new ApiHandler()
     * ])
     *
     * await engine.start()
     * ```
     */
    registerAll(components: AnyComponent[]): this {
        for (const component of components) {
            this.register(component)
        }
        return this
    }

    /**
     * Registers components with explicit type specification.
     *
     * Provides full type safety at compile time. Use this method when you
     * have pre-sorted components from auto-discovery or want explicit control.
     *
     * @param components - Object with typed component arrays
     * @returns The engine instance for method chaining
     *
     * @example
     * ```typescript
     * const loaded = await loadComponents('./src/components')
     *
     * engine.registerComponents({
     *   collectors: loaded.collectors,
     *   harvesters: loaded.harvesters,
     *   handlers: loaded.handlers,
     *   assetsManagers: loaded.assetsManagers,
     *   customTableManagers: loaded.customTableManagers
     * })
     * ```
     */
    registerComponents(components: Partial<LoadedComponents>): this {
        if (components.collectors) {
            this.#dynamicCollectors.push(...components.collectors)
        }
        if (components.harvesters) {
            this.#dynamicHarvesters.push(...components.harvesters)
        }
        if (components.handlers) {
            this.#dynamicHandlers.push(...components.handlers)
        }
        if (components.assetsManagers) {
            this.#dynamicAssetsManagers.push(...components.assetsManagers)
        }
        if (components.customTableManagers) {
            this.#dynamicCustomTableManagers.push(...components.customTableManagers)
        }
        return this
    }

    /**
     * Checks if a component with the given name is already registered.
     */
    #isComponentRegistered(name: string, type: ComponentTypeName): boolean {
        const allComponents = this.#getAllComponentsOfType(type)
        return allComponents.some(c => c.getConfiguration().name === name)
    }

    /**
     * Gets all components of a specific type (both from constructor and register()).
     */
    #getAllComponentsOfType(type: ComponentTypeName): AnyComponent[] {
        switch (type) {
            case 'collector':
                return this.#allCollectors
            case 'harvester':
                return this.#allHarvesters
            case 'handler':
                return this.#allHandlers
            case 'assets_manager':
                return this.#allAssetsManagers
            case 'custom_table_manager':
                return this.#allCustomTableManagers
        }
    }

    /**
     * Configure the shutdown timeout (in ms)
     * @param timeout Timeout in milliseconds (default: 30000)
     */
    setShutdownTimeout(timeout: number): void {
        this.#shutdownTimeout = timeout
    }

    /**
     * Check if the engine is currently shutting down
     * @returns true if shutdown is in progress
     */
    isShuttingDown(): boolean {
        return this.#isShuttingDown
    }

    /**
     * Register a custom health check
     * @param name Unique name for the check
     * @param checkFn Function that performs the check
     *
     * @example
     * ```typescript
     * engine.registerHealthCheck('external-api', async () => {
     *     try {
     *         const res = await fetch('https://api.example.com/health')
     *         return { status: res.ok ? 'up' : 'down' }
     *     } catch (error) {
     *         return { status: 'down', error: error.message }
     *     }
     * })
     * ```
     */
    registerHealthCheck(name: string, checkFn: HealthCheckFn): void {
        this.#healthChecker.registerCheck(name, checkFn)
    }

    /**
     * Remove a custom health check
     * @param name Name of the check to remove
     * @returns true if the check was removed, false if it didn't exist
     */
    removeHealthCheck(name: string): boolean {
        return this.#healthChecker.removeCheck(name)
    }

    /**
     * Get list of registered health check names
     */
    getHealthCheckNames(): string[] {
        return this.#healthChecker.getCheckNames()
    }

    /**
     * Stops the Digital Twin Engine with graceful shutdown
     *
     * This method:
     * 1. Prevents new work from being accepted
     * 2. Removes all event listeners
     * 3. Closes HTTP server
     * 4. Drains queues and waits for active jobs
     * 5. Closes all queue workers
     * 6. Stops upload processor
     * 7. Closes queue manager
     * 8. Closes database connections
     *
     * @async
     * @returns {Promise<void>}
     *
     * @example
     * ```TypeScript
     * await engine.stop()
     * console.log('Engine stopped gracefully')
     * ```
     */
    async stop(): Promise<void> {
        if (this.#isShuttingDown) {
            if (process.env.NODE_ENV !== 'test') {
                console.warn('[DigitalTwin] Shutdown already in progress')
            }
            return
        }

        this.#isShuttingDown = true
        const startTime = Date.now()

        if (process.env.NODE_ENV !== 'test') {
            console.log('[DigitalTwin] Graceful shutdown initiated...')
        }

        const errors: Error[] = []

        // 1. Remove all event listeners to prevent new work
        this.#cleanupEventListeners()

        // 2. Close HTTP server (uWebSockets.js TemplatedApp.close() is synchronous)
        if (this.#server) {
            try {
                this.#server.close()
            } catch (error) {
                errors.push(this.#wrapError('Server close', error))
            }
            this.#server = undefined
        }

        // 3. Drain queues - wait for active jobs with timeout
        if (this.#queueManager) {
            try {
                await this.#drainQueues()
            } catch (error) {
                errors.push(this.#wrapError('Queue drain', error))
            }
        }

        // 4. Close all workers with extended timeout and force close
        await this.#closeWorkers(errors)

        // 5. Stop upload processor worker
        if (this.#uploadProcessor) {
            try {
                await this.#uploadProcessor.stop()
            } catch (error) {
                errors.push(this.#wrapError('Upload processor', error))
            }
        }

        // 6. Close queue connections (only if we have a queue manager)
        if (this.#queueManager) {
            try {
                await this.#queueManager.close()
            } catch (error) {
                errors.push(this.#wrapError('Queue manager', error))
            }
        }

        // 7. Close database connections
        try {
            await this.#database.close()
        } catch (error) {
            errors.push(this.#wrapError('Database', error))
        }

        const duration = Date.now() - startTime

        if (process.env.NODE_ENV !== 'test') {
            if (errors.length > 0) {
                console.error(
                    `[DigitalTwin] Shutdown completed with ${errors.length} errors in ${duration}ms:`,
                    errors.map(e => e.message).join(', ')
                )
            } else {
                console.log(`[DigitalTwin] Shutdown completed successfully in ${duration}ms`)
            }
        }
    }

    #cleanupEventListeners(): void {
        engineEventBus.removeAllListeners()
    }

    async #drainQueues(): Promise<void> {
        if (!this.#queueManager) return

        const timeout = Math.min(this.#shutdownTimeout / 2, 15000)
        const startTime = Date.now()

        while (Date.now() - startTime < timeout) {
            try {
                const stats = await this.#queueManager.getQueueStats()
                const totalActive = Object.values(stats).reduce((sum, q) => sum + (q.active || 0), 0)

                if (totalActive === 0) break

                if (process.env.NODE_ENV !== 'test') {
                    console.log(`[DigitalTwin] Waiting for ${totalActive} active jobs...`)
                }
                await new Promise(resolve => setTimeout(resolve, 1000))
            } catch {
                await new Promise(resolve => setTimeout(resolve, 1000))
                break
            }
        }
    }

    async #closeWorkers(errors: Error[]): Promise<void> {
        const workerTimeout = Math.min(this.#shutdownTimeout / 3, 10000)

        await Promise.all(
            this.#workers.map(async worker => {
                try {
                    await Promise.race([
                        worker.close(),
                        new Promise((_, reject) =>
                            setTimeout(() => reject(new Error('Worker close timeout')), workerTimeout)
                        )
                    ])
                } catch {
                    try {
                        await worker.disconnect()
                    } catch (disconnectError) {
                        errors.push(this.#wrapError('Worker disconnect', disconnectError))
                    }
                }
            })
        )
        this.#workers = []
    }

    #wrapError(context: string, error: unknown): Error {
        const message = error instanceof Error ? error.message : String(error)
        return new Error(`${context}: ${message}`)
    }

    /**
     * Validate the engine configuration and all components
     *
     * This method checks that all components are properly configured and can be initialized
     * without actually creating tables or starting the server.
     *
     * @returns {Promise<ValidationResult>} Comprehensive validation results
     *
     * @example
     * ```typescript
     * const result = await engine.validateConfiguration()
     * if (!result.valid) {
     *   console.error('Validation errors:', result.engineErrors)
     * }
     * ```
     */
    async validateConfiguration(): Promise<ValidationResult> {
        const componentResults: ComponentValidationResult[] = []
        const engineErrors: string[] = []

        // Validate collectors (includes dynamically registered)
        for (const collector of this.#allCollectors) {
            componentResults.push(await this.#validateComponent(collector, 'collector'))
        }

        // Validate harvesters (includes dynamically registered)
        for (const harvester of this.#allHarvesters) {
            componentResults.push(await this.#validateComponent(harvester, 'harvester'))
        }

        // Validate handlers (includes dynamically registered)
        for (const handler of this.#allHandlers) {
            componentResults.push(await this.#validateComponent(handler, 'handler'))
        }

        // Validate assets managers (includes dynamically registered)
        for (const assetsManager of this.#allAssetsManagers) {
            componentResults.push(await this.#validateComponent(assetsManager, 'assets_manager'))
        }

        // Validate custom table managers (includes dynamically registered)
        for (const customTableManager of this.#allCustomTableManagers) {
            componentResults.push(await this.#validateComponent(customTableManager, 'custom_table_manager'))
        }

        // Validate engine-level configuration
        try {
            if (!this.#storage) {
                engineErrors.push('Storage service is required')
            }
            if (!this.#database) {
                engineErrors.push('Database adapter is required')
            }

            // Test storage connection
            if (this.#storage && typeof this.#storage.save === 'function') {
                // Storage validation passed
            } else {
                engineErrors.push('Storage service does not implement required methods')
            }

            // Test database connection
            if (this.#database && typeof this.#database.save === 'function') {
                // Database validation passed
            } else {
                engineErrors.push('Database adapter does not implement required methods')
            }
        } catch (error) {
            engineErrors.push(`Engine configuration error: ${error instanceof Error ? error.message : String(error)}`)
        }

        // Calculate summary
        const validComponents = componentResults.filter(c => c.valid).length
        const totalWarnings = componentResults.reduce((acc, c) => acc + c.warnings.length, 0)

        const result: ValidationResult = {
            valid: componentResults.every(c => c.valid) && engineErrors.length === 0,
            components: componentResults,
            engineErrors,
            summary: {
                total: componentResults.length,
                valid: validComponents,
                invalid: componentResults.length - validComponents,
                warnings: totalWarnings
            }
        }

        return result
    }

    /**
     * Test all components by running their core methods without persistence
     *
     * @returns {Promise<ComponentValidationResult[]>} Test results for each component
     *
     * @example
     * ```typescript
     * const results = await engine.testComponents()
     * results.forEach(result => {
     *   console.log(`${result.name}: ${result.valid ? '✅' : '❌'}`)
     * })
     * ```
     */
    async testComponents(): Promise<ComponentValidationResult[]> {
        const results: ComponentValidationResult[] = []

        // Test collectors (includes dynamically registered)
        for (const collector of this.#allCollectors) {
            const result = await this.#testCollector(collector)
            results.push(result)
        }

        // Test harvesters (includes dynamically registered)
        for (const harvester of this.#allHarvesters) {
            const result = await this.#testHarvester(harvester)
            results.push(result)
        }

        // Test handlers (includes dynamically registered)
        for (const handler of this.#allHandlers) {
            const result = await this.#testHandler(handler)
            results.push(result)
        }

        // Test assets managers (includes dynamically registered)
        for (const assetsManager of this.#allAssetsManagers) {
            const result = await this.#testAssetsManager(assetsManager)
            results.push(result)
        }

        return results
    }

    /**
     * Validate a single component
     */
    async #validateComponent(
        component: Collector | Harvester | Handler | AssetsManager | CustomTableManager,
        type: ComponentValidationResult['type']
    ): Promise<ComponentValidationResult> {
        const errors: string[] = []
        const warnings: string[] = []

        try {
            // Check if component has required methods
            if (typeof component.getConfiguration !== 'function') {
                errors.push('Component must implement getConfiguration() method')
            }

            const config = component.getConfiguration()

            // Validate configuration
            if (!config.name) {
                errors.push('Component configuration must have a name')
            }
            if (!config.description) {
                warnings.push('Component configuration should have a description')
            }

            // Type-specific validation
            if (type === 'collector' || type === 'harvester') {
                const activeComponent = component as Collector | Harvester
                if (typeof activeComponent.setDependencies !== 'function') {
                    errors.push('Active components must implement setDependencies() method')
                }
            }

            if (type === 'collector') {
                const collector = component as Collector
                if (typeof collector.collect !== 'function') {
                    errors.push('Collector must implement collect() method')
                }
                if (typeof collector.getSchedule !== 'function') {
                    errors.push('Collector must implement getSchedule() method')
                }
            }

            if (type === 'harvester') {
                const harvester = component as Harvester
                if (typeof harvester.harvest !== 'function') {
                    errors.push('Harvester must implement harvest() method')
                }
            }

            if (type === 'assets_manager') {
                const assetsManager = component as AssetsManager
                if (typeof assetsManager.uploadAsset !== 'function') {
                    errors.push('AssetsManager must implement uploadAsset() method')
                }
                if (typeof assetsManager.getAllAssets !== 'function') {
                    errors.push('AssetsManager must implement getAllAssets() method')
                }
            }

            if (type === 'custom_table_manager') {
                const customTableManager = component as CustomTableManager
                if (typeof customTableManager.setDependencies !== 'function') {
                    errors.push('CustomTableManager must implement setDependencies() method')
                }
                if (typeof customTableManager.initializeTable !== 'function') {
                    errors.push('CustomTableManager must implement initializeTable() method')
                }

                // Validate store configuration
                const config = customTableManager.getConfiguration()
                if (typeof config !== 'object' || config === null) {
                    errors.push('CustomTableManager must return a valid configuration object')
                } else {
                    if (!config.columns || typeof config.columns !== 'object') {
                        errors.push('CustomTableManager configuration must define columns')
                    } else {
                        // Validate columns definition
                        const columnCount = Object.keys(config.columns).length
                        if (columnCount === 0) {
                            warnings.push('CustomTableManager has no custom columns defined')
                        }

                        // Validate column names and types
                        for (const [columnName, columnType] of Object.entries(config.columns)) {
                            if (!columnName || typeof columnName !== 'string') {
                                errors.push('Column names must be non-empty strings')
                            }
                            if (!columnType || typeof columnType !== 'string') {
                                errors.push(`Column '${columnName}' must have a valid SQL type`)
                            }
                        }
                    }
                }
            }
        } catch (error) {
            errors.push(`Validation error: ${error instanceof Error ? error.message : String(error)}`)
        }

        return {
            name: component.getConfiguration?.()?.name || 'unknown',
            type,
            valid: errors.length === 0,
            errors,
            warnings
        }
    }

    /**
     * Test a collector by running its collect method
     */
    async #testCollector(collector: Collector): Promise<ComponentValidationResult> {
        const errors: string[] = []
        const warnings: string[] = []
        const config = collector.getConfiguration()

        try {
            // Test the collect method
            const result = await collector.collect()

            if (!Buffer.isBuffer(result)) {
                errors.push('collect() method must return a Buffer')
            }

            if (result.length === 0) {
                warnings.push('collect() method returned empty buffer')
            }
        } catch (error) {
            errors.push(`collect() method failed: ${error instanceof Error ? error.message : String(error)}`)
        }

        return {
            name: config.name,
            type: 'collector',
            valid: errors.length === 0,
            errors,
            warnings
        }
    }

    /**
     * Test a harvester (more complex as it needs mock data)
     */
    async #testHarvester(harvester: Harvester): Promise<ComponentValidationResult> {
        const errors: string[] = []
        const warnings: string[] = []
        const config = harvester.getConfiguration()

        try {
            // Create mock data for testing
            const mockData = {
                id: 1,
                name: 'test',
                date: new Date(),
                contentType: 'application/json',
                url: 'test://url',
                data: async () => Buffer.from('{"test": true}')
            }

            // Test the harvest method
            const result = await harvester.harvest(mockData, {})

            if (!Buffer.isBuffer(result)) {
                errors.push('harvest() method must return a Buffer')
            }
        } catch (error) {
            errors.push(`harvest() method failed: ${error instanceof Error ? error.message : String(error)}`)
        }

        return {
            name: config.name,
            type: 'harvester',
            valid: errors.length === 0,
            errors,
            warnings
        }
    }

    /**
     * Test a handler
     */
    async #testHandler(handler: Handler): Promise<ComponentValidationResult> {
        const errors: string[] = []
        const warnings: string[] = []
        const config = handler.getConfiguration()

        try {
            // Handlers are mostly validated through their endpoint configuration
            if (typeof handler.getEndpoints === 'function') {
                const endpoints = handler.getEndpoints()
                if (!Array.isArray(endpoints)) {
                    errors.push('getEndpoints() must return an array')
                }
            }
        } catch (error) {
            errors.push(`Handler test failed: ${error instanceof Error ? error.message : String(error)}`)
        }

        return {
            name: config.name,
            type: 'handler',
            valid: errors.length === 0,
            errors,
            warnings
        }
    }

    /**
     * Test an assets manager
     */
    async #testAssetsManager(assetsManager: AssetsManager): Promise<ComponentValidationResult> {
        const errors: string[] = []
        const warnings: string[] = []
        const config = assetsManager.getConfiguration()

        try {
            // Test configuration
            if (!config.contentType) {
                errors.push('AssetsManager configuration must have a contentType')
            }

            // In dry run mode, we can't test actual upload/download without dependencies
            // Just validate that the methods exist and are callable
            if (typeof assetsManager.getEndpoints === 'function') {
                const endpoints = assetsManager.getEndpoints()
                if (!Array.isArray(endpoints)) {
                    errors.push('getEndpoints() must return an array')
                }
            }
        } catch (error) {
            errors.push(`AssetsManager test failed: ${error instanceof Error ? error.message : String(error)}`)
        }

        return {
            name: config.name,
            type: 'assets_manager',
            valid: errors.length === 0,
            errors,
            warnings
        }
    }
}
