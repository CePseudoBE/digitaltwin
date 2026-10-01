# digitaltwin-cli Documentation

## Architecture Overview

digitaltwin-cli is built with an elegant, over-engineered architecture that prioritizes maintainability, extensibility, and developer experience.

### Core Architecture

```
digitaltwin-cli/
├── src/
│   ├── commands/           # Command implementations
│   │   ├── base_command.ts           # Abstract base class
│   │   └── make/                     # Make command family
│   │       ├── base_make_command.ts  # Base for generation commands
│   │       ├── make_collector_command.ts
│   │       ├── make_handler_command.ts
│   │       ├── make_harvester_command.ts
│   │       └── make_assets_manager_command.ts
│   ├── generators/         # Code generation logic
│   │   ├── stub_generator.ts         # Renders a template and writes the file
│   │   └── templates.ts              # One template function per component type
│   ├── utils/             # Utility classes
│   │   ├── project_detector.ts       # Project validation
│   │   └── string_utils.ts          # Naming conventions
│   ├── services/          # Dependency injection
│   │   └── service_container.ts     # Service container
│   └── cli/              # CLI orchestration
│       └── command_registry.ts      # Command registration
```

## Design Patterns

### 1. Command Pattern

Each CLI command is implemented as a separate class extending `BaseCommand`:

```typescript
export abstract class BaseCommand {
  abstract readonly name: string
  abstract readonly description: string
  
  constructor(protected services: ServiceContainer) {}
  
  abstract execute(...args: any[]): Promise<void>
  abstract setupCommand(command: Command): Command
}
```

### 2. Template Method Pattern

`BaseMakeCommand` provides a template for all generation commands:

```typescript
export abstract class BaseMakeCommand extends BaseCommand {
  abstract readonly componentType: string
  abstract readonly stubName: string
  
  async execute(name: string, options: any): Promise<void> {
    // Template method with common steps
    await this.validateProject()
    await this.generateComponent(name, options)
    this.showSuccessMessage()
  }
}
```

### 3. Dependency Injection

Services are injected through a simple container:

```typescript
export class ServiceContainer {
  private services = new Map<string, any>()
  
  register<T>(key: string, instance: T): void
  get<T>(key: string): T
  
  static async create(): Promise<ServiceContainer> {
    const container = new ServiceContainer()
    // Auto-wire services
    return container
  }
}
```

## Template System

Each component type is a function in `src/generators/templates.ts` that returns the source of the file as a template literal. Values coming from the command line go through `quote()`, so a quote in `--description` cannot break the generated code. A test generates every template and type-checks the result against the `@cepseudo/*` packages.

```typescript
function assetsManager(data: TemplateData): string {
  return `import { AssetsManager } from '@cepseudo/assets'

${docBlock(data.description)}export class ${StringUtils.toPascalCase(data.name)} extends AssetsManager {
  getConfiguration() {
    return {
      name: ${quote(data.endpoint)},
      description: ${quote(data.description ?? '')},
      contentType: ${quote(data.contentType || 'application/octet-stream')},
      endpoint: ${quote(data.endpoint)},
      tags: [${list(data.tags)}]
    }
  }
}
`
}
```

## Naming Conventions

### String Transformations

The CLI automatically handles naming conventions:

```typescript
export class StringUtils {
  static toPascalCase(str: string): string    // ApiCollector
  static toCamelCase(str: string): string     // apiCollector
  static toSnakeCase(str: string): string     // api_collector
  static toKebabCase(str: string): string     // api-collector
  
  static generateNamingVariants(name: string): {
    original: string      // "ApiCollector"
    className: string     // "ApiCollector"
    variableName: string  // "apiCollector"
    fileName: string      // "api_collector"
    endpoint: string      // "api-collector"
  }
}
```

### File Naming

Generated files follow consistent patterns:
- **Collectors**: `{snake_case}_collector.ts`
- **Handlers**: `{snake_case}_handler.ts`
- **Harvesters**: `{snake_case}_harvester.ts`
- **Assets Managers**: `{snake_case}_assets_manager.ts`

## Project Detection

### Validation Logic

