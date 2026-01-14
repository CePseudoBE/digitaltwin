import { args, flags } from '@adonisjs/ace'
import { BaseCommand } from '../base_command.js'
import { StringUtils } from '../../utils/string_utils.js'
import path from 'path'

export class MakeHandlerCommand extends BaseCommand {
  static commandName = 'make:handler'
  static description = 'Generate a new handler component'

  @args.string({ description: 'Component name' })
  declare name: string

  @flags.string({ description: 'Description of the handler', flagName: 'description', alias: 'd' })
  declare componentDescription: string | undefined

  @flags.string({ description: 'HTTP method (get, post, put, delete)', flagName: 'method', alias: 'm' })
  declare method: string | undefined

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
    } catch (error: any) {
      this.logger.error(`Failed to generate handler: ${error.message}`)
      this.exitCode = 1
    }
  }
}
