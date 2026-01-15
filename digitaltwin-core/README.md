# Digital Twin Core

Digital Twin Core is a minimalist TypeScript framework used to collect and process data for Digital Twin projects. It provides building blocks to create scheduled collectors, harvesters and HTTP handlers while abstracting storage and database access.

## Features

- **Collectors** - fetch regular data from APIs (typically JSON) based on a Buffer schedule, store it and expose it via GET endpoints.
- **Harvesters** – transform data collected by collectors, store the results and expose them via GET endpoints.
- **Handlers** – expose GET endpoints that directly return the result of the method defined in the decorator.
- **Assets Manager** – upload, store and manage file assets with metadata, providing RESTful endpoints for CRUD operations.
- **Custom Table Manager** – manage structured data in custom database tables with automatic CRUD endpoints and custom business logic endpoints.
- **Storage adapters** – currently local filesystem and OVH Object Storage via S3 API.
- **Database adapter** – implemented with [Knex](https://knexjs.org/) to index metadata.
- **Engine** – orchestrates components, schedules jobs with BullMQ and exposes endpoints via Express.
- **Authentication** – pluggable authentication system supporting API gateway headers, JWT tokens, or no-auth mode.

## Installation

```bash
pnpm add digitaltwin-core
```

The project requires Node.js 20 or later.

## Building

Compile the TypeScript sources to `dist/`:

```bash
npm run build
```

During development you can use the watcher:

```bash
npm run dev
```

## Running tests

The test suite uses [Japa](https://github.com/japa/runner). Run all tests with:

```bash
npm test
```

## Example usage

Below is a very small example showing how the engine may be instantiated. Storage and database implementations are selected through the provided factories.

```ts
import { DigitalTwinEngine } from './src/engine/digital_twin_engine.js';
import { StorageServiceFactory } from './src/storage/storage_factory.js';
import { KnexDatabaseAdapter } from './src/database/adapters/knex_database_adapter.js';
import { Env } from './src/.env/.env.js';

// Validate environment variables and bootstrap services
const env = Env.validate({
  STORAGE_CONFIG: Env.schema.enum(['local', 'ovh'])
});

const storage = StorageServiceFactory.create();
const database = new KnexDatabaseAdapter({ client: 'sqlite3', connection: ':memory:' }, storage);

const engine = new DigitalTwinEngine({ storage, database });
engine.start();
```

## Components

### Collectors

Collectors are scheduled components that fetch data from external sources at regular intervals. They implement a `collect()` method that returns a Buffer, which is then stored and exposed via HTTP endpoints.

**Key features:**
- Cron-based scheduling
- Automatic storage and metadata indexing
- HTTP GET endpoint for retrieving latest data
- Event emission on successful collection

### Assets Manager

The Assets Manager provides a complete solution for file asset management with metadata support. It's an abstract base class that can be extended for specific asset types.

**Key features:**
- File upload with metadata (description, source URL, owner, filename)
- RESTful CRUD operations via HTTP endpoints
- Content-type aware storage and retrieval
- Separate display and download endpoints
- Source URL validation for data provenance
- File extension validation for upload security
- Component isolation (each manager handles its own asset type)

**Available endpoints:**
- `GET /{assetType}` - List all assets with metadata
- `POST /{assetType}/upload` - Upload new asset with metadata
- `GET /{assetType}/{id}` - Retrieve asset content for display
- `GET /{assetType}/{id}/download` - Download asset with attachment headers
- `PUT /{assetType}/{id}` - Update asset metadata
- `DELETE /{assetType}/{id}` - Delete asset

**Example usage:**
```typescript
class GLTFAssetsManager extends AssetsManager {
  getConfiguration() {
    return {
      name: 'gltf',
      description: 'GLTF 3D models manager',
      contentType: 'model/gltf-binary',
      extension: '.glb', // Optional: restricts uploads to .glb files only
      tags: ['assets', '3d', 'gltf']
    }
  }
}
```

**File Extension Validation:**

When the `extension` property is set in the configuration, the Assets Manager will automatically validate uploaded files:
- POST `/upload` and POST `/upload-batch` endpoints will reject files that don't match the specified extension
- Validation is case-insensitive (`.GLB` and `.glb` are treated the same)
- If no extension is specified, all file types are accepted
- Error message clearly indicates the expected extension

```typescript
// Example with extension validation
class DocumentsManager extends AssetsManager {
  getConfiguration() {
    return {
      name: 'documents',
      description: 'PDF documents manager',
      contentType: 'application/pdf',
      extension: '.pdf' // Only PDF files allowed
    }
  }
}

// Upload attempt with wrong extension will return:
// Status: 400
// Error: "Invalid file extension. Expected: .pdf"
```

### Custom Table Manager

The Custom Table Manager provides a powerful solution for managing structured data with custom database tables. It automatically generates CRUD endpoints and supports custom business logic endpoints.

**Key features:**
- Custom database table creation with configurable columns and SQL types
- Automatic CRUD endpoints (GET, POST, PUT, DELETE)
- Custom business logic endpoints with full request/response control
- Query validation and field requirements
- Built-in search and filtering capabilities
- Support for complex data relationships

**Available endpoints (automatic):**
- `GET /{tableName}` - List all records
- `POST /{tableName}` - Create new record
- `GET /{tableName}/{id}` - Get specific record
- `PUT /{tableName}/{id}` - Update specific record
- `DELETE /{tableName}/{id}` - Delete specific record

**Example usage:**
```typescript
class WMSLayersManager extends CustomTableManager {
  getConfiguration() {
    return {
      name: 'wms_layers',
      description: 'Manage WMS layers for mapping applications',
      columns: {
        'wms_url': 'text not null',
        'layer_name': 'text not null',
        'description': 'text',
        'active': 'boolean default true',
        'created_by': 'text',
        'projection': 'text default "EPSG:4326"'
      },
      // Custom endpoints for business logic
      endpoints: [
        { path: '/add-layers', method: 'post', handler: 'addMultipleLayers' },
        { path: '/activate/:id', method: 'put', handler: 'toggleLayerStatus' },
        { path: '/search', method: 'get', handler: 'searchLayers' },
        { path: '/by-projection/:projection', method: 'get', handler: 'findByProjection' }
      ]
    }
  }

  // Custom endpoint: Add multiple layers at once
  async addMultipleLayers(req: any): Promise<DataResponse> {
    try {
      const { layers } = req.body
      const results = []
      
      for (const layerData of layers) {
        // Use built-in validation
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
          message: `Successfully added ${results.length} layers`,
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

  // Custom endpoint: Toggle layer active status
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

  // Custom endpoint: Advanced search with validation
  async searchLayers(req: any): Promise<DataResponse> {
    try {
      const { query, active_only, projection } = req.query
      const conditions: Record<string, any> = {}
      
      if (active_only === 'true') {
        conditions.active = true
      }
      
      if (projection) {
        conditions.projection = projection
      }
      
      // Use built-in search with validation
      const layers = await this.findByColumns(conditions, {
        validate: (conditions) => {
          if (query && query.length < 3) {
            throw new Error('Search query must be at least 3 characters long')
          }
        }
      })
      
      // Filter by text search if provided
      let results = layers
      if (query) {
        results = layers.filter(layer => 
          layer.layer_name.toLowerCase().includes(query.toLowerCase()) ||
          layer.description?.toLowerCase().includes(query.toLowerCase())
        )
      }
      
      return {
        status: 200,
        content: JSON.stringify({
          results,
          total: results.length,
          query: { query, active_only, projection }
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
}
```

**Generated endpoints for above example:**
- Standard CRUD: `GET /wms_layers`, `POST /wms_layers`, etc.
- Custom business logic: `POST /wms_layers/add-layers`, `PUT /wms_layers/activate/:id`, `GET /wms_layers/search`

**SQL Types supported:**
- `text` / `text not null` - Variable length text
- `varchar(255)` / `varchar(100) not null` - Fixed length text
- `integer` / `integer not null` - Whole numbers
- `boolean` / `boolean default true` - True/false values
- `datetime` / `timestamp` - Date and time values
- `real` / `decimal` / `float` - Decimal numbers

**Built-in query methods:**
- `findAll()` - Get all records
- `findById(id)` - Get specific record
- `findByColumn(column, value)` - Search by single column
- `findByColumns(conditions, validation)` - Advanced search with validation
- `create(data)` - Create new record
- `update(id, data)` - Update existing record
- `delete(id)` - Delete record

## Authentication

The framework supports multiple authentication modes:

- **Gateway** (default): Uses headers from API gateways (Apache APISIX, KrakenD)
- **JWT**: Direct JWT token validation
- **None**: Disabled for development/testing

### Gateway Mode (Default)

No configuration needed. The framework reads `x-user-id` and `x-user-roles` headers set by your API gateway.

### JWT Mode

```bash
export AUTH_MODE=jwt
export JWT_SECRET=your-secret-key
# Or for RSA: JWT_PUBLIC_KEY or JWT_PUBLIC_KEY_FILE
```

### Disable Authentication

```bash
export DIGITALTWIN_DISABLE_AUTH=true
# Or
export AUTH_MODE=none
```

For detailed configuration options, see [src/auth/README.md](src/auth/README.md).

## Project Scaffolding

Use [create-digitaltwin](https://github.com/CePseudoBE/create-digitaltwin) to quickly bootstrap new projects:

```bash
npm init digitaltwin my-project
cd my-project
npm install
npm run dev
```

Generated projects include [digitaltwin-cli](https://github.com/CePseudoBE/digitaltwin-cli) for component generation:

```bash
node dt make:collector WeatherCollector --description "Weather data collector"
node dt make:handler ApiHandler --method post
node dt make:harvester DataProcessor --source weather-collector
```

## Folder structure

- `src/` – framework sources
    - `auth/` – authentication providers and user management
    - `components/` – base classes for collectors, harvesters, handlers and assets manager
    - `engine/` – orchestration logic
    - `storage/` – storage service abstractions and adapters
    - `database/` – metadata database adapter
    - `env/` – environment configuration helper
- `tests/` – unit tests

---

This project is licensed under the MIT License.