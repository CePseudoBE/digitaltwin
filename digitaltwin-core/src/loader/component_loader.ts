import { readdir } from 'fs/promises'
import { join, extname, basename } from 'path'
import { pathToFileURL } from 'url'

import type { Collector } from '../components/collector.js'
import type { Harvester } from '../components/harvester.js'
import type { Handler } from '../components/handler.js'
import type { AssetsManager } from '../components/assets_manager.js'
import type { CustomTableManager } from '../components/custom_table_manager.js'
import {
    isCollector,
    isHarvester,
    isHandler,
    isAssetsManager,
    isCustomTableManager
} from '../engine/digital_twin_engine.js'

/**
 * Result of loading components from a directory
 */
export interface LoadedComponents {
    /** Array of Collector instances */
    collectors: Collector[]
    /** Array of Harvester instances */
    harvesters: Harvester[]
    /** Array of Handler instances */
    handlers: Handler[]
    /** Array of AssetsManager instances */
    assetsManagers: AssetsManager[]
    /** Array of CustomTableManager instances */
    customTableManagers: CustomTableManager[]
}

/**
 * Options for the component loader
 */
export interface LoadComponentsOptions {
    /**
     * Patterns to exclude from loading.
     * Supports glob-like patterns with * wildcard.
     * @example ['test_*', '*_backup']
     */
    exclude?: string[]

    /**
     * Enable verbose logging
     * @default false
     */
    verbose?: boolean

    /**
     * Custom logger function
     * @default console.log
     */
    logger?: (message: string) => void

    /**
     * File extensions to consider
     * @default ['.js', '.ts']
     */
    extensions?: string[]
}

/**
 * Check if a filename matches any exclude pattern
 */
function matchesExcludePattern(filename: string, patterns: string[]): boolean {
    for (const pattern of patterns) {
        // Convert glob pattern to regex
        const regexPattern = pattern
            .replace(/\*/g, '.*')
            .replace(/\?/g, '.')
        const regex = new RegExp(`^${regexPattern}$`, 'i')
        if (regex.test(filename)) {
            return true
        }
    }
    return false
}

/**
 * Check if an export is a class constructor
 */
function isClass(value: unknown): value is new () => unknown {
    return typeof value === 'function' && /^\s*class\s+/.test(value.toString())
}

/**
 * Type alias for any component type
 */
type AnyLoadedComponent = Collector | Harvester | Handler | AssetsManager | CustomTableManager

/**
 * Try to instantiate a component from an exported class
 */
function tryInstantiateComponent(
    exportValue: unknown,
    logger: (msg: string) => void,
    verbose: boolean
): AnyLoadedComponent | null {
    // Must be a class
    if (!isClass(exportValue)) {
        return null
    }

    try {
        // Try to instantiate
        const instance = new exportValue() as AnyLoadedComponent

        // Check component type and return
        if (isCollector(instance)) {
            if (verbose) logger(`  Detected as Collector`)
            return instance
        }
        if (isHarvester(instance)) {
            if (verbose) logger(`  Detected as Harvester`)
            return instance
        }
        if (isAssetsManager(instance)) {
            if (verbose) logger(`  Detected as AssetsManager`)
            return instance
        }
        if (isCustomTableManager(instance)) {
            if (verbose) logger(`  Detected as CustomTableManager`)
            return instance
        }
        if (isHandler(instance)) {
            if (verbose) logger(`  Detected as Handler`)
            return instance
        }

        return null
    } catch {
        // Constructor failed - likely abstract class or requires parameters
        return null
    }
}

