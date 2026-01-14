# Digital Twin Core Framework - Documentation

![Version](https://img.shields.io/badge/version-0.6.1-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-5.8+-blue)
![Node.js](https://img.shields.io/badge/Node.js-18+-green)
![License](https://img.shields.io/badge/license-MIT-green)

> **Minimalist TypeScript framework for collecting and handling data in Digital Twin projects**

## Table of Contents

- [Overview](#overview)
- [Quick Start](#quick-start)
- [Core Concepts](#core-concepts)
- [Components](#components)
- [Engine](#engine)
- [Storage & Database](#storage--database)
- [API Reference](#api-reference)
- [Examples](#examples)
- [Advanced Topics](#advanced-topics)
- [Best Practices](#best-practices)

## Overview

Digital Twin Core is a modern TypeScript framework designed to simplify data collection, processing, and management for Digital Twin applications. It provides a modular architecture with schedulable components, storage abstraction, and automatic HTTP endpoint generation.

### Key Features

- **Schedulable Collectors** - Fetch data from external sources on cron schedules
- **Data Harvesters** - Transform and process collected data with dependency management
- **HTTP Handlers** - Create custom API endpoints with decorators
- **Assets Management** - Upload, store, and manage file assets with metadata
- **Custom Table Management** - Structured data management with automatic CRUD and custom endpoints
- **Storage Abstraction** - Support for local filesystem and cloud storage (S3-compatible)
- **Database Integration** - Metadata indexing with Knex.js
- **Job Queues** - Background processing with BullMQ and Redis
- **Monitoring** - Built-in health checks and queue statistics

## Quick Start

### Project Setup (Recommended)

Use [create-digitaltwin](https://github.com/CePseudoBE/create-digitaltwin) to bootstrap new projects:

```bash
npm init digitaltwin my-project
cd my-project
npm install
npm run dev
```

This generates a complete project with digitaltwin-core configured and ready to use.

### Manual Installation

```bash
npm install digitaltwin-core
```

### Basic Setup

```typescript
import { DigitalTwinEngine } from 'digitaltwin-core'
import { StorageServiceFactory } from 'digitaltwin-core/storage'
import { KnexDatabaseAdapter } from 'digitaltwin-core/database'

// Create services
const storage = StorageServiceFactory.create()
const database = new KnexDatabaseAdapter({
  client: 'sqlite3',
  connection: ':memory:'
}, storage)

// Initialize engine
const engine = new DigitalTwinEngine({
  storage,
  database,
  server: { port: 3000 },
  logging: { level: LogLevel.INFO }
})

// Start the engine
await engine.start()
console.log('Digital Twin Engine running on port 3000')
```

### Component Generation

Use [digitaltwin-cli](https://github.com/CePseudoBE/digitaltwin-cli) in generated projects:

```bash
# The dt.js wrapper is included in projects created with create-digitaltwin
node dt make:collector WeatherCollector --description "Weather data collector"
node dt make:handler ApiHandler --method post
node dt make:harvester DataProcessor --source weather-collector
node dt make:assets-manager ImageManager --content-type "image/jpeg"
```

## Core Concepts

### Component Architecture

The framework is built around **Components** - modular pieces that handle specific data operations:

- **Collectors** - Fetch raw data from external sources
- **Harvesters** - Transform data from collectors 
- **Handlers** - Provide custom HTTP endpoints
- **Assets Managers** - Manage file uploads and downloads

### Data Flow

```
External API → Collector → Storage → Database (metadata)
                    ↓
              Harvester → Process → Storage → Database
                    ↓
              HTTP Endpoint → Client Application
```

### Scheduling

Components run on **cron schedules** managed by BullMQ:
- Automatic retry on failures
- Concurrent processing with worker pools
- Queue monitoring and statistics

## Components

### Collectors

Collectors automatically fetch data from external sources and expose it via HTTP endpoints.

#### Creating a Collector

```typescript
import { Collector, CollectorConfiguration } from 'digitaltwin-core'

class WeatherCollector extends Collector {
  getConfiguration(): CollectorConfiguration {
    return {
      name: 'weather-data',
      description: 'Collects weather information from OpenWeather API',
      contentType: 'application/json',
      endpoint: 'weather',
      tags: ['weather', 'api', 'sensors']
    }
  }

  getSchedule(): string {
    return '0 */15 * * * *' // Every 15 minutes
  }

  async collect(): Promise<Buffer> {
    const response = await fetch(`https://api.openweathermap.org/data/2.5/weather?q=Paris&appid=${process.env.API_KEY}`)
    const data = await response.json()
    
    return Buffer.from(JSON.stringify(data))
  }
}
```

#### Collector Features

- **Automatic Storage**: Data is stored with unique URLs
- **Metadata Indexing**: Searchable by name, date, content type
- **HTTP Endpoints**: `GET /weather` returns latest data
- **Event Emission**: Monitoring integration
- **Error Handling**: Built-in retry mechanisms

### Harvesters

Harvesters process data from collectors and other sources, with support for dependencies.

#### Creating a Harvester

```typescript
import { Harvester, HarvesterConfiguration } from 'digitaltwin-core'

class WeatherProcessor extends Harvester {
  getConfiguration(): HarvesterConfiguration {
    return {
      name: 'weather-processed',
      description: 'Processes raw weather data',
      contentType: 'application/json',
      endpoint: 'weather/processed',
      source: 'weather-data',
      source_range: 'last:1',
      dependencies: ['temperature-sensors'],
      dependenciesLimit: [5]
    }
  }

  getSchedule(): string {
    return '0 */30 * * * *' // Every 30 minutes
  }

  async harvest(sourceData: DataRecord | DataRecord[], dependencies: Record<string, DataRecord | DataRecord[]>): Promise<Buffer> {
    const weatherData = JSON.parse((await sourceData.data()).toString())
    const sensorData = dependencies['temperature-sensors'] as DataRecord[]
    
    // Process and combine data
    const processed = {
      timestamp: new Date(),
      external_temp: weatherData.main.temp,
      internal_temps: sensorData.map(s => JSON.parse(s.data().toString())),
      correlation: this.calculateCorrelation(weatherData, sensorData)
    }
    
    return Buffer.from(JSON.stringify(processed))
  }
}
```

#### Harvester Features

- **Source Dependencies**: Process data from specific collectors
- **Time Range Support**: Get historical data ranges
- **Multi-Source**: Combine data from multiple sources
- **Dependency Limits**: Control how much historical data to include

### Handlers

Handlers provide custom HTTP endpoints with full request/response control.

#### Creating a Handler

```typescript
import { Handler, servableEndpoint } from 'digitaltwin-core'

class StatsHandler extends Handler {
  getConfiguration() {
    return {
      name: 'stats-handler',
      description: 'Provides system statistics',
      contentType: 'application/json'
    }
  }

  @servableEndpoint({ path: '/stats/system', method: 'GET' })
  async getSystemStats(): Promise<DataResponse> {
    const stats = {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      timestamp: new Date()
    }
    
    return {
      status: 200,
      content: JSON.stringify(stats),
      headers: { 'Content-Type': 'application/json' }
    }
  }

  @servableEndpoint({ path: '/stats/components', method: 'GET' })
  async getComponentStats(): Promise<DataResponse> {
    // Custom logic here
    return {
      status: 200,
      content: JSON.stringify({ components: this.getActiveComponents() })
    }
  }
}
```

### Assets Managers

Assets Managers handle file uploads, storage, and metadata with RESTful APIs.

#### Creating an Assets Manager

```typescript
import { AssetsManager, ComponentConfiguration } from 'digitaltwin-core'

class GLTFAssetsManager extends AssetsManager {
  getConfiguration(): ComponentConfiguration {
    return {
      name: 'gltf',
      description: 'GLTF 3D models manager',
      contentType: 'model/gltf-binary',
      extension: '.glb', // Optional: restrict uploads to .glb files only
      tags: ['assets', '3d', 'gltf']
    }
  }
}

class DocumentsManager extends AssetsManager {
  getConfiguration(): ComponentConfiguration {
    return {
      name: 'documents',
      description: 'Document files manager',
      contentType: 'application/pdf',
      extension: '.pdf', // Optional: restrict uploads to .pdf files only
      tags: ['assets', 'documents', 'pdf']
    }
  }
}
```

#### Assets Manager Endpoints

Each Assets Manager automatically provides RESTful endpoints:

- `GET /{name}` - List all assets with metadata
- `POST /{name}/upload` - Upload new asset
- `GET /{name}/{id}` - Get asset content for display
- `GET /{name}/{id}/download` - Download asset with filename
- `PUT /{name}/{id}` - Update asset metadata
- `DELETE /{name}/{id}` - Delete asset

#### File Extension Validation

**New in v0.6.1**: Assets Managers now support file extension validation to improve security and data consistency.

When the `extension` property is specified in the configuration:
- **POST** `/upload` and **POST** `/upload-batch` endpoints validate uploaded files
- Files with incorrect extensions are rejected with a **400 Bad Request** response
- Validation is **case-insensitive** (`.GLB`, `.glb`, `.Glb` are all accepted)
- If no extension is configured, all file types are accepted

```typescript
// Example: Restrict to specific file types
class ImageManager extends AssetsManager {
  getConfiguration() {
    return {
      name: 'images',
      description: 'Image assets manager',
      contentType: 'image/jpeg',
      extension: '.jpg' // Only accept JPEG images
    }
  }
}

class ModelsManager extends AssetsManager {
  getConfiguration() {
    return {
      name: 'models',
      description: '3D models manager', 
      contentType: 'model/gltf-binary',
      extension: '.glb' // Only accept GLB files
    }
  }
}
```

**Error Response Example:**
```json
// POST /images/upload with a .png file
{
  "error": "Invalid file extension. Expected: .jpg"
}
```

#### Upload Example

```typescript
// POST /gltf/upload
{
  "description": "Building 3D model with textures",
  "source": "https://city-data.example.com/buildings",
  "owner_id": "user123",
  "filename": "building.glb",
  "file": "<binary data>"
}
```

### Custom Table Managers

Custom Table Managers provide powerful structured data management with automatic CRUD endpoints and support for custom business logic endpoints. They create custom database tables with configurable columns and expose RESTful APIs automatically.

#### Creating a Custom Table Manager

```typescript
import { CustomTableManager, StoreConfiguration } from 'digitaltwin-core'

class WMSLayersManager extends CustomTableManager {
  getConfiguration(): StoreConfiguration {
    return {
      name: 'wms_layers',
      description: 'Manage WMS layers for mapping applications',
      columns: {
        'wms_url': 'text not null',
        'layer_name': 'text not null',
        'description': 'text',
        'active': 'boolean default true',
        'projection': 'text default "EPSG:4326"',
        'created_by': 'text'
      },
      // Custom endpoints for business logic
      endpoints: [
        { path: '/add-layers', method: 'post', handler: 'addMultipleLayers' },
        { path: '/activate/:id', method: 'put', handler: 'toggleLayerStatus' },
        { path: '/search', method: 'get', handler: 'searchLayers' }
      ]
    }
  }

  // Custom endpoint: Add multiple layers at once
  async addMultipleLayers(req: any): Promise<DataResponse> {
    try {
      const { layers } = req.body
      const results = []
      
      for (const layerData of layers) {
        const id = await this.create({
          wms_url: layerData.url,
          layer_name: layerData.name,
          description: layerData.description || '',
          active: true,
          created_by: layerData.user || 'system'
        })
        results.push({ id, name: layerData.name })
      }
      
      return {
        status: 200,
        content: JSON.stringify({ 
          message: `Added ${results.length} layers successfully`,
          layers: results 
        }),
        headers: { 'Content-Type': 'application/json' }
      }
    } catch (error) {
      return {
        status: 400,
        content: JSON.stringify({ error: error.message }),
        headers: { 'Content-Type': 'application/json' }
      }
    }
  }

  // Custom endpoint: Toggle layer status
  async toggleLayerStatus(req: any): Promise<DataResponse> {
    try {
      const { id } = req.params
      const layer = await this.findById(parseInt(id))
      
      if (!layer) {
        return {
          status: 404,
          content: JSON.stringify({ error: 'Layer not found' }),
          headers: { 'Content-Type': 'application/json' }
        }
      }
      
      const newStatus = !layer.active
      await this.update(parseInt(id), { active: newStatus })
      
      return {
        status: 200,
        content: JSON.stringify({ 
          message: `Layer ${newStatus ? 'activated' : 'deactivated'}`,
          layer_id: id,
          active: newStatus
        }),
        headers: { 'Content-Type': 'application/json' }
      }
    } catch (error) {
      return {
        status: 500,
        content: JSON.stringify({ error: error.message }),
        headers: { 'Content-Type': 'application/json' }
      }
    }
  }
}
```

#### Custom Table Manager Features

- **Automatic Table Creation**: Custom database tables with configurable columns and SQL types
- **Standard CRUD Endpoints**: GET, POST, PUT, DELETE automatically generated
- **Custom Business Logic**: Add your own endpoints alongside the standard ones
- **Built-in Validation**: Query validation and field requirements
- **Advanced Search**: Multiple search methods with filtering capabilities
- **SQL Type Support**: text, varchar, integer, boolean, decimal, datetime with constraints

#### Automatic Endpoints

Each Custom Table Manager provides these endpoints automatically:

- `GET /{tableName}` - List all records
- `POST /{tableName}` - Create new record  
- `GET /{tableName}/{id}` - Get specific record
- `PUT /{tableName}/{id}` - Update specific record
- `DELETE /{tableName}/{id}` - Delete specific record

Plus any custom endpoints defined in the configuration.

#### SQL Types Supported

```typescript
columns: {
  // Text fields
  'name': 'text not null',
  'description': 'text',
  
  // Variable length strings  
  'sku': 'varchar(50) unique not null',
  'category': 'varchar(100)',
  
  // Numbers
  'quantity': 'integer default 0',
  'price': 'decimal not null',
  
  // Booleans
  'active': 'boolean default true',
  'published': 'boolean',
  
  // Dates
  'expires_at': 'datetime',
  'created_date': 'timestamp default current_timestamp'
}
```

#### Built-in Query Methods

Custom Table Managers provide powerful built-in methods for data operations:

```typescript
// Create operations
const id = await this.create({ name: 'Product', price: 29.99 })

// Read operations
const allRecords = await this.findAll()
const record = await this.findById(123)
const activeItems = await this.findByColumn('active', true)

// Advanced search with validation
const results = await this.findByColumns(
  { category: 'electronics', price: '>100' },
  { 
    required: ['category'],
    validate: (conditions) => {
      if (conditions.category.length < 2) {
        throw new Error('Category too short')
      }
    }
  }
)

// Update operations
await this.update(123, { price: 39.99, active: true })

// Delete operations  
await this.delete(123)
const deletedCount = await this.deleteByCondition({ active: false })
```

For complete documentation, see [CUSTOM_TABLE_MANAGER.md](./CUSTOM_TABLE_MANAGER.md).

## Engine

The `DigitalTwinEngine` orchestrates all components and provides the runtime environment.

### Engine Configuration

```typescript
const engine = new DigitalTwinEngine({
  // Required
  storage: storageService,
  database: databaseAdapter,
  
  // Optional components
  collectors: [weatherCollector, sensorCollector],
  harvesters: [weatherProcessor],
  handlers: [statsHandler],
  assetsManagers: [gltfManager, docsManager],
  
  // Server configuration
  server: {
    port: 3000,
    host: '0.0.0.0'
  },
  
  // Queue configuration
  queues: {
    multiQueue: true,
    workers: {
      collectors: 2,
      harvesters: 1
    }
  },
  
  // Redis for queues
  redis: {
    host: 'localhost',
    port: 6379
  },
  
  // Logging
  logging: {
    level: LogLevel.INFO,
    format: 'json'
  },
  
  // Development mode
  dryRun: false
})
```

### Engine Lifecycle

```typescript
// Validation (dry run)
const validation = await engine.validateConfiguration()
if (!validation.valid) {
  console.error('Configuration errors:', validation.engineErrors)
  process.exit(1)
}

// Start engine
await engine.start()
console.log(`Engine running on port ${engine.getPort()}`)

// Graceful shutdown
process.on('SIGTERM', async () => {
  await engine.stop()
  process.exit(0)
})
```

## Storage & Database

### Storage Services

#### Local Storage

```typescript
import { StorageServiceFactory } from 'digitaltwin-core/storage'

// Using factory
const storage = StorageServiceFactory.create() // Uses LOCAL_STORAGE_PATH .env var

// Direct instantiation
const storage = new LocalStorageService('/path/to/storage')
```

#### OVH Object Storage (S3-compatible)

```typescript
const storage = new OVHStorageService({
  endpoint: 'https://s3.rbx.io.cloud.ovh.net',
  region: 'rbx',
  bucket: 'my-bucket',
  accessKeyId: process.env.OVH_ACCESS_KEY,
  secretAccessKey: process.env.OVH_SECRET_KEY
})
```

### Database Adapter

```typescript
import { KnexDatabaseAdapter } from 'digitaltwin-core/database'

// SQLite (development)
const database = new KnexDatabaseAdapter({
  client: 'sqlite3',
  connection: {
    filename: './data.db'
  },
  useNullAsDefault: true
}, storage)

// PostgreSQL (production)
const database = new KnexDatabaseAdapter({
  client: 'pg',
  connection: {
    host: 'localhost',
    database: 'digitaltwin',
    user: 'postgres',
    password: 'password'
  }
}, storage)
```

## API Reference

### Component Base Classes

#### Component Interface

```typescript
interface Component<T = ComponentConfiguration> {
  getConfiguration(): T
  setDependencies?(db: DatabaseAdapter, storage: StorageService): void
}
```

#### Servable Interface

```typescript
interface Servable {
  getEndpoints(): Array<{
    method: HttpMethod
    path: string
    handler: (...args: any[]) => any
    responseType?: string
  }>
}
```

#### ScheduleRunnable Interface

```typescript
interface ScheduleRunnable {
  getSchedule(): string
  run(options?: Record<string, any>): Promise<Buffer | void>
}
```

### Data Types

#### DataRecord

```typescript
interface DataRecord {
  id: number
  name: string
  contentType: string
  url: string
  date: Date
  data(): Promise<Buffer>
  
  // Asset-specific fields
  description?: string
  source?: string
  owner_id?: string | null
  filename?: string
}
```

#### DataResponse

```typescript
interface DataResponse {
  status: number
  content: string | Buffer
  headers?: Record<string, string>
}
```

## Examples

### Complete Weather Station

```typescript
import { 
  DigitalTwinEngine, 
  Collector, 
  Harvester, 
  Handler,
  LogLevel 
} from 'digitaltwin-core'

// Weather data collector
class WeatherCollector extends Collector {
  getConfiguration() {
    return {
      name: 'weather',
      description: 'OpenWeather API collector',
      contentType: 'application/json',
      endpoint: 'weather'
    }
  }

  getSchedule() { return '0 */10 * * * *' } // Every 10 minutes

  async collect() {
    const response = await fetch(`https://api.openweathermap.org/data/2.5/weather?q=Paris&appid=${process.env.OPENWEATHER_API_KEY}`)
    return Buffer.from(await response.text())
  }
}

// Temperature trend analyzer
class TempTrendHarvester extends Harvester {
  getConfiguration() {
    return {
      name: 'temp-trends',
      description: 'Temperature trend analysis',
      contentType: 'application/json',
      endpoint: 'weather/trends',
      source: 'weather',
      source_range: 'last:6' // Last 6 records
    }
  }

  getSchedule() { return '0 0 * * * *' } // Every hour

  async harvest(sourceData) {
    const temps = sourceData.map(record => {
      const data = JSON.parse(record.data().toString())
      return { temp: data.main.temp, time: record.date }
    })

    const trend = this.calculateTrend(temps)
    return Buffer.from(JSON.stringify({ trend, samples: temps.length }))
  }
}

// API handler for custom endpoints
class WeatherHandler extends Handler {
  getConfiguration() {
    return {
      name: 'weather-api',
      description: 'Weather API endpoints'
    }
  }

  @servableEndpoint({ path: '/api/weather/current', method: 'GET' })
  async getCurrentWeather() {
    const latest = await this.db.getLatestByName('weather')
    const data = latest ? await latest.data() : Buffer.from('{}')
    
    return {
      status: 200,
      content: data,
      headers: { 'Content-Type': 'application/json' }
    }
  }
}

// Setup and start
async function main() {
  const storage = StorageServiceFactory.create()
  const database = new KnexDatabaseAdapter({
    client: 'sqlite3',
    connection: { filename: './weather.db' },
    useNullAsDefault: true
  }, storage)

  const engine = new DigitalTwinEngine({
    storage,
    database,
    collectors: [new WeatherCollector()],
    harvesters: [new TempTrendHarvester()],
    handlers: [new WeatherHandler()],
    server: { port: 3000 },
    logging: { level: LogLevel.INFO }
  })

  await engine.start()
  
  console.log('Weather station running!')
  console.log('- Weather data: http://localhost:3000/weather')
  console.log('- Trends: http://localhost:3000/weather/trends')
  console.log('- Current API: http://localhost:3000/api/weather/current')
}

main().catch(console.error)
```

### File Asset Management

```typescript
import { AssetsManager, DigitalTwinEngine } from 'digitaltwin-core'

// 3D Models manager
class ModelsManager extends AssetsManager {
  getConfiguration() {
    return {
      name: 'models',
      description: '3D model files',
      contentType: 'model/gltf-binary',
      extension: '.glb' // Only accept GLB files
    }
  }
}

// Documents manager  
class DocsManager extends AssetsManager {
  getConfiguration() {
    return {
      name: 'docs',
      description: 'PDF documents',
      contentType: 'application/pdf',
      extension: '.pdf' // Only accept PDF files
    }
  }
}

const engine = new DigitalTwinEngine({
  storage: StorageServiceFactory.create(),
  database: new KnexDatabaseAdapter(config, storage),
  assetsManagers: [
    new ModelsManager(),
    new DocsManager()
  ],
  server: { port: 3000 }
})

await engine.start()

// Available endpoints:
// POST /models/upload - Upload 3D model
// GET /models - List all models
// GET /models/123 - View model
// GET /models/123/download - Download model
// PUT /models/123 - Update metadata
// DELETE /models/123 - Delete model
```

## Advanced Topics

### Environment Configuration

```typescript
import { Env } from 'digitaltwin-core/.env'

const env = Env.validate({
  STORAGE_CONFIG: Env.schema.enum(['local', 'ovh']),
  DATABASE_URL: Env.schema.string(),
  REDIS_URL: Env.schema.string().optional(),
  LOG_LEVEL: Env.schema.enum(['DEBUG', 'INFO', 'WARN', 'ERROR']).default('INFO')
})

console.log('Storage:', env.STORAGE_CONFIG)
```

### Custom Storage Adapter

```typescript
import { StorageService } from 'digitaltwin-core'

class CustomStorageService extends StorageService {
  async save(buffer: Buffer, collectorName: string, extension?: string): Promise<string> {
    // Implement your storage logic
    const filename = `${collectorName}/${Date.now()}.${extension || 'bin'}`
    await this.customUpload(filename, buffer)
    return filename
  }

  async retrieve(path: string): Promise<Buffer> {
    return await this.customDownload(path)
  }

  async delete(path: string): Promise<void> {
    await this.customDelete(path)
  }
}
```

### Queue Monitoring

```typescript
// Monitor queue statistics
app.get('/api/queues/stats', async (req, res) => {
  if (engine.queueManager) {
    const stats = await engine.queueManager.getQueueStats()
    res.json(stats)
  } else {
    res.json({ error: 'No queue manager configured' })
  }
})

// Example response:
{
  "collectors": {
    "waiting": 2,
    "active": 1,
    "completed": 1543,
    "failed": 3
  },
  "harvesters": {
    "waiting": 0,
    "active": 0,
    "completed": 234,
    "failed": 1
  }
}
```

### Error Handling

```typescript
class RobustCollector extends Collector {
  async collect(): Promise<Buffer> {
    const maxRetries = 3
    let attempt = 0
    
    while (attempt < maxRetries) {
      try {
        const response = await fetch(this.apiUrl, { timeout: 5000 })
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }
        
        return Buffer.from(await response.text())
        
      } catch (error) {
        attempt++
        if (attempt >= maxRetries) {
          throw new Error(`Collection failed after ${maxRetries} attempts: ${error.message}`)
        }
        
        // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt)))
      }
    }
  }
}
```

## Best Practices

### 1. Component Organization

```typescript
// Group related components
src/
  components/
    weather/
      WeatherCollector.ts
      WeatherProcessor.ts  
      WeatherHandler.ts
    sensors/
      SensorCollector.ts
      SensorAnalyzer.ts
    assets/
      ImageManager.ts
      DocumentManager.ts
```

### 2. Configuration Management

```typescript
// Use environment-specific configs
const config = {
  development: {
    database: { client: 'sqlite3', connection: ':memory:' },
    logging: { level: LogLevel.DEBUG }
  },
  production: {
    database: { client: 'pg', connection: process.env.DATABASE_URL },
    logging: { level: LogLevel.WARN }
  }
}[process.env.NODE_ENV || 'development']
```

### 3. Testing Components

```typescript
import { test } from '@japa/runner'
import { WeatherCollector } from '../src/components/weather/WeatherCollector'

test('weather collector fetches data', async ({ assert }) => {
  const collector = new WeatherCollector()
  collector.setDependencies(mockDb, mockStorage)
  
  const result = await collector.collect()
  
  assert.isTrue(Buffer.isBuffer(result))
  assert.isAbove(result.length, 0)
})
```

### 4. Monitoring and Logging

```typescript
import { Logger, LogLevel } from 'digitaltwin-core'

class MonitoredCollector extends Collector {
  private logger = new Logger('WeatherCollector', LogLevel.INFO)
  
  async collect(): Promise<Buffer> {
    this.logger.info('Starting weather collection')
    
    try {
      const result = await this.fetchWeatherData()
      this.logger.info(`Collected ${result.length} bytes`)
      return result
      
    } catch (error) {
      this.logger.error('Collection failed', error)
      throw error
    }
  }
}
```

### 5. Graceful Shutdown

```typescript
class Application {
  private engine: DigitalTwinEngine
  
  async start() {
    this.engine = new DigitalTwinEngine(config)
    await this.engine.start()
    
    // Handle shutdown signals
    process.on('SIGTERM', () => this.shutdown())
    process.on('SIGINT', () => this.shutdown())
  }
  
  private async shutdown() {
    console.log('Shutting down gracefully...')
    
    try {
      await this.engine.stop()
      console.log('Shutdown complete')
      process.exit(0)
    } catch (error) {
      console.error('Shutdown error:', error)
      process.exit(1)
    }
  }
}
```

---

## Support & Contributing

- **GitHub**: [https://github.com/CePseudoBE/digital-twin-core](https://github.com/CePseudoBE/digital-twin-core)
- **Issues**: Report bugs and request features
- **License**: MIT - feel free to use in commercial projects

## Related Projects

- **[create-digitaltwin](https://github.com/CePseudoBE/create-digitaltwin)** - Project scaffolding CLI
- **[digitaltwin-cli](https://github.com/CePseudoBE/digitaltwin-cli)** - Component generation CLI

### Development Setup

```bash
git clone https://github.com/CePseudoBE/digital-twin-core
cd digital-twin-core
npm install
npm run dev  # Start TypeScript watcher
npm test     # Run test suite
```

---

*Built by [Axel Hoffmann](https://github.com/CePseudoBE)*