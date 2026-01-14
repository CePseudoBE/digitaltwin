import { AssetsManager } from './assets_manager.js'
import type { DataResponse } from './types.js'
import { ApisixAuthParser } from '../auth/apisix_parser.js'

/**
 * Extended metadata for map layer assets
 */
export interface MapLayerMetadataRow {
    id?: number
    name: string
    type: string
    url: string
    date: Date
    description: string
    source: string
    owner_id: number | null
    filename: string
    // Map layer-specific metadata
    layer_type?: string
    layer_name?: string
    geometry_type?: string
    properties_count?: number
}

/**
 * Specialized Assets Manager for handling map layer data.
 *
 * Extends the base AssetsManager with specialized logic for:
 * - Processing JSON layer objects containing map data
 * - Extracting and analyzing layer metadata
 * - Storing layer-specific information
 *
 * Inherits all CRUD endpoints from AssetsManager:
 * - GET /{name} - List all layers
 * - POST /{name}/upload - Upload layer data (overridden)
 * - GET /{name}/:id - Get layer data
 * - PUT /{name}/:id - Update layer metadata
 * - DELETE /{name}/:id - Delete layer
 * - GET /{name}/:id/download - Download layer data
 */
export abstract class MapManager extends AssetsManager {
    /**
     * Override the upload handler to process JSON layer objects instead of files.
     *
     * Processes the layer data:
     * 1. Validates the layer object structure
     * 2. Extracts layer-specific metadata
     * 3. Stores the layer data as JSON
     *
     * @param req - HTTP request with layer JSON data
     * @returns DataResponse with upload result
     */
    async handleUpload(req: any): Promise<DataResponse> {
        try {
            if (!req || !req.body) {
                return {
                    status: 400,
                    content: JSON.stringify({
                        error: 'Invalid request: missing request body'
                    }),
                    headers: { 'Content-Type': 'application/json' }
                }
            }

            // Check authentication
            if (!ApisixAuthParser.hasValidAuth(req.headers || {})) {
                return {
                    status: 401,
                    content: JSON.stringify({
                        error: 'Authentication required'
                    }),
                    headers: { 'Content-Type': 'application/json' }
                }
            }

            // Parse authenticated user
            const authUser = ApisixAuthParser.parseAuthHeaders(req.headers || {})
            if (!authUser) {
                return {
                    status: 401,
                    content: JSON.stringify({
                        error: 'Invalid authentication headers'
                    }),
                    headers: { 'Content-Type': 'application/json' }
                }
            }

            // Find or create user in database
            const userRecord = await this.userService.findOrCreateUser(authUser)

            if (!userRecord.id) {
                return {
                    status: 500,
                    content: JSON.stringify({
                        error: 'Failed to retrieve user information'
                    }),
                    headers: { 'Content-Type': 'application/json' }
                }
            }

            const { layer, description } = req.body

            if (!layer) {
                return {
                    status: 400,
                    content: JSON.stringify({
                        error: 'Missing required field: layer (JSON object)'
                    }),
                    headers: { 'Content-Type': 'application/json' }
                }
            }

            // Validate layer structure
            if (typeof layer !== 'object' || layer === null) {
                return {
                    status: 400,
                    content: JSON.stringify({
                        error: 'Layer must be a valid JSON object'
                    }),
                    headers: { 'Content-Type': 'application/json' }
                }
            }

            // Analyze layer content
            const layerInfo = this.analyzeLayerContent(layer)

            const config = this.getConfiguration()
            const now = new Date()

            // Convert layer object to JSON string for storage
            const layerJson = JSON.stringify(layer, null, 2)
            const layerBuffer = Buffer.from(layerJson, 'utf-8')

            // Generate filename from layer name or use timestamp
            const filename = `${layerInfo.layer_name || 'layer'}_${Date.now()}.json`

            // Store layer data using framework pattern
            const url = await this.storage.save(layerBuffer, config.name, filename)

            // Create extended metadata with layer-specific fields
            const metadata: MapLayerMetadataRow = {
                name: config.name,
                type: config.contentType || 'application/json',
                url,
                date: now,
                description: description || layerInfo.description || 'Map layer',
                source: req.body.source || 'uploaded',
                owner_id: userRecord.id,
                filename,
                // Layer-specific metadata
                layer_type: layerInfo.layer_type,
                layer_name: layerInfo.layer_name,
                geometry_type: layerInfo.geometry_type,
                properties_count: layerInfo.properties_count
            }

            await this.db.save(metadata)

            return {
                status: 200,
                content: JSON.stringify({
                    message: 'Layer uploaded successfully',
                    layer_name: layerInfo.layer_name,
                    geometry_type: layerInfo.geometry_type,
                    properties_count: layerInfo.properties_count
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
     * Analyze layer content to extract metadata
     * @param layer - The layer object to analyze
     * @returns Layer metadata information
     */
    private analyzeLayerContent(layer: any): {
        layer_type: string
        layer_name: string
        geometry_type?: string
        properties_count: number
        description?: string
    } {
        // Default values
        let layer_type = 'unknown'
        let layer_name = 'layer'
        let geometry_type: string | undefined
        let properties_count = 0

        // Try to detect GeoJSON
        if (layer.type === 'FeatureCollection' && Array.isArray(layer.features)) {
            layer_type = 'geojson'
            layer_name = layer.name || 'geojson_layer'

            // Analyze first feature for geometry type
            if (layer.features.length > 0) {
                const firstFeature = layer.features[0]
                if (firstFeature.geometry && firstFeature.geometry.type) {
                    geometry_type = firstFeature.geometry.type.toLowerCase()
                }

                // Count properties in first feature
                if (firstFeature.properties) {
                    properties_count = Object.keys(firstFeature.properties).length
                }
            }
        }
        // Try to detect single GeoJSON Feature
        else if (layer.type === 'Feature' && layer.geometry) {
            layer_type = 'geojson_feature'
            layer_name = layer.properties?.name || 'feature'
            geometry_type = layer.geometry.type?.toLowerCase()
            properties_count = layer.properties ? Object.keys(layer.properties).length : 0
        }
        // Try to detect other common layer formats
        else if (layer.layers && Array.isArray(layer.layers)) {
            layer_type = 'layer_group'
            layer_name = layer.name || 'layer_group'
            properties_count = layer.layers.length
        }
        // Generic object
        else {
            layer_type = 'custom'
            layer_name = layer.name || layer.title || layer.id || 'custom_layer'
            properties_count = Object.keys(layer).length
        }

        // Extract description from various fields
        const description = layer.description || layer.desc || layer.summary

        return {
            layer_type,
            layer_name,
            geometry_type,
            properties_count,
            description
        }
    }

    /**
     * Override retrieve to include layer-specific metadata in the response
     */
    async retrieve(): Promise<DataResponse> {
        try {
            const assets = await this.getAllAssets()
            const config = this.getConfiguration()

            // Transform to include layer metadata
            const assetsWithMetadata = assets.map(asset => ({
                id: asset.id,
                name: asset.name,
                date: asset.date,
                contentType: asset.contentType,
                description: asset.description || '',
                source: asset.source || '',
                owner_id: asset.owner_id || null,
                filename: asset.filename || '',
                // Layer-specific fields
                layer_type: (asset as any).layer_type || '',
                layer_name: (asset as any).layer_name || '',
                geometry_type: (asset as any).geometry_type || null,
                properties_count: (asset as any).properties_count || 0,
                // URLs for frontend
                url: `/${config.endpoint}/${asset.id}`,
                download_url: `/${config.endpoint}/${asset.id}/download`
            }))

            return {
                status: 200,
                content: JSON.stringify(assetsWithMetadata),
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
}
