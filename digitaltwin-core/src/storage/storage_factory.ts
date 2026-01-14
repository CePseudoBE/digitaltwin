/**
 * Factory class for creating the appropriate StorageService
 * implementation based on environment configuration.
 */
import { Env } from '../env/env.js'
import { OvhS3StorageService } from './adapters/ovh_storage_service.js'
import { LocalStorageService } from './adapters/local_storage_service.js'
import type { StorageService } from './storage_service.js'
import { safeAsync } from '../utils/safe_async.js'
import { Logger } from '../utils/logger.js'

const logger = new Logger('StorageFactory')

export class StorageServiceFactory {
    /**
     * Creates and returns an instance of StorageService
     * based on the STORAGE_CONFIG environment variable.
     *
     * - 'local': returns a LocalStorageService
     * - 'ovh': returns an OvhS3StorageService
     *
     * @throws Error if STORAGE_CONFIG is not supported
     */
    static create(): StorageService {
        const env = Env.config

        switch (env.STORAGE_CONFIG) {
            case 'local':
                return new LocalStorageService(env.LOCAL_STORAGE_DIR || 'data')

            case 'ovh': {
                const ovhStorage = new OvhS3StorageService({
                    accessKey: env.OVH_ACCESS_KEY,
                    secretKey: env.OVH_SECRET_KEY,
                    endpoint: env.OVH_ENDPOINT,
                    bucket: env.OVH_BUCKET,
                    region: env.OVH_REGION ?? 'gra'
                })
                // Configure CORS for browser access (non-blocking)
                safeAsync(() => ovhStorage.configureCors(), 'configure OVH CORS', logger)
                return ovhStorage
            }

            default:
                throw new Error(`Unsupported STORAGE_CONFIG: ${env.STORAGE_CONFIG}`)
        }
    }
}
