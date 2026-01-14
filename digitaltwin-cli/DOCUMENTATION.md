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
│   │   └── stub_generator.ts         # Tempura-based generator
│   ├── utils/             # Utility classes
│   │   ├── project_detector.ts       # Project validation
│   │   └── string_utils.ts          # Naming conventions
│   ├── services/          # Dependency injection
│   │   └── service_container.ts     # Service container
│   ├── cli/              # CLI orchestration
│   │   └── command_registry.ts      # Command registration
│   └── stubs/            # Template files
│       ├── collector.stub
│       ├── handler.stub
│       ├── harvester.stub
│       └── assets_manager.stub
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

### Tempura Integration

We use [Tempura](https://github.com/lukeed/tempura) for high-performance templating:

```typescript
export class StubGenerator {
  async generate(stubName: string, data: Record<string, any>): Promise<string> {
    const template = await fs.readFile(stubPath, 'utf8')
    const render = compile(template, { loose: true })
    
    const templateData = {
      ...data,
      // Auto-generate naming variants
      ...(data.name ? StringUtils.generateNamingVariants(data.name) : {})
    }
    
    return render(templateData)
  }
}
```

### Template Syntax

Templates use Handlebars-like syntax with Tempura features:

```handlebars
{{#expect name, className, endpoint, description, tags}}
import { {{ componentType }} } from 'digitaltwin-core'

{{#if description}}
/**
 * {{ description }}
 */
{{/if}}
export class {{ className }} extends {{ componentType }} {
  getConfiguration() {
    return {
      name: '{{ endpoint }}',
      description: '{{ description }}',
      tags: [{{#each tags as tag, index}}'{{ tag }}'{{#if index < tags.length - 1}}, {{/if}}{{/each}}]
    }
  }
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
    const packageJson = await fs.readJson(path.join(cwd, 'package.json'))
    const dependencies = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies
    }
    return 'digitaltwin-core' in dependencies
  }
  
  async validateProject(cwd: string): Promise<void> {
    if (!await this.isDigitalTwinProject(cwd)) {
      throw new Error('This command must be run inside a digitaltwin-core project')
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

1. Add `.stub` file in `stubs/` directory
2. Use Tempura syntax with `{{#expect}}` for required variables
3. Reference in command's `stubName` property

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
- Project structure (package.json with digitaltwin-core dependency)
- Component names (valid TypeScript identifiers)
- Required options (e.g., --source for harvesters)
- File overwrites (--force flag)

## Performance Considerations

### Template Compilation

- Templates are compiled once per generation
- Tempura provides high-performance rendering
- Naming utilities are cached per generation

### File Operations

- Async I/O operations throughout
- Directory creation with `fs.ensureDir()`
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