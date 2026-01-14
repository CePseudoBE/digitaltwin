import { args, flags } from '@adonisjs/ace'
import { BaseCommand } from '../base_command.js'
import { StringUtils } from '../../utils/string_utils.js'
import path from 'path'

export class MakeAssetsManagerCommand extends BaseCommand {
  static commandName = 'make:assets-manager'
  static description = 'Generate a new assets manager component'

  @args.string({ description: 'Component name' })
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

  async run(): Promise<void> {
    try {
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
    } catch (error: any) {
      this.logger.error(`Failed to generate assets manager: ${error.message}`)
      this.exitCode = 1
    }
  }
}
