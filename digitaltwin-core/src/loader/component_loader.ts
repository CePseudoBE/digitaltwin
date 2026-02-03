/**
 * @fileoverview Component auto-discovery and loading utilities
 *
 * Provides functions to automatically discover and load Digital Twin components
 * from a directory based on file naming conventions.
 */

import { pathToFileURL } from 'node:url'
import fs from 'node:fs/promises'
import path from 'node:path'
import type { LoadedComponents, AnyComponent } from '../engine/component_types.js'
import {
    isCollector,
    isHarvester,
    isHandler,
    isAssetsManager,
    isCustomTableManager
} from '../engine/component_types.js'

/**
 * Options for component auto-discovery
 */
export interface LoadComponentsOptions {
    /**
     * File patterns to match by suffix.
     * Keys are component types, values are file suffixes (without extension).
     * @default Standard naming conventions
     */
    patterns?: {
        collectors?: string
        harvesters?: string
        handlers?: string
        assetsManagers?: string
        customTableManagers?: string
    }

    /**
     * File extensions to scan for.
     * @default ['.js', '.mjs']
     */
    extensions?: string[]

    /**
     * Whether to scan subdirectories recursively.
     * @default true
     */
    recursive?: boolean

    /**
     * Patterns to exclude (glob-like patterns applied to file names).
     * @default ['*.spec.*', '*.test.*', 'index.*']
     */
    exclude?: string[]

    /**
     * Enable verbose logging during discovery.
     * @default false
     */
    verbose?: boolean
}

/**
 * Result of component loading operation
 */
export interface LoadComponentsResult extends LoadedComponents {
    /** Files that were scanned */
    scannedFiles: string[]

    /** Errors encountered during loading */
    errors: Array<{
        file: string
        error: string
    }>

    /** Summary statistics */
    summary: {
        total: number
        collectors: number
        harvesters: number
        handlers: number
        assetsManagers: number
        customTableManagers: number
        errors: number
    }
}

/**
 * Resolved patterns with all fields required
 */
interface ResolvedPatterns {
    collectors: string
    harvesters: string
    handlers: string
    assetsManagers: string
    customTableManagers: string
}

/**
 * Default file patterns for component detection based on naming conventions
 */
const DEFAULT_PATTERNS: ResolvedPatterns = {
    collectors: '_collector',
    harvesters: '_harvester',
    handlers: '_handler',
    assetsManagers: '_assets_manager',
    customTableManagers: '_custom_table'
}

const DEFAULT_EXTENSIONS = ['.js', '.mjs']

const DEFAULT_EXCLUDE = ['*.spec.*', '*.test.*', 'index.*', '*.d.ts']

/**
 * Check if a filename matches an exclusion pattern.
 */
function matchesExcludePattern(filename: string, patterns: string[]): boolean {
    for (const pattern of patterns) {
        // Convert glob pattern to regex
        const regexPattern = pattern.replace(/\./g, '\\.').replace(/\*/g, '.*')
        const regex = new RegExp(`^${regexPattern}$`, 'i')
        if (regex.test(filename)) {
            return true
        }
    }
    return false
}

/**
 * Determine component type from filename based on patterns.
 */
function getComponentTypeFromFilename(filename: string, patterns: ResolvedPatterns): keyof LoadedComponents | null {
    const baseName = path.basename(filename)

    // Remove extension for matching
    const nameWithoutExt = baseName.replace(/\.[^.]+$/, '')

    if (nameWithoutExt.endsWith(patterns.collectors)) return 'collectors'
    if (nameWithoutExt.endsWith(patterns.harvesters)) return 'harvesters'
    if (nameWithoutExt.endsWith(patterns.handlers)) return 'handlers'
    if (nameWithoutExt.endsWith(patterns.assetsManagers)) return 'assetsManagers'
    if (nameWithoutExt.endsWith(patterns.customTableManagers)) return 'customTableManagers'

    // Also check for *_manager pattern for tileset/map managers
    if (
        nameWithoutExt.endsWith('_manager') ||
        nameWithoutExt.endsWith('_tileset_manager') ||
        nameWithoutExt.endsWith('_map_manager')
    ) {
        return 'assetsManagers'
    }

    return null
}

/**
 * Check if a value is a class constructor.
 */
