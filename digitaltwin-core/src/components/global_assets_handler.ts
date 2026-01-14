import { Handler } from './handler.js'
import type { ComponentConfiguration, DataResponse } from './types.js'
import type { AssetsManager } from './assets_manager.js'

/**
 * Global assets handler that provides access to ALL assets across ALL asset managers.
 *
 * This handler aggregates assets from all registered AssetsManager instances
 * without duplicating their logic or hardcoding component names.
 *
 * @class GlobalAssetsHandler
 * @extends {Handler}
 *
 * @example
 * ```typescript
 * const globalHandler = new GlobalAssetsHandler()
 * globalHandler.setAssetsManagers([gltfManager, pointcloudManager])
 *
 * // Usage:
 * // GET /assets/all - Returns all assets from all managers
 * ```
 */
export class GlobalAssetsHandler extends Handler {
    private assetsManagers: AssetsManager[] = []

    /**
     * Inject AssetsManager dependencies (called by engine)
     */
    setAssetsManagers(assetsManagers: AssetsManager[]): void {
        this.assetsManagers = assetsManagers
    }

    /**
     * Component configuration for the global assets handler
     */
    getConfiguration(): ComponentConfiguration {
        return {
            name: 'global_assets',
            description: 'Global handler for all assets across all managers',
            contentType: 'application/json',
            tags: ['assets', 'global', 'all']
        }
    }

    /**
     * Get all assets from all registered asset managers.
     *
     * This method delegates to each AssetsManager's getAllAssets() method
     * and aggregates the results with proper endpoint URLs.
     *
     * @returns {Promise<DataResponse>} JSON response with all assets
     *
     * @example
     * ```typescript
     * // GET /assets/all
     * // Returns: {
     * //   total: 5,
     * //   assets: [
     * //     { id: 1, component: "gltf", url: "/gltf/1", ... },
     * //     { id: 2, component: "pointcloud", url: "/pointcloud/2", ... }
     * //   ]
     * // }
     * ```
     */
    async getAllAssets(): Promise<DataResponse> {
        try {
            const allAssets = []

            // Iterate through all registered AssetsManager instances
            for (const manager of this.assetsManagers) {
                try {
                    const assets = await manager.getAllAssets()
                    const config = manager.getConfiguration()

                    // Transform assets to include component info and URLs
                    const transformedAssets = assets.map(asset => ({
                        id: asset.id,
                        component: config.name,
                        date: asset.date,
                        contentType: asset.contentType,
                        description: asset.description,
                        source: asset.source,
                        owner_id: asset.owner_id,
                        filename: asset.filename,
                        // Generate URLs using the manager's configuration
                        url: `/${config.endpoint}/${asset.id}`,
                        download_url: `/${config.endpoint}/${asset.id}/download`
                    }))

                    allAssets.push(...transformedAssets)
                } catch (error) {
                    // Skip this manager if it fails, don't break the whole operation
                    console.warn(`Failed to get assets from manager ${manager.getConfiguration().name}:`, error)
                    continue
                }
            }

            // Sort by date (newest first)
            allAssets.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

            return {
                status: 200,
                content: JSON.stringify({
                    total: allAssets.length,
                    assets: allAssets
                }),
                headers: { 'Content-Type': 'application/json' }
            }
        } catch (error) {
            return {
                status: 500,
                content: JSON.stringify({
                    error: error instanceof Error ? error.message : 'Unknown error'
                }),
                headers: { 'Content-Type': 'application/json' }
            }
        }
    }

    /**
     * HTTP endpoints for global assets
     */
    getEndpoints(): Array<{
        method: any
        path: string
        handler: (...args: any[]) => any
        responseType?: string
    }> {
        return [
            {
                method: 'get',
                path: '/assets/all',
                handler: this.getAllAssets.bind(this),
                responseType: 'application/json'
            }
        ]
    }
}
