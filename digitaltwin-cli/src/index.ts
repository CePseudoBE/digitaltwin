// Main exports for digitaltwin-cli package

// Base classes for extending
export { BaseCommand } from './commands/base_command.js'

// Utilities
export { StubGenerator } from './generators/stub_generator.js'
export { ProjectDetector } from './utils/project_detector.js'
export { StringUtils } from './utils/string_utils.js'

// Validators
export {
  validateComponentName,
  validateHttpMethod,
  validateCronSchedule,
  validateContentType,
  type ValidationResult,
  type HttpMethod,
} from './utils/validators.js'

// Commands (for programmatic usage)
export { MakeCollectorCommand } from './commands/make/make_collector_command.js'
export { MakeHandlerCommand } from './commands/make/make_handler_command.js'
export { MakeHarvesterCommand } from './commands/make/make_harvester_command.js'
export { MakeAssetsManagerCommand } from './commands/make/make_assets_manager_command.js'
export { MakeTilesetManagerCommand } from './commands/make/make_tileset_manager_command.js'
export { MakeMapManagerCommand } from './commands/make/make_map_manager_command.js'
export { OpenAPIGenerateCommand } from './commands/openapi/openapi_generate_command.js'
export { ListCommand } from './commands/list_command.js'
export { DoctorCommand } from './commands/doctor_command.js'
