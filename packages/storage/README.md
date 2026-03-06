# @digitaltwin/storage

[![npm version](https://img.shields.io/npm/v/@digitaltwin/storage)](https://www.npmjs.com/package/@digitaltwin/storage)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](../../LICENSE)

Abstract storage layer for the Digital Twin framework. Provides a unified API for persisting binary files (3D assets, collected data, tilesets) across local filesystem and S3-compatible cloud storage.

## Installation

```bash
pnpm add @digitaltwin/storage
```

For S3-compatible storage (OVH, AWS, MinIO), install the AWS SDK peer dependencies:

```bash
pnpm add @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
```

These are **optional** -- only required when using `OvhS3StorageService`. The local filesystem adapter has no additional dependencies.

## Adapters

| Feature | `LocalStorageService` | `OvhS3StorageService` |
|---|---|---|
| Backend | Local filesystem | S3-compatible (OVH, AWS, MinIO) |
| Presigned URLs | No | Yes |
| Batch delete | Sequential | S3 `DeleteObjects` (up to 1000/request) |
| Public URLs | File path (requires static serving) | Direct HTTPS URL |
| Path traversal protection | Yes | N/A (S3 key-based) |
| CORS configuration | N/A | Built-in `configureCors()` |
| Use case | Development / testing | Production |

## Usage

### Creating a storage service via factory

`StorageServiceFactory` reads the `STORAGE_CONFIG` environment variable and returns the appropriate adapter.

```typescript
import { StorageServiceFactory } from '@digitaltwin/storage'

// STORAGE_CONFIG=local  --> LocalStorageService
// STORAGE_CONFIG=ovh    --> OvhS3StorageService (requires OVH_* env vars)
const storage = StorageServiceFactory.create()
```

**Environment variables for `local`:**

| Variable | Default | Description |
|---|---|---|
| `STORAGE_CONFIG` | -- | Set to `local` |
| `LOCAL_STORAGE_DIR` | `data` | Base directory for file storage |

**Environment variables for `ovh`:**

| Variable | Default | Description |
|---|---|---|
| `STORAGE_CONFIG` | -- | Set to `ovh` |
| `OVH_ACCESS_KEY` | -- | S3 access key |
| `OVH_SECRET_KEY` | -- | S3 secret key |
| `OVH_ENDPOINT` | -- | S3 endpoint (e.g. `https://s3.gra.io.cloud.ovh.net`) |
| `OVH_BUCKET` | -- | Bucket name |
| `OVH_REGION` | `gra` | S3 region |

### Direct adapter instantiation

```typescript
import { LocalStorageService, OvhS3StorageService } from '@digitaltwin/storage'

// Local filesystem
const local = new LocalStorageService('./data')

// OVH S3-compatible storage
const s3 = new OvhS3StorageService({
    accessKey: 'your-access-key',
    secretKey: 'your-secret-key',
    endpoint: 'https://s3.gra.io.cloud.ovh.net',
    bucket: 'my-bucket',
    region: 'gra'
})
```

### Storing and retrieving files

```typescript
// Store with auto-generated timestamp filename
const key = await storage.save(buffer, 'weather-sensor', 'json')
// --> 'weather-sensor/2026-03-06T10-30-00-000Z.json'

// Store at a specific path (preserves filename)
await storage.saveWithPath(buffer, 'tilesets/42/tileset.json')

// Retrieve
const data = await storage.retrieve(key)

// Delete
await storage.delete(key)

// Delete in batch (S3 adapter uses optimized bulk delete)
await storage.deleteBatch(['path/a.json', 'path/b.json'])

// Delete all files under a prefix
const count = await storage.deleteByPrefix('tilesets/42')

// Get public URL
const url = storage.getPublicUrl('tilesets/42/tileset.json')
// --> 'https://my-bucket.s3.gra.io.cloud.ovh.net/tilesets/42/tileset.json'
```

### Presigned URL upload flow

Presigned URLs allow clients to upload files directly to S3, bypassing the backend server entirely. This is essential for large files (3D assets, tilesets).

```typescript
// 1. Check if the storage backend supports presigned URLs
if (!storage.supportsPresignedUrls()) {
    throw new Error('Storage backend does not support presigned URLs')
}

// 2. Generate a presigned PUT URL (valid for 5 minutes by default)
const { url, key, expiresAt } = await storage.generatePresignedUploadUrl(
    'assets/uploads/model.glb',   // target key
    'model/gltf-binary',          // content type
    300                            // expiry in seconds (optional, default 300)
)

// 3. Return url + key to the client; client uploads directly via HTTP PUT

// 4. After upload, verify the file exists in storage
const { exists, contentLength, contentType } = await storage.objectExists(key)
```

### CORS configuration (S3 only)

For browser-based uploads via presigned URLs, the S3 bucket needs CORS rules. The factory configures this automatically, but you can also call it manually:

```typescript
await s3.configureCors(
    ['https://your-domain.be'],       // allowed origins
    ['GET', 'HEAD', 'PUT', 'POST'],   // allowed methods
    ['*', 'Authorization']            // allowed headers
)
```

## API Reference

### `StorageService` (abstract)

| Method | Returns | Description |
|---|---|---|
| `save(buffer, collectorName, extension?)` | `Promise<string>` | Store with auto-generated key |
| `saveWithPath(buffer, relativePath)` | `Promise<string>` | Store at exact path |
| `retrieve(path)` | `Promise<Buffer>` | Read file contents |
| `delete(path)` | `Promise<void>` | Delete single file |
| `deleteBatch(paths)` | `Promise<void>` | Delete multiple files |
| `deleteByPrefix(prefix)` | `Promise<number>` | Delete all files under prefix |
| `getPublicUrl(relativePath)` | `string` | Get public URL for file |
| `supportsPresignedUrls()` | `boolean` | Whether presigned URLs are supported |
| `generatePresignedUploadUrl(key, contentType, expiresIn?)` | `Promise<PresignedUploadResult>` | Generate presigned PUT URL |
| `objectExists(key)` | `Promise<ObjectExistsResult>` | Check if object exists with metadata |

### Types

```typescript
interface PresignedUploadResult {
    url: string       // presigned PUT URL
    key: string       // object key in storage
    expiresAt: Date   // URL expiration timestamp
}

interface ObjectExistsResult {
    exists: boolean
    contentLength?: number   // file size in bytes
    contentType?: string     // MIME type
}

interface OvhS3Config {
    accessKey: string
    secretKey: string
    endpoint: string   // e.g. 'https://s3.gra.io.cloud.ovh.net'
    region?: string    // e.g. 'gra' (default)
    bucket: string
}
```

## Peer Dependencies

| Package | Required for | Required? |
|---|---|---|
| `@aws-sdk/client-s3` >= 3.0.0 | `OvhS3StorageService` | Optional |
| `@aws-sdk/s3-request-presigner` >= 3.0.0 | Presigned URL generation | Optional |

The AWS SDK packages are only loaded by `OvhS3StorageService`. If you only use `LocalStorageService`, they are not needed.

## License

MIT
