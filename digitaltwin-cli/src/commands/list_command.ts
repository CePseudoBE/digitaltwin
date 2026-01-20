import { BaseCommand } from './base_command.js'
import fs from 'fs-extra'
import path from 'path'

/**
 * Lists all components in the current Digital Twin project
 */
export class ListCommand extends BaseCommand {
  static override commandName = 'list'
  static override description = 'List all components in the current project'

  override async run(): Promise<void> {
    try {
      await this.projectDetector.validateProject()
      const projectInfo = await this.projectDetector.getProjectInfo()

      if (!projectInfo) {
        this.logger.error('Could not read project information')
        return
      }

      const componentsDir = path.join(process.cwd(), projectInfo.srcDir, 'components')

      if (!(await fs.pathExists(componentsDir))) {
        this.info('No components directory found.')
        this.info('Create components with: dt make:collector MyCollector')
        return
      }

      const files = await fs.readdir(componentsDir)

      const components = {
        collectors: [] as string[],
        harvesters: [] as string[],
        handlers: [] as string[],
        assetsManagers: [] as string[],
        tilesetManagers: [] as string[],
        mapManagers: [] as string[],
      }

      for (const file of files) {
        if (!file.endsWith('.ts') && !file.endsWith('.js')) continue

        if (file.endsWith('_collector.ts') || file.endsWith('_collector.js')) {
          components.collectors.push(file.replace(/_collector\.(ts|js)$/, ''))
        } else if (file.endsWith('_harvester.ts') || file.endsWith('_harvester.js')) {
          components.harvesters.push(file.replace(/_harvester\.(ts|js)$/, ''))
        } else if (file.endsWith('_handler.ts') || file.endsWith('_handler.js')) {
          components.handlers.push(file.replace(/_handler\.(ts|js)$/, ''))
        } else if (file.endsWith('_assets_manager.ts') || file.endsWith('_assets_manager.js')) {
          components.assetsManagers.push(file.replace(/_assets_manager\.(ts|js)$/, ''))
        } else if (file.endsWith('_tileset_manager.ts') || file.endsWith('_tileset_manager.js')) {
          components.tilesetManagers.push(file.replace(/_tileset_manager\.(ts|js)$/, ''))
        } else if (file.endsWith('_map_manager.ts') || file.endsWith('_map_manager.js')) {
          components.mapManagers.push(file.replace(/_map_manager\.(ts|js)$/, ''))
        }
      }

      const hasComponents = Object.values(components).some((arr) => arr.length > 0)

      if (!hasComponents) {
        this.info('No components found in this project.')
        this.info('\nCreate components with:')
        this.info('  dt make:collector MyCollector')
        this.info('  dt make:handler MyHandler')
        this.info('  dt make:harvester MyHarvester')
        this.info('  dt make:assets-manager MyAssets')
        return
      }

      this.info(`Components in ${projectInfo.name}:\n`)

      if (components.collectors.length) {
        this.logger.log(`Collectors (${components.collectors.length}):`)
        components.collectors.forEach((c) => this.logger.log(`  - ${c}`))
      }

      if (components.harvesters.length) {
        this.logger.log(`\nHarvesters (${components.harvesters.length}):`)
        components.harvesters.forEach((h) => this.logger.log(`  - ${h}`))
      }

      if (components.handlers.length) {
        this.logger.log(`\nHandlers (${components.handlers.length}):`)
        components.handlers.forEach((h) => this.logger.log(`  - ${h}`))
      }

      if (components.assetsManagers.length) {
        this.logger.log(`\nAssets Managers (${components.assetsManagers.length}):`)
        components.assetsManagers.forEach((a) => this.logger.log(`  - ${a}`))
      }

      if (components.tilesetManagers.length) {
        this.logger.log(`\nTileset Managers (${components.tilesetManagers.length}):`)
        components.tilesetManagers.forEach((t) => this.logger.log(`  - ${t}`))
      }

      if (components.mapManagers.length) {
        this.logger.log(`\nMap Managers (${components.mapManagers.length}):`)
        components.mapManagers.forEach((m) => this.logger.log(`  - ${m}`))
      }

      const total = Object.values(components).reduce((sum, arr) => sum + arr.length, 0)
      this.logger.log(`\nTotal: ${total} component(s)`)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      this.logger.error(`Failed to list components: ${message}`)
      this.exitCode = 1
    }
  }
}
