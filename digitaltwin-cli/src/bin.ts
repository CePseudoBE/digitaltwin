#!/usr/bin/env node

import { Kernel, ListLoader, HelpCommand } from '@adonisjs/ace'
import { MakeCollectorCommand } from './commands/make/make_collector_command.js'
import { MakeHandlerCommand } from './commands/make/make_handler_command.js'
import { MakeHarvesterCommand } from './commands/make/make_harvester_command.js'
import { MakeAssetsManagerCommand } from './commands/make/make_assets_manager_command.js'
import { MakeTilesetManagerCommand } from './commands/make/make_tileset_manager_command.js'
import { MakeMapManagerCommand } from './commands/make/make_map_manager_command.js'
import { OpenAPIGenerateCommand } from './commands/openapi/openapi_generate_command.js'

const kernel = Kernel.create()

kernel.defineFlag('help', {
  type: 'boolean',
  alias: 'h',
  description: 'Display help for the command',
})

kernel.on('help', async (command, $kernel, parsed) => {
  parsed.args.unshift(command.commandName)
  const help = new HelpCommand($kernel, parsed, kernel.ui, kernel.prompt)
  await help.exec()
  return $kernel.shortcircuit()
})

kernel.addLoader(
  new ListLoader([
    MakeCollectorCommand,
    MakeHandlerCommand,
    MakeHarvesterCommand,
    MakeAssetsManagerCommand,
    MakeTilesetManagerCommand,
    MakeMapManagerCommand,
    OpenAPIGenerateCommand,
  ])
)

kernel.info.set('binary', 'dt')

await kernel.handle(process.argv.slice(2))
