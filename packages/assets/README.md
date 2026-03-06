# @digitaltwin/assets

[![npm version](https://img.shields.io/npm/v/@digitaltwin/assets)](https://www.npmjs.com/package/@digitaltwin/assets)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

Asset lifecycle management for the Digital Twin framework -- upload, metadata, download, and deletion of files with user ownership and access control.

## Installation

```bash
pnpm add @digitaltwin/assets
```

This package depends on sibling workspace packages that must also be installed:

```
@digitaltwin/shared
@digitaltwin/database
@digitaltwin/storage
@digitaltwin/auth
```

## Managers

Three abstract manager classes cover different asset use cases. All extend `AssetsManager` and expose HTTP endpoints automatically when registered with the engine.

| Manager | Purpose | Storage | Upload method |
|---|---|---|---|
| `AssetsManager` | Generic file assets (images, documents, 3D models) | S3 + PostgreSQL metadata | Multipart or presigned URL |
| `TilesetManager` | 3D tilesets (Cesium 3D Tiles) | ZIP uploaded, extracted to individual files on S3 | Multipart (async via BullMQ) or presigned URL |
| `MapManager` | Map layers (GeoJSON, small payloads) | JSON stored directly in PostgreSQL | JSON body (no file upload) |

Each manager creates its own database table based on the `name` field in its configuration. Endpoints are mounted at the configured `endpoint` path.

## Upload Flows

### Classic Multipart Upload

Standard `multipart/form-data` upload through the backend. Suitable for small to medium files.

```
Client --POST multipart--> Backend --putObject--> S3
                              |
                              +--> Save metadata to PostgreSQL
```

### Presigned URL Upload

For large files (3D assets, tilesets). The file goes directly from the client to S3, bypassing the backend and API gateway entirely.

```
1. Client --POST /assets/upload-request--> Backend
   (fileName, fileSize, contentType)

2. Backend validates auth, creates DB record (status: pending),
   generates presigned PUT URL, returns { fileId, uploadUrl, expiresAt }

3. Client --PUT file--> S3 (using presigned URL)

4. Client --POST /assets/confirm/{fileId}--> Backend

5. Backend does HEAD on S3 to verify file exists --> status: completed
```

The `UploadReconciler` runs on a configurable interval (default: 5 minutes) to handle edge cases:

- Pending upload + file exists on S3 --> mark `completed`
- Pending upload + presigned URL expired + no file --> mark `expired`

### Async Tileset Processing

`TilesetManager` implements `AsyncUploadable`. When a ZIP archive is uploaded, extraction happens asynchronously via a BullMQ queue. The `UploadProcessor` worker picks up the job, extracts the ZIP, and stores individual files on S3.

## Usage

### Creating a Custom AssetsManager

```typescript
import { AssetsManager } from '@digitaltwin/assets'
import type { AssetsManagerConfiguration } from '@digitaltwin/shared'

class PhotoManager extends AssetsManager {
    getConfiguration(): AssetsManagerConfiguration {
        return {
            name: 'photos',
            description: 'Manage photo assets',
            contentType: 'image/jpeg',
            endpoint: 'api/photos',
            extension: '.jpg'
        }
    }
}

const manager = new PhotoManager()
manager.setDependencies(databaseAdapter, storageService)
```

This creates a `photos` table in the database and exposes endpoints at `/api/photos`.

### Creating a TilesetManager

```typescript
import { TilesetManager } from '@digitaltwin/assets'
import type { AssetsManagerConfiguration } from '@digitaltwin/shared'

class BuildingTilesets extends TilesetManager {
    getConfiguration(): AssetsManagerConfiguration {
        return {
            name: 'building-tilesets',
            description: '3D building tilesets',
            contentType: 'application/octet-stream',
            endpoint: 'api/tilesets/buildings',
            extension: '.zip'
        }
    }
}
```

### Presigned Upload Flow

```typescript
import { PresignedUploadService } from '@digitaltwin/assets'

// The PresignedUploadService is created automatically by AssetsManager.
// Client-side usage:

// 1. Request a presigned URL
const response = await fetch('/api/photos/upload-request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
        fileName: 'building.glb',
        fileSize: 52428800,
        contentType: 'model/gltf-binary'
    })
})
const { fileId, uploadUrl, expiresAt } = await response.json()

// 2. Upload directly to S3
await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'model/gltf-binary' },
    body: fileBlob
})

// 3. Confirm the upload
await fetch(`/api/photos/confirm/${fileId}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` }
})
```

### Setting Up the UploadReconciler

```typescript
import { UploadReconciler } from '@digitaltwin/assets'

const reconciler = new UploadReconciler(databaseAdapter, storageService, {
    intervalMs: 5 * 60 * 1000 // 5 minutes (default)
})

// Register tables to monitor
reconciler.registerTables(['photos', 'building-tilesets'])

// Start the reconciliation loop
reconciler.start()

// Stop on shutdown
reconciler.stop()
```

### Generating OpenAPI Specs

```typescript
import { generateAssetsOpenAPISpec } from '@digitaltwin/assets'

const spec = generateAssetsOpenAPISpec(manager.getConfiguration())
```

## Peer Dependencies

| Package | Required | Purpose |
|---|---|---|
| `bullmq` (>=5.0.0) | Optional | Async tileset upload processing via `UploadProcessor`. Only needed if you use `TilesetManager` with queue-based extraction. |

If `bullmq` is not installed, `AssetsManager` and `MapManager` work without it. `TilesetManager` falls back to synchronous extraction.

## API Endpoints

Each manager automatically exposes the following endpoints (prefixed by the configured `endpoint`):

| Method | Path | Description |
|---|---|---|
| `GET` | `/` | List assets (paginated) |
| `GET` | `/:id` | Get asset by ID |
| `POST` | `/` | Upload asset (multipart) |
| `PUT` | `/:id` | Update asset metadata |
| `DELETE` | `/:id` | Delete asset and file |
| `POST` | `/upload-request` | Request presigned upload URL |
| `POST` | `/confirm/:id` | Confirm presigned upload |

## License

MIT
