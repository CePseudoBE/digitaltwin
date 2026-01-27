import { flags } from '@adonisjs/ace'
import { BaseCommand } from '../base_command.js'
import { BarrelUpdater } from '../../utils/barrel_updater.js'
import path from 'path'

export class BarrelUpdateCommand extends BaseCommand {
    static override commandName = 'barrel:update'
    static override description = 'Update or generate the components barrel file (index.ts)'

    @flags.boolean({ description: 'Show what would be generated without creating files', flagName: 'dry-run' })
    declare dryRun: boolean

    @flags.boolean({ description: 'Show verbose output', flagName: 'verbose', alias: 'v' })
    declare verbose: boolean

    override async run(): Promise<void> {
        try {
            await this.projectDetector.validateProject()
            const projectInfo = await this.projectDetector.getProjectInfo()

            if (!projectInfo) {
                this.logger.error('Could not read project information')
                return
            }

            const updater = new BarrelUpdater({
                dryRun: this.dryRun,
                verbose: this.verbose,
                logger: (message) => this.info(message)
            })

            const componentsDir = path.join(process.cwd(), projectInfo.srcDir, 'components')
            const result = await updater.updateBarrel(componentsDir)

            if (this.dryRun) {
                this.info('=== DRY RUN - No files written ===')
                this.info('')
                this.info(`Would write to: ${result.filePath}`)
                this.info('')
                this.info('Components found:')

                if (result.components.length === 0) {
                    this.info('  (none)')
                } else {
                    for (const component of result.components) {
                        this.info(`  - ${component.className} (${component.type})`)
                    }
                }

                this.info('')
                this.info('Generated content:')
                this.info('---')
                console.log(result.content)
                this.info('---')
            } else {
                this.success(`Updated barrel file: ${path.relative(process.cwd(), result.filePath)}`)

                if (result.components.length === 0) {
                    this.info('No components found in components directory')
                } else {
                    this.info(`Registered ${result.components.length} component(s):`)
                    const byType = {
                        collector: result.components.filter(c => c.type === 'collector'),
                        harvester: result.components.filter(c => c.type === 'harvester'),
                        handler: result.components.filter(c => c.type === 'handler'),
                        assetsManager: result.components.filter(c => c.type === 'assetsManager'),
                        customTableManager: result.components.filter(c => c.type === 'customTableManager')
                    }

                    if (byType.collector.length) this.info(`  - ${byType.collector.length} collector(s)`)
                    if (byType.harvester.length) this.info(`  - ${byType.harvester.length} harvester(s)`)
                    if (byType.handler.length) this.info(`  - ${byType.handler.length} handler(s)`)
                    if (byType.assetsManager.length) this.info(`  - ${byType.assetsManager.length} assets manager(s)`)
                    if (byType.customTableManager.length) this.info(`  - ${byType.customTableManager.length} custom table manager(s)`)
                }
            }
        } catch (error: any) {
            this.logger.error(`Failed to update barrel file: ${error.message}`)
            this.exitCode = 1
        }
    }
}
