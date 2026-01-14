import { args, flags } from '@adonisjs/ace'
import { BaseCommand } from '../base_command.js'
import { StringUtils } from '../../utils/string_utils.js'
import path from 'path'

export class MakeCollectorCommand extends BaseCommand {
  static commandName = 'make:collector'
  static description = 'Generate a new collector component'

  @args.string({ description: 'Component name' })
  declare name: string

  @flags.string({ description: 'Description of the collector', flagName: 'description', alias: 'd' })
  declare componentDescription: string | undefined

  @flags.string({ description: 'Cron schedule', flagName: 'schedule', alias: 's' })
  declare schedule: string | undefined

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

      const templateData = {
        name: this.name,
        description: this.componentDescription || `Data collector for ${this.name}`,
        schedule: this.schedule || '0 */5 * * * *',
        tags: [],
        endpoint: this.endpoint || StringUtils.toKebabCase(this.name),
      }

      if (this.dryRun) {
        this.info(`Would generate collector: ${StringUtils.toSnakeCase(this.name)}_collector.ts`)
        return
      }

      const content = await this.stubGenerator.generate('collector', templateData)
      const componentsDir = path.join(process.cwd(), projectInfo.srcDir, 'components')
      const fileName = `${StringUtils.toSnakeCase(this.name)}_collector.ts`

      const filePath = await this.stubGenerator.writeFile(content, fileName, componentsDir, { force: this.force })

      this.success(`Generated collector: ${path.relative(process.cwd(), filePath)}`)
      this.info('Remember to add it to your DigitalTwinEngine configuration!')
    } catch (error: any) {
      this.logger.error(`Failed to generate collector: ${error.message}`)
      this.exitCode = 1
    }
  }
}
