import fs from 'fs-extra'
import path from 'path'
import { StringUtils } from './string_utils.js'

/**
 * Component info extracted from a file
 */
interface ComponentInfo {
    /** File path relative to components directory */
    relativePath: string
    /** File name without extension */
    baseName: string
    /** Detected component type */
    type: ComponentType
    /** Class name in PascalCase */
    className: string
    /** Variable name in camelCase */
    variableName: string
}

/**
 * Types of components that can be detected
 */
type ComponentType = 'collector' | 'harvester' | 'handler' | 'assetsManager' | 'customTableManager'

/**
 * Result of barrel generation
 */
export interface BarrelGenerationResult {
    /** Path to the generated barrel file */
    filePath: string
    /** Components found and included */
    components: ComponentInfo[]
    /** Whether the file was written (false for dry-run) */
    written: boolean
    /** Generated content */
    content: string
}

/**
 * Options for barrel generation
 */
export interface BarrelUpdaterOptions {
    /** Dry run mode - don't write files */
    dryRun?: boolean
    /** Verbose logging */
    verbose?: boolean
    /** Custom logger */
    logger?: (message: string) => void
}

/**
 * Utility class for generating and updating barrel files (index.ts) for components
 */
export class BarrelUpdater {
    private readonly options: BarrelUpdaterOptions

    constructor(options: BarrelUpdaterOptions = {}) {
        this.options = {
            dryRun: false,
            verbose: false,
            ...options
        }
    }

    private log(message: string): void {
        if (this.options.verbose && this.options.logger) {
            this.options.logger(message)
        }
    }

    /**
     * Detect component type from file name pattern
     */
    private detectComponentType(fileName: string): ComponentType | null {
        const lowerName = fileName.toLowerCase()

        if (lowerName.endsWith('_collector.ts') || lowerName.endsWith('_collector.js')) {
            return 'collector'
        }
        if (lowerName.endsWith('_harvester.ts') || lowerName.endsWith('_harvester.js')) {
            return 'harvester'
        }
        if (lowerName.endsWith('_handler.ts') || lowerName.endsWith('_handler.js')) {
            return 'handler'
        }
        if (lowerName.endsWith('_assets_manager.ts') || lowerName.endsWith('_assets_manager.js')) {
            return 'assetsManager'
        }
        if (lowerName.endsWith('_tileset_manager.ts') || lowerName.endsWith('_tileset_manager.js')) {
            return 'assetsManager' // TilesetManager extends AssetsManager
        }
        if (lowerName.endsWith('_map_manager.ts') || lowerName.endsWith('_map_manager.js')) {
            return 'customTableManager' // MapManager is a custom table manager
        }
        if (lowerName.endsWith('_manager.ts') || lowerName.endsWith('_manager.js')) {
            // Generic manager - assume custom table manager
            return 'customTableManager'
        }

        return null
    }

    /**
     * Extract class name from file name
     */
    private extractClassName(fileName: string): string {
        // Remove extension
        const baseName = fileName.replace(/\.(ts|js)$/, '')
        return StringUtils.toPascalCase(baseName)
    }

    /**
     * Scan a directory for component files
     */
    async scanComponentsDirectory(componentsDir: string): Promise<ComponentInfo[]> {
        const components: ComponentInfo[] = []

        if (!await fs.pathExists(componentsDir)) {
            this.log(`Components directory does not exist: ${componentsDir}`)
            return components
        }

        const files = await fs.readdir(componentsDir)

        for (const file of files) {
            const filePath = path.join(componentsDir, file)
            const stat = await fs.stat(filePath)

            // Skip directories and non-ts/js files
            if (stat.isDirectory() || (!file.endsWith('.ts') && !file.endsWith('.js'))) {
                continue
            }

            // Skip index files
            if (file === 'index.ts' || file === 'index.js') {
                continue
            }

            const type = this.detectComponentType(file)
            if (type) {
                const baseName = file.replace(/\.(ts|js)$/, '')
                const className = this.extractClassName(file)

                components.push({
                    relativePath: `./${baseName}.js`,
                    baseName,
                    type,
                    className,
                    variableName: StringUtils.toCamelCase(baseName)
                })

                this.log(`Found ${type}: ${className}`)
            }
        }

        return components
    }

