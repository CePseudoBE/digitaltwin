import { args, flags } from '@adonisjs/ace'
import { BaseCommand } from '../base_command.js'
import { StringUtils } from '../../utils/string_utils.js'
import { validateComponentName, validateHttpMethod } from '../../utils/validators.js'
import path from 'path'

export class MakeHandlerCommand extends BaseCommand {
  static override commandName = 'make:handler'
  static override description = 'Generate a new handler component'

  @args.string({ description: 'Component name (PascalCase, e.g., ApiData)' })
  declare name: string

  @flags.string({ description: 'Description of the handler', flagName: 'description', alias: 'd' })
  declare componentDescription: string | undefined

  @flags.string({ description: 'HTTP method (get, post, put, patch, delete)', flagName: 'method', alias: 'm' })
  declare method: string | undefined

  @flags.string({ description: 'Custom endpoint name', flagName: 'endpoint' })
  declare endpoint: string | undefined

  @flags.boolean({ description: 'Overwrite existing files', flagName: 'force' })
  declare force: boolean

  @flags.boolean({ description: 'Show what would be generated without creating files', flagName: 'dry-run' })
  declare dryRun: boolean

  override async run(): Promise<void> {
    try {
      // Validate component name
      const nameValidation = validateComponentName(this.name)
      if (!nameValidation.valid) {
        this.logger.error(nameValidation.error!)
        if (nameValidation.suggestion) {
          this.info(nameValidation.suggestion)
        }
        this.exitCode = 1
        return
      }

      // Validate HTTP method if provided
      if (this.method) {
        const methodValidation = validateHttpMethod(this.method)
        if (!methodValidation.valid) {
          this.logger.error(methodValidation.error!)
          if (methodValidation.suggestion) {
            this.info(methodValidation.suggestion)
          }
          this.exitCode = 1
          return
        }
      }

      await this.projectDetector.validateProject()
      const projectInfo = await this.projectDetector.getProjectInfo()

      if (!projectInfo) {
        this.logger.error('Could not read project information')
        return
      }

      const endpointName = this.endpoint || StringUtils.toKebabCase(this.name)
      const methodName = (this.method || 'get').toLowerCase()

      const templateData = {
        name: this.name,
        description: this.componentDescription || `HTTP handler for ${this.name}`,
        method: methodName,
        tags: [],
        endpoint: endpointName,
      }

      if (this.dryRun) {
        this.info(`Would generate handler: ${StringUtils.toSnakeCase(this.name)}_handler.ts`)
        return
      }

      const content = await this.stubGenerator.generate('handler', templateData)
      const componentsDir = path.join(process.cwd(), projectInfo.srcDir, 'components')
      const fileName = `${StringUtils.toSnakeCase(this.name)}_handler.ts`

      const filePath = await this.stubGenerator.writeFile(content, fileName, componentsDir, { force: this.force })

      this.success(`Generated handler: ${path.relative(process.cwd(), filePath)}`)
      this.info(`Handler will be available at ${methodName.toUpperCase()} /api/${endpointName}`)
      this.info('Remember to add it to your DigitalTwinEngine configuration!')
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      this.logger.error(`Failed to generate handler: ${message}`)
      this.exitCode = 1
    }
  }
}
