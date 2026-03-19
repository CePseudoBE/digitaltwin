// Storage service base class and factory
export { StorageService } from './storage_service.js'
export type { PresignedUploadResult, ObjectExistsResult } from './storage_service.js'
export { StorageServiceFactory } from './storage_factory.js'

// Storage adapters
export { LocalStorageService } from './adapters/local_storage_service.js'
export { OvhS3StorageService } from './adapters/ovh_storage_service.js'
export type { OvhS3Config } from './adapters/ovh_storage_service.js'