    /**
     * Generate barrel file content
     */
    generateBarrelContent(components: ComponentInfo[]): string {
        // Group components by type
        const collectors = components.filter(c => c.type === 'collector')
        const harvesters = components.filter(c => c.type === 'harvester')
        const handlers = components.filter(c => c.type === 'handler')
        const assetsManagers = components.filter(c => c.type === 'assetsManager')
        const customTableManagers = components.filter(c => c.type === 'customTableManager')

        const lines: string[] = [
            '/**',
            ' * Auto-generated barrel file for components.',
            ' * DO NOT EDIT MANUALLY - this file is regenerated by the CLI.',
            ' *',
            ' * Generated by: digitaltwin-cli barrel:update',
            ` * Last updated: ${new Date().toISOString()}`,
            ' */',
            ''
        ]

        // Generate imports
        const allComponents = [...collectors, ...harvesters, ...handlers, ...assetsManagers, ...customTableManagers]

        if (allComponents.length === 0) {
            lines.push('// No components found')
            lines.push('')
        } else {
            for (const component of allComponents) {
                lines.push(`import { ${component.className} } from '${component.relativePath}'`)
            }
            lines.push('')
        }

        // Generate re-exports
        if (allComponents.length > 0) {
            lines.push('// Re-export all component classes')
            for (const component of allComponents) {
                lines.push(`export { ${component.className} } from '${component.relativePath}'`)
            }
            lines.push('')
        }

        // Generate arrays of instances
        lines.push('// Pre-instantiated component arrays for easy engine registration')
        lines.push(`export const collectors = [${collectors.map(c => `new ${c.className}()`).join(', ')}]`)
        lines.push(`export const harvesters = [${harvesters.map(c => `new ${c.className}()`).join(', ')}]`)
        lines.push(`export const handlers = [${handlers.map(c => `new ${c.className}()`).join(', ')}]`)
        lines.push(`export const assetsManagers = [${assetsManagers.map(c => `new ${c.className}()`).join(', ')}]`)
        lines.push(`export const customTableManagers = [${customTableManagers.map(c => `new ${c.className}()`).join(', ')}]`)
        lines.push('')

        // Generate combined components object
        lines.push('/**')
        lines.push(' * All components ready for engine registration.')
        lines.push(' *')
        lines.push(' * @example')
        lines.push(' * ```typescript')
        lines.push(' * import { components } from \'./components/index.js\'')
        lines.push(' *')
        lines.push(' * const engine = new DigitalTwinEngine({')
        lines.push(' *   storage,')
        lines.push(' *   database,')
        lines.push(' *   ...components')
        lines.push(' * })')
        lines.push(' * ```')
        lines.push(' */')
        lines.push('export const components = {')
        lines.push('    collectors,')
        lines.push('    harvesters,')
        lines.push('    handlers,')
        lines.push('    assetsManagers,')
        lines.push('    customTableManagers')
        lines.push('}')
        lines.push('')

        return lines.join('\n')
    }

    /**
     * Update or create the barrel file for a components directory
     */
    async updateBarrel(componentsDir: string): Promise<BarrelGenerationResult> {
        this.log(`Scanning components directory: ${componentsDir}`)

        const components = await this.scanComponentsDirectory(componentsDir)
        const content = this.generateBarrelContent(components)
        const barrelPath = path.join(componentsDir, 'index.ts')

        if (this.options.dryRun) {
            this.log(`[DRY RUN] Would write barrel file to: ${barrelPath}`)
            return {
                filePath: barrelPath,
                components,
                written: false,
                content
            }
        }

        await fs.ensureDir(componentsDir)
        await fs.writeFile(barrelPath, content, 'utf8')
        this.log(`Wrote barrel file: ${barrelPath}`)

        return {
            filePath: barrelPath,
            components,
            written: true,
            content
        }
    }

    /**
     * Update barrel file for a project
     */
    async updateProjectBarrel(projectRoot: string = process.cwd()): Promise<BarrelGenerationResult> {
        // Determine components directory
        const srcComponentsDir = path.join(projectRoot, 'src', 'components')
        const rootComponentsDir = path.join(projectRoot, 'components')

        let componentsDir: string

        if (await fs.pathExists(srcComponentsDir)) {
            componentsDir = srcComponentsDir
        } else if (await fs.pathExists(rootComponentsDir)) {
            componentsDir = rootComponentsDir
        } else {
            // Default to src/components
            componentsDir = srcComponentsDir
        }

        return this.updateBarrel(componentsDir)
    }
}
