// Storage service base class and factory
export { StorageService } from './storage_service.js'
export type { PresignedUploadResult, ObjectExistsResult } from './storage_service.js'
export { StorageServiceFactory } from './storage_factory.js'

// Storage adapters
export { LocalStorageService } from './adapters/local_storage_service.js'
export { S3StorageService } from './adapters/s3_storage_service.js'
export type { S3StorageConfig } from './adapters/s3_storage_service.js'