/**
 * Load and instantiate components from a directory.
 *
 * This function scans a directory for component files, dynamically imports them,
 * and instantiates any components found. Components are automatically categorized
 * by type based on their class structure.
 *
 * The loader looks for classes that:
 * - Can be instantiated with no arguments
 * - Match the component type signatures (Collector, Harvester, Handler, etc.)
 *
 * @param {string} directoryPath - Path to the components directory
 * @param {LoadComponentsOptions} options - Loading options
 * @returns {Promise<LoadedComponents>} Object containing arrays of each component type
 *
 * @example
 * ```typescript
 * import { DigitalTwinEngine, loadComponents } from 'digitaltwin-core'
 *
 * // Load all components from a directory
 * const components = await loadComponents('./src/components', {
 *   verbose: true
 * })
 *
 * // Create engine with loaded components
 * const engine = new DigitalTwinEngine({
 *   storage,
 *   database,
 *   ...components
 * })
 *
 * await engine.start()
 * ```
 *
 * @example
 * ```typescript
 * // With exclusions
 * const components = await loadComponents('./src/components', {
 *   exclude: ['*_test', 'example_*'],
 *   verbose: true,
 *   logger: (msg) => console.log(`[Loader] ${msg}`)
 * })
 * ```
 */
export async function loadComponents(
    directoryPath: string,
    options: LoadComponentsOptions = {}
): Promise<LoadedComponents> {
    const {
        exclude = [],
        verbose = false,
        logger = console.log,
        extensions = ['.js', '.ts']
    } = options

    const result: LoadedComponents = {
        collectors: [],
        harvesters: [],
        handlers: [],
        assetsManagers: [],
        customTableManagers: []
    }

    const log = (message: string) => {
        if (verbose) {
            logger(message)
        }
    }

    log(`Loading components from: ${directoryPath}`)

    let files: string[]
    try {
        files = await readdir(directoryPath)
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            log(`Directory does not exist: ${directoryPath}`)
            return result
        }
        throw error
    }

    // Filter and sort files
    const componentFiles = files
        .filter(file => {
            const ext = extname(file)
            const baseName = basename(file, ext)

            // Skip non-matching extensions
            if (!extensions.includes(ext)) {
                return false
            }

            // Skip index files
            if (baseName === 'index') {
                return false
            }

            // Skip excluded patterns
            if (matchesExcludePattern(baseName, exclude)) {
                log(`Excluding: ${file}`)
                return false
            }

            return true
        })
        .sort()

    log(`Found ${componentFiles.length} potential component files`)

    // Load each file
    for (const file of componentFiles) {
        const filePath = join(directoryPath, file)
        const fileUrl = pathToFileURL(filePath).href

        log(`Loading: ${file}`)

        try {
            // Dynamic import
            const module = await import(fileUrl)

            // Check all exports
            for (const [exportName, exportValue] of Object.entries(module)) {
                if (exportName === 'default' && exportValue === module.default) {
                    // Already handled via named exports
                    continue
                }

                const component = tryInstantiateComponent(exportValue, log, verbose)
                if (component) {
                    if (isCollector(component)) {
                        result.collectors.push(component)
                    } else if (isHarvester(component)) {
                        result.harvesters.push(component)
                    } else if (isAssetsManager(component)) {
                        result.assetsManagers.push(component)
                    } else if (isCustomTableManager(component)) {
                        result.customTableManagers.push(component)
                    } else if (isHandler(component)) {
                        result.handlers.push(component)
                    }
                    log(`  Loaded: ${exportName}`)
                }
            }

            // Also check default export if it exists
            if (module.default) {
                const component = tryInstantiateComponent(module.default, log, verbose)
                if (component) {
                    if (isCollector(component)) {
                        result.collectors.push(component)
                    } else if (isHarvester(component)) {
                        result.harvesters.push(component)
                    } else if (isAssetsManager(component)) {
                        result.assetsManagers.push(component)
                    } else if (isCustomTableManager(component)) {
                        result.customTableManagers.push(component)
                    } else if (isHandler(component)) {
                        result.handlers.push(component)
                    }
                    log(`  Loaded default export`)
                }
            }
        } catch (error) {
            log(`  Failed to load ${file}: ${error instanceof Error ? error.message : 'Unknown error'}`)
        }
    }

    log(`Loaded components:`)
    log(`  - ${result.collectors.length} collector(s)`)
    log(`  - ${result.harvesters.length} harvester(s)`)
    log(`  - ${result.handlers.length} handler(s)`)
    log(`  - ${result.assetsManagers.length} assets manager(s)`)
    log(`  - ${result.customTableManagers.length} custom table manager(s)`)

    return result
}
