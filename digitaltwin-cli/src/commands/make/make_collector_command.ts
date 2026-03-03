import { args, flags } from '@adonisjs/ace'
import { BaseCommand } from '../base_command.js'
import { StringUtils } from '../../utils/string_utils.js'
import { validateComponentName, validateCronSchedule } from '../../utils/validators.js'
import path from 'path'

export class MakeCollectorCommand extends BaseCommand {
  static override commandName = 'make:collector'
  static override description = 'Generate a new collector component'

  @args.string({ description: 'Component name (PascalCase, e.g., WeatherData)' })
  declare name: string

  @flags.string({ description: 'Description of the collector', flagName: 'description', alias: 'd' })
  declare componentDescription: string | undefined

  @flags.string({ description: 'Cron schedule (e.g., "0 */5 * * * *")', flagName: 'schedule', alias: 's' })
  declare schedule: string | undefined

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

      // Validate cron schedule if provided
      if (this.schedule) {
        const scheduleValidation = validateCronSchedule(this.schedule)
        if (!scheduleValidation.valid) {
          this.logger.error(scheduleValidation.error!)
          if (scheduleValidation.suggestion) {
            this.info(scheduleValidation.suggestion)
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
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      this.logger.error(`Failed to generate collector: ${message}`)
      this.exitCode = 1
    }
  }
}
