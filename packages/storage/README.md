# @cepseudo/storage

[![npm version](https://img.shields.io/npm/v/@cepseudo/storage)](https://www.npmjs.com/package/@cepseudo/storage)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](../../LICENSE)

Abstract storage layer for the Digital Twin framework. Provides a unified API for persisting binary files (3D assets, collected data, tilesets) across local filesystem and S3-compatible cloud storage.

## Installation

```bash
pnpm add @cepseudo/storage
```

For S3-compatible storage (AWS S3, MinIO, Scaleway, ...), install the AWS SDK peer dependencies:

```bash
pnpm add @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
```

These are **optional** -- only required when using `S3StorageService`. The local filesystem adapter has no additional dependencies.

## Adapters

| Feature | `LocalStorageService` | `S3StorageService` |
|---|---|---|
| Backend | Local filesystem | S3-compatible (AWS S3, MinIO, Scaleway, ...) |
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
import { StorageServiceFactory } from '@cepseudo/storage'

// STORAGE_CONFIG=local  --> LocalStorageService
// STORAGE_CONFIG=s3     --> S3StorageService (requires S3_* env vars)
const storage = StorageServiceFactory.create()
```

**Environment variables for `local`:**

| Variable | Default | Description |
|---|---|---|
| `STORAGE_CONFIG` | -- | Set to `local` |
| `LOCAL_STORAGE_DIR` | `data` | Base directory for file storage |

**Environment variables for `s3`:**

| Variable | Default | Description |
|---|---|---|
| `STORAGE_CONFIG` | -- | Set to `s3` |
| `S3_ENDPOINT` | -- | S3 endpoint (e.g. `https://s3.eu-west-1.amazonaws.com`, `http://localhost:9000`) |
| `S3_BUCKET` | -- | Bucket name |
| `S3_ACCESS_KEY_ID` | -- | Access key |
| `S3_SECRET_ACCESS_KEY` | -- | Secret key |
| `S3_REGION` | `us-east-1` | Region |
| `S3_FORCE_PATH_STYLE` | `false` | Address the bucket in the path (`<endpoint>/<bucket>/<key>`) instead of the host; MinIO needs `true` |

### Direct adapter instantiation

```typescript
import { LocalStorageService, S3StorageService } from '@cepseudo/storage'

// Local filesystem
const local = new LocalStorageService('./data')

// S3-compatible storage
const s3 = new S3StorageService({
    accessKey: 'your-access-key',
    secretKey: 'your-secret-key',
    endpoint: 'https://s3.eu-west-1.amazonaws.com',
    bucket: 'my-bucket',
    region: 'eu-west-1'
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
// --> 'https://my-bucket.s3.eu-west-1.amazonaws.com/tilesets/42/tileset.json'
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

interface S3StorageConfig {
    accessKey: string
    secretKey: string
    endpoint: string     // e.g. 'https://s3.eu-west-1.amazonaws.com'
    region?: string      // default 'us-east-1'
    bucket: string
    pathStyle?: boolean  // bucket in the path instead of the host (MinIO), default false
}
```

## Peer Dependencies

| Package | Required for | Required? |
|---|---|---|
| `@aws-sdk/client-s3` >= 3.0.0 | `S3StorageService` | Optional |
| `@aws-sdk/s3-request-presigner` >= 3.0.0 | Presigned URL generation | Optional |

The AWS SDK packages are only loaded by `S3StorageService`. If you only use `LocalStorageService`, they are not needed.

## License

MIT
