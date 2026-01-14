import { AssetsManager } from '../src/components/assets_manager.js'
import { AssetsConfiguration } from '../src/components/types.js'

/**
 * Example concrete implementation of AssetsManager
 * 
 * Environment variables for file uploads:
 * - TEMP_UPLOAD_DIR=/path/to/temp/directory (defaults to /tmp/digitaltwin-uploads)
 *   For large file uploads (>1GB), temporary files are stored on disk to avoid memory issues
 * 
 * - CORS_ORIGIN=http://localhost:3000,http://localhost:5173 (defaults to allow all origins)
 *   Configure allowed origins for CORS in production for security
 */
export class BasicAssetsManager extends AssetsManager {
    getConfiguration(): AssetsConfiguration {
        return {
            name: 'basic_assets',
            endpoint: 'assets',
            description: 'Basic assets manager for file uploads',
            contentType: 'application/octet-stream',
            tags: ['assets', 'files']
        }
    }
}