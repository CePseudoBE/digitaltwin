/**
 * Factory class for creating the appropriate StorageService
 * implementation based on environment configuration.
 */
import { Env, safeAsync, Logger, parseBoolean } from '@cepseudo/shared'
import { S3StorageService } from './adapters/s3_storage_service.js'
import { LocalStorageService } from './adapters/local_storage_service.js'
import type { StorageService } from './storage_service.js'

const logger = new Logger('StorageFactory')

export class StorageServiceFactory {
    /**
     * Creates and returns an instance of StorageService
     * based on the STORAGE_CONFIG environment variable.
     *
     * - 'local': returns a LocalStorageService
     * - 's3': returns an S3StorageService configured from the S3_* variables
     *
     * @throws Error if STORAGE_CONFIG is not supported
     */
    static create(): StorageService {
        const env = Env.config

        switch (env.STORAGE_CONFIG) {
            case 'local':
                return new LocalStorageService(env.LOCAL_STORAGE_DIR || 'data')

            case 's3': {
                const s3Storage = new S3StorageService({
                    accessKey: env.S3_ACCESS_KEY_ID,
                    secretKey: env.S3_SECRET_ACCESS_KEY,
                    endpoint: env.S3_ENDPOINT,
                    bucket: env.S3_BUCKET,
                    region: env.S3_REGION,
                    pathStyle: parseBoolean(env.S3_FORCE_PATH_STYLE, 'S3_FORCE_PATH_STYLE'),
                    publicUrl: env.S3_PUBLIC_URL
                })
                // Configure CORS for browser access (non-blocking)
                safeAsync(
                    () => s3Storage.configureCors(['*'], ['GET', 'HEAD', 'PUT'], ['*', 'Authorization']),
                    'configure S3 CORS',
                    logger
                )
                return s3Storage
            }

            default:
                throw new Error(`Unsupported STORAGE_CONFIG: ${env.STORAGE_CONFIG}`)
        }
    }
}