function isClassConstructor(value: unknown): value is new (...args: any[]) => any {
    return typeof value === 'function' && value.prototype && value.prototype.constructor === value
}

/**
 * Check if an instance is a valid Digital Twin component.
 */
function isValidComponent(instance: unknown): instance is AnyComponent {
    if (!instance || typeof instance !== 'object') return false
    if (typeof (instance as any).getConfiguration !== 'function') return false

    return (
        isCollector(instance as AnyComponent) ||
        isHarvester(instance as AnyComponent) ||
        isHandler(instance as AnyComponent) ||
        isAssetsManager(instance as AnyComponent) ||
        isCustomTableManager(instance as AnyComponent)
    )
}

/**
 * Recursively scan a directory for component files.
 */
async function scanDirectory(
    dir: string,
    options: {
        extensions: string[]
        exclude: string[]
        recursive: boolean
        patterns: ResolvedPatterns
    }
): Promise<Array<{ path: string; type: keyof LoadedComponents }>> {
    const results: Array<{ path: string; type: keyof LoadedComponents }> = []

    try {
        const entries = await fs.readdir(dir, { withFileTypes: true })

        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name)

            // Skip hidden files/directories
            if (entry.name.startsWith('.') || entry.name.startsWith('_')) {
                continue
            }

            if (entry.isDirectory() && options.recursive) {
                const subResults = await scanDirectory(fullPath, options)
                results.push(...subResults)
            } else if (entry.isFile()) {
                // Check extension
                const ext = path.extname(entry.name)
                if (!options.extensions.includes(ext)) {
                    continue
                }

                // Check exclusions
                if (matchesExcludePattern(entry.name, options.exclude)) {
                    continue
                }

                // Determine component type
                const componentType = getComponentTypeFromFilename(entry.name, options.patterns)
                if (componentType) {
                    results.push({ path: fullPath, type: componentType })
                }
            }
        }
    } catch {
        // Directory doesn't exist or can't be read - return empty array
    }

    return results
}

/**
 * Convert a snake_case or kebab-case string to PascalCase.
 */
function toPascalCase(str: string): string {
    return str
        .split(/[-_]/)
        .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
        .join('')
}

/**
 * Auto-discovers and loads Digital Twin components from a directory.
 *
 * This function scans the specified directory for component files following
 * the naming conventions (*_collector.js, *_harvester.js, etc.), dynamically
 * imports them, and instantiates any component classes found.
 *
 * ## Naming Conventions
 *
 * Component files should follow these naming patterns:
 * - Collectors: `*_collector.js` (e.g., `weather_collector.js`)
 * - Harvesters: `*_harvester.js` (e.g., `traffic_harvester.js`)
 * - Handlers: `*_handler.js` (e.g., `api_handler.js`)
 * - Assets Managers: `*_assets_manager.js` (e.g., `gltf_assets_manager.js`)
 * - Custom Table Managers: `*_custom_table.js` (e.g., `wms_custom_table.js`)
 *
 * ## Component Export Requirements
 *
 * Components should be exported as default export or named export matching the class name:
 * ```typescript
 * // Default export (preferred)
 * export default class WeatherCollector extends Collector { ... }
 *
 * // Named export matching file name
 * export class WeatherCollector extends Collector { ... }
 * ```
 *
 * @param directory - Directory path to scan for components (absolute or relative to cwd)
 * @param options - Configuration options for discovery
 * @returns Promise resolving to loaded components and metadata
 *
 * @example
 * ```typescript
 * import { loadComponents, DigitalTwinEngine } from 'digitaltwin-core'
 *
 * // Basic usage - scan compiled components
 * const result = await loadComponents('./dist/components')
 *
 * console.log(`Loaded ${result.summary.total} components`)
 *
 * const engine = new DigitalTwinEngine({ storage, database })
 * engine.registerComponents(result)
 * await engine.start()
 * ```
 *
 * @example
 * ```typescript
 * // Advanced usage with options
 * const result = await loadComponents('./dist/components', {
 *   recursive: true,
 *   verbose: true,
 *   extensions: ['.js'],
 *   exclude: ['*.test.*', 'deprecated_*']
 * })
 *
 * if (result.errors.length > 0) {
 *   console.warn('Some components failed to load:', result.errors)
 * }
 * ```
 */
