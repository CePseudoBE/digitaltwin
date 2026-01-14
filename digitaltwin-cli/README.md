# digitaltwin-cli

CLI tools for Digital Twin projects - generate components, manage projects with ease.

## Quick Start

### Installation

```bash
npm install -g digitaltwin-cli
```

### Usage in a Digital Twin project

In projects created with [create-digitaltwin](https://github.com/CePseudoBE/create-digitaltwin), use the included `dt.js` wrapper:

```bash
# Generate a new collector
node dt make:collector WeatherCollector --description "Collects weather data"

# Generate a new handler with POST method
node dt make:handler ApiHandler --method post --description "Handles API requests"

# Generate a new harvester
node dt make:harvester DataProcessor --source weather-collector --description "Processes weather data"

# Generate a new assets manager
node dt make:assets-manager ImageManager --content-type "image/jpeg"
```

Or use the CLI directly if installed globally:

```bash
dt make:collector WeatherCollector --description "Collects weather data"
```

## Commands

### `make:collector <name>`

Generate a new collector component that collects data from external sources.

**Options:**
- `-d, --description <desc>` - Description of the collector
- `-s, --schedule <schedule>` - Cron schedule (default: every 5 minutes)
- `-t, --tags <tags>` - Comma-separated tags
- `--endpoint <endpoint>` - Custom endpoint name
- `--dry-run` - Show what would be generated
- `--force` - Overwrite existing files

**Example:**
```bash
dt make:collector WeatherCollector \
  --description "Collects weather data from OpenWeather API" \
  --schedule "0 */10 * * * *" \
  --tags "weather,api,external"
```

### `make:handler <name>`

Generate a new handler component that provides HTTP endpoints.

**Options:**
- `-d, --description <desc>` - Description of the handler
- `-t, --tags <tags>` - Comma-separated tags
- `--endpoint <endpoint>` - Custom endpoint name
- `-m, --method <method>` - HTTP method (get, post, put, delete)
- `--dry-run` - Show what would be generated
- `--force` - Overwrite existing files

**Example:**
```bash
dt make:handler UserHandler \
  --description "Manages user operations" \
  --method post \
  --tags "users,api"
```

### `make:harvester <name>`

Generate a new harvester component that processes collected data.

**Options:**
- `-d, --description <desc>` - Description of the harvester
- `-t, --tags <tags>` - Comma-separated tags
- `--endpoint <endpoint>` - Custom endpoint name
- `--source <source>` - Source collector to harvest from (required)
- `--dependencies <deps>` - Comma-separated list of dependency components
- `--source-range <range>` - Source range (number or time like "1h", "30m")
- `--trigger-mode <mode>` - Trigger mode: on-source or scheduled
- `--dry-run` - Show what would be generated
- `--force` - Overwrite existing files

**Example:**
```bash
dt make:harvester WeatherProcessor \
  --source weather-collector \
  --description "Processes and analyzes weather data" \
  --source-range "1h"
```

### `make:assets-manager <name>`

Generate a new assets manager component for handling file uploads and management.

**Options:**
- `-d, --description <desc>` - Description of the assets manager
- `-t, --tags <tags>` - Comma-separated tags
- `--endpoint <endpoint>` - Custom endpoint name
- `--content-type <type>` - MIME type for assets (default: application/octet-stream)
- `--dry-run` - Show what would be generated
- `--force` - Overwrite existing files

**Example:**
```bash
dt make:assets-manager ImageManager \
  --content-type "image/jpeg" \
  --description "Manages JPEG image uploads"
```

## Generated Files

All components are generated in `src/components/` with the following naming convention:
- Collectors: `{name}_collector.ts`
- Handlers: `{name}_handler.ts`
- Harvesters: `{name}_harvester.ts`
- Assets Managers: `{name}_assets_manager.ts`

## Project Structure

digitaltwin-cli works with projects created using [create-digitaltwin](https://github.com/CePseudoBE/create-digitaltwin). The CLI automatically:
- Detects if you're in a Digital Twin project
- Validates project structure
- Generates TypeScript files with proper imports
- Provides helpful reminders about adding components to your engine configuration

When you create a project with `create-digitaltwin`, a `dt.js` wrapper is automatically generated that calls `digitaltwin-cli`, making component generation seamless:

```bash
# In projects created with create-digitaltwin
node dt make:collector MyCollector
```

## Development

```bash
# Clone the repository
git clone https://github.com/your-repo/digitaltwin-cli.git
cd digitaltwin-cli

# Install dependencies
npm install

# Build the CLI
npm run build

# Test locally
npm link
```

## Related Projects

- [digitaltwin-core](https://github.com/CePseudoBE/digital-twin-core) - Core framework
- [create-digitaltwin](https://github.com/CePseudoBE/create-digitaltwin) - Project generator

## License

MIT © Hoffmann Axel

This project have been inspired by AdonisJS Ace CLI