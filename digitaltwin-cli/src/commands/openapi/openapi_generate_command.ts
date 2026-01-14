import { flags } from '@adonisjs/ace'
import { BaseCommand } from '../base_command.js'
import path from 'path'
import fs from 'fs/promises'

/**
 * Command to generate OpenAPI specification from Digital Twin components.
 *
 * This command scans component files in the project, instantiates them,
 * and generates OpenAPI specs from each documentable component.
 *
 * @example
 * ```bash
 * # Generate openapi.yaml in project root
 * node dt openapi:generate
 *
 * # Generate with custom output path
 * node dt openapi:generate --output ./docs/api.yaml
 *
 * # Generate JSON instead of YAML
 * node dt openapi:generate --format json
 * ```
 */
export class OpenAPIGenerateCommand extends BaseCommand {
    static commandName = 'openapi:generate'
    static description = 'Generate OpenAPI specification from components'

    @flags.string({
        description: 'Output file path',
        flagName: 'output',
        alias: 'o'
    })
    declare output: string | undefined

    @flags.string({
        description: 'Output format (yaml or json)',
        flagName: 'format',
        alias: 'f'
    })
    declare format: string | undefined

    @flags.string({
        description: 'API title',
        flagName: 'title',
        alias: 't'
    })
    declare title: string | undefined

    @flags.string({
        description: 'API version',
        flagName: 'version',
        alias: 'v'
    })
    declare apiVersion: string | undefined

    @flags.string({
        description: 'API description',
        flagName: 'description',
        alias: 'd'
    })
    declare apiDescription: string | undefined

    @flags.string({
        description: 'Server URL',
        flagName: 'server',
        alias: 's'
    })
    declare serverUrl: string | undefined

    @flags.boolean({
        description: 'Show what would be generated without creating files',
        flagName: 'dry-run'
    })
    declare dryRun: boolean

    async run(): Promise<void> {
        try {
            await this.projectDetector.validateProject()
            const projectInfo = await this.projectDetector.getProjectInfo()

            if (!projectInfo) {
                this.logger.error('Could not read project information')
                return
            }

            this.info('Scanning for component files...')

            // Determine output format and path
            const outputFormat = this.format?.toLowerCase() === 'json' ? 'json' : 'yaml'
            const defaultFileName = outputFormat === 'json' ? 'openapi.json' : 'openapi.yaml'
            const outputPath = this.output || path.join(process.cwd(), defaultFileName)

            // Import OpenAPIGenerator from digitaltwin-core
            const digitaltwinCorePath = path.join(
                process.cwd(),
                'node_modules',
                'digitaltwin-core',
                'dist',
                'index.js'
            )
            // Convert Windows path to file:// URL format
            const coreFileUrl = `file:///${digitaltwinCorePath.replace(/\\/g, '/')}`
            const { OpenAPIGenerator, isOpenAPIDocumentable } = await import(coreFileUrl)

            // Scan component files from dist/components
            const distComponentsDir = path.join(process.cwd(), 'dist', 'components')
            const components = await this.loadComponentsFromDist(distComponentsDir)

            this.info(`Found ${components.length} component classes`)

            // Filter documentable components
            const documentableComponents = components.filter(isOpenAPIDocumentable)
            this.info(`${documentableComponents.length} components implement OpenAPIDocumentable`)

            // Generate OpenAPI spec
            const openApiDoc = OpenAPIGenerator.generate({
                info: {
                    title: this.title || projectInfo.name || 'Digital Twin API',
                    version: this.apiVersion || projectInfo.version || '1.0.0',
                    description:
                        this.apiDescription || `API documentation for ${projectInfo.name || 'Digital Twin'}`
                },
                servers: this.serverUrl ? [{ url: this.serverUrl }] : undefined,
                components: documentableComponents
            })

            // Convert to output format
            const content =
                outputFormat === 'json'
                    ? OpenAPIGenerator.toJSON(openApiDoc)
                    : OpenAPIGenerator.toYAML(openApiDoc)

            if (this.dryRun) {
                this.info(`Would generate: ${outputPath}`)
                this.info(`Format: ${outputFormat}`)
                this.info(`Components: ${documentableComponents.length}`)
                this.info(`Paths: ${Object.keys(openApiDoc.paths || {}).length}`)
                console.log('\n--- Preview (first 3000 chars) ---\n')
                console.log(content.substring(0, 3000) + (content.length > 3000 ? '\n...(truncated)' : ''))
                return
            }

            // Write file
            await fs.writeFile(outputPath, content, 'utf-8')

            this.success(`Generated OpenAPI spec: ${path.relative(process.cwd(), outputPath)}`)
            this.info(`Format: ${outputFormat}`)
            this.info(`Components documented: ${documentableComponents.length}`)
            this.info(`Paths: ${Object.keys(openApiDoc.paths || {}).length}`)
        } catch (error: any) {
            this.logger.error(`Failed to generate OpenAPI spec: ${error.message}`)
            if (error.stack) {
                this.logger.error(error.stack)
            }
            this.exitCode = 1
        }
    }

    /**
     * Load component instances from compiled dist/components directory
     * This imports the components/index.js which exports all components
     * without starting the server (unlike dist/index.js)
     */
    private async loadComponentsFromDist(componentsDir: string): Promise<any[]> {
        const components: any[] = []

        try {
            // Import the components index which exports all component classes
            const componentsIndexPath = path.join(componentsDir, 'index.js')

            // Convert Windows path to file:// URL format
            const fileUrl = `file:///${componentsIndexPath.replace(/\\/g, '/')}`
            this.info(`Loading components from: ${fileUrl}`)

            const module = await import(fileUrl)

            // Find exported classes and instantiate them
            for (const [exportName, exportValue] of Object.entries(module)) {
                if (
                    typeof exportValue === 'function' &&
                    exportName !== 'default' &&
                    !exportName.startsWith('_')
                ) {
                    try {
                        // Try to instantiate the class
                        const instance = new (exportValue as any)()

                        // Check if it has getConfiguration method
                        if (instance && typeof instance.getConfiguration === 'function') {
                            const config = instance.getConfiguration()
                            components.push(instance)
                            this.info(`  Loaded: ${config.name} (${exportName})`)
                        }
                    } catch (instantiationError: any) {
                        // Skip classes that can't be instantiated without arguments
                        // This is expected for abstract classes or those requiring dependencies
                    }
                }
            }
        } catch (dirError: any) {
            this.warning(`Could not load components: ${dirError.message}`)
            this.info('Make sure to run "npm run build" first')
        }

        return components
    }
}