The CLI automatically detects Digital Twin projects created with [create-digitaltwin](https://github.com/CePseudoBE/create-digitaltwin):

```typescript
export class ProjectDetector {
  async isDigitalTwinProject(cwd: string): Promise<boolean> {
    const packageJson = JSON.parse(await fs.readFile(path.join(cwd, 'package.json'), 'utf8'))
    const dependencies = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies
    }
    return '@cepseudo/engine' in dependencies
  }
  
  async validateProject(cwd: string): Promise<void> {
    if (!await this.isDigitalTwinProject(cwd)) {
      throw new Error('This command must be run inside a Digital Twin project')
    }
  }
}
```

Projects created with `create-digitaltwin` automatically include `digitaltwin-cli` as a dev dependency and provide the `dt.js` wrapper.

## Component Types

### Collector

Collects data from external sources on a schedule:

```typescript
export class MyCollector extends Collector {
  getConfiguration() {
    return {
      name: 'my-collector',
      description: 'Collects data from external API',
      contentType: 'application/json',
      endpoint: 'api/my-collector',
      tags: ['api', 'external']
    }
  }
  
  async collect(): Promise<Buffer> {
    // Implementation
  }
  
  getSchedule(): string {
    return '0 */5 * * * *' // Every 5 minutes
  }
}
```

### Handler

Provides HTTP endpoints using decorators:

```typescript
export class MyHandler extends Handler {
  getConfiguration() {
    return {
      name: 'my-handler',
      description: 'HTTP endpoint handler',
      contentType: 'application/json',
      endpoint: 'my-handler',
      tags: ['api', 'http']
    }
  }
  
  @servableEndpoint({ path: '/api/my-handler', method: 'get' })
  async handleRequest(): Promise<DataResponse> {
    // Implementation
  }
}
```

### Harvester

Processes data from collectors:

```typescript
export class MyHarvester extends Harvester {
  getUserConfiguration() {
    return {
      name: 'my-harvester',
      description: 'Processes collected data',
      contentType: 'application/json',
      endpoint: 'my-harvester',
      source: 'my-collector',
      tags: ['processing']
    }
  }
  
  async harvest(
    sourceData: DataRecord | DataRecord[],
    dependenciesData: Record<string, DataRecord | DataRecord[]>
  ): Promise<Buffer> {
    // Implementation
  }
}
```

### Assets Manager

Manages file uploads and assets:

```typescript
export class MyAssetsManager extends AssetsManager {
  getConfiguration() {
    return {
      name: 'my-assets',
      description: 'Manages image assets',
      contentType: 'image/jpeg',
      endpoint: 'my-assets',
      tags: ['assets', 'images']
    }
  }
}
```

## Extension Points

### Adding New Commands

1. Create command class extending `BaseCommand` or `BaseMakeCommand`
2. Register in `CommandRegistry.createCommands()`
3. Add stub template if needed

### Custom Templates

1. Add a function to `TEMPLATES` in `src/generators/templates.ts`
2. Quote user input with `quote()` / `list()`
3. Add it to the type-check test in `tests/templates.spec.ts`

### New Services

1. Create service class
2. Register in `ServiceContainer.create()`
3. Inject via `this.services.get('serviceName')`

## Testing

### Manual Testing

```bash
# Test in a digitaltwin project created with create-digitaltwin
node dt make:collector TestCollector --dry-run
node dt make:handler TestHandler --method post
node dt make:harvester TestHarvester --source test-collector
node dt make:assets-manager TestAssets --content-type "image/png"

# Or test with globally installed CLI
dt make:collector TestCollector --dry-run
```

### Validation

The CLI validates:
- Project structure (package.json with an @cepseudo/engine dependency)
- Component names (valid TypeScript identifiers)
- Required options (e.g., --source for harvesters)
- File overwrites (--force flag)

## Performance Considerations

### File Operations

- Async I/O operations throughout
- Directory creation with `fs.mkdir(dir, { recursive: true })`
- Atomic file writes

### Memory Usage

- Services are singletons in container
- Templates loaded on-demand
- No persistent state between commands

## Future Enhancements

### Planned Features

- `dt list` - List all components in project
- `dt serve` - Start development server
- `dt validate` - Validate project structure
- Custom template directories
- Component dependencies analysis
- Auto-import generation in index files

### Extensibility

The architecture supports:
- Plugin system for custom commands
- Multiple template directories
- Custom naming conventions
- Project-specific configurations