export async function loadComponents(
    directory: string,
    options: LoadComponentsOptions = {}
): Promise<LoadComponentsResult> {
    const patterns: ResolvedPatterns = { ...DEFAULT_PATTERNS, ...options.patterns }
    const extensions = options.extensions ?? DEFAULT_EXTENSIONS
    const exclude = options.exclude ?? DEFAULT_EXCLUDE
    const recursive = options.recursive ?? true
    const verbose = options.verbose ?? false

    const result: LoadComponentsResult = {
        collectors: [],
        harvesters: [],
        handlers: [],
        assetsManagers: [],
        customTableManagers: [],
        scannedFiles: [],
        errors: [],
        summary: {
            total: 0,
            collectors: 0,
            harvesters: 0,
            handlers: 0,
            assetsManagers: 0,
            customTableManagers: 0,
            errors: 0
        }
    }

    // Resolve directory path
    const absoluteDir = path.isAbsolute(directory) ? directory : path.resolve(process.cwd(), directory)

    // Check if directory exists
    try {
        await fs.access(absoluteDir)
    } catch {
        if (verbose) {
            console.warn(`[loadComponents] Directory not found: ${absoluteDir}`)
        }
        return result
    }

    // Scan for component files
    const files = await scanDirectory(absoluteDir, { extensions, exclude, recursive, patterns })

    result.scannedFiles = files.map(f => f.path)

    if (verbose) {
        console.log(`[loadComponents] Found ${files.length} potential component files`)
    }

    // Load each component file
    for (const { path: filePath, type: expectedType } of files) {
        try {
            // Convert to file URL for ESM import
            const fileUrl = pathToFileURL(filePath).href
            const module = await import(fileUrl)

            // Find component class in module exports
            let ComponentClass: (new (...args: any[]) => AnyComponent) | null = null

            // Try default export first
            if (module.default && isClassConstructor(module.default)) {
                ComponentClass = module.default
            } else {
                // Try named exports
                const fileName = path.basename(filePath, path.extname(filePath))
                const expectedClassName = toPascalCase(fileName)

                if (module[expectedClassName] && isClassConstructor(module[expectedClassName])) {
                    ComponentClass = module[expectedClassName]
                } else {
                    // Try to find any class export that's a valid component
                    for (const [, value] of Object.entries(module)) {
                        if (isClassConstructor(value)) {
                            try {
                                const testInstance = new value()
                                if (isValidComponent(testInstance)) {
                                    ComponentClass = value as new (...args: any[]) => AnyComponent
                                    break
                                }
                            } catch {
                                // Skip if instantiation fails
                            }
                        }
                    }
                }
            }

            if (!ComponentClass) {
                result.errors.push({
                    file: filePath,
                    error: 'No valid component class found in module exports'
                })
                continue
            }

            // Instantiate the component
            const instance = new ComponentClass()

            if (!isValidComponent(instance)) {
                result.errors.push({
                    file: filePath,
                    error: 'Instantiated class is not a valid Digital Twin component'
                })
                continue
            }

            // Add to appropriate array based on actual type (not expected type)
            if (isCollector(instance)) {
                result.collectors.push(instance)
                result.summary.collectors++
            } else if (isHarvester(instance)) {
                result.harvesters.push(instance)
                result.summary.harvesters++
            } else if (isHandler(instance)) {
                result.handlers.push(instance)
                result.summary.handlers++
            } else if (isCustomTableManager(instance)) {
                result.customTableManagers.push(instance)
                result.summary.customTableManagers++
            } else if (isAssetsManager(instance)) {
                result.assetsManagers.push(instance)
                result.summary.assetsManagers++
            }

            result.summary.total++

            if (verbose) {
                const config = instance.getConfiguration()
                console.log(`[loadComponents] Loaded: ${config.name} (${expectedType})`)
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error)
            result.errors.push({
                file: filePath,
                error: `Failed to import: ${errorMessage}`
            })
            result.summary.errors++

            if (verbose) {
                console.error(`[loadComponents] Error loading ${filePath}:`, errorMessage)
            }
        }
    }

    if (verbose) {
        console.log(`[loadComponents] Summary:`, result.summary)
    }

    return result
}
