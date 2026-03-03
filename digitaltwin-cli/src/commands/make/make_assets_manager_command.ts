import { args, flags } from '@adonisjs/ace'
import { BaseCommand } from '../base_command.js'
import { StringUtils } from '../../utils/string_utils.js'
import { validateComponentName, validateContentType } from '../../utils/validators.js'
import path from 'path'

export class MakeAssetsManagerCommand extends BaseCommand {
  static override commandName = 'make:assets-manager'
  static override description = 'Generate a new assets manager component'

  @args.string({ description: 'Component name (PascalCase, e.g., ImageManager)' })
  declare name: string

  @flags.string({ description: 'Description of the assets manager', flagName: 'description', alias: 'd' })
  declare componentDescription: string | undefined

  @flags.string({ description: 'Content type (e.g., image/jpeg, application/pdf)', flagName: 'content-type', alias: 'c' })
  declare contentType: string | undefined

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

      // Validate content type if provided
      if (this.contentType) {
        const contentTypeValidation = validateContentType(this.contentType)
        if (!contentTypeValidation.valid) {
          this.logger.error(contentTypeValidation.error!)
          if (contentTypeValidation.suggestion) {
            this.info(contentTypeValidation.suggestion)
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
      const mimeType = this.contentType || 'application/octet-stream'

      const templateData = {
        name: this.name,
        description: this.componentDescription || `Assets manager for ${this.name}`,
        contentType: mimeType,
        tags: [],
        endpoint: endpointName,
      }

      if (this.dryRun) {
        this.info(`Would generate assets manager: ${StringUtils.toSnakeCase(this.name)}_assets_manager.ts`)
        return
      }

      const content = await this.stubGenerator.generate('assets_manager', templateData)
      const componentsDir = path.join(process.cwd(), projectInfo.srcDir, 'components')
      const fileName = `${StringUtils.toSnakeCase(this.name)}_assets_manager.ts`

      const filePath = await this.stubGenerator.writeFile(content, fileName, componentsDir, { force: this.force })

      this.success(`Generated assets manager: ${path.relative(process.cwd(), filePath)}`)
      this.info(`Content type: ${mimeType}`)
      this.info(`Assets will be available at GET /${endpointName}`)
      this.info(`Upload endpoint: POST /${endpointName}/upload`)
      this.info('Remember to add it to your DigitalTwinEngine configuration!')
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      this.logger.error(`Failed to generate assets manager: ${message}`)
      this.exitCode = 1
    }
  }
}
