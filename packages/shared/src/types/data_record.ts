/**
 * @fileoverview Data record type definition for digital twin data storage
 *
 * This module defines the standardized interface for data records used
 * throughout the digital twin system for both streaming data and asset storage.
 */

/**
 * Standard data record interface for digital twin data storage.
 *
 * DataRecord provides a unified interface for all data stored in the digital twin system,
 * from streaming sensor data to asset files. It supports both database metadata
 * and file storage through a consistent API.
 *
 * @example
 * ```typescript
 * const record: DataRecord = {
 *   id: 12345,
 *   name: 'weather-station-001',
 *   date: new Date(),
 *   contentType: 'application/json',
 *   url: '/api/data/weather/12345',
 *   data: async () => Buffer.from(JSON.stringify(weatherData)),
 *   description: 'Weather data from station 001',
 *   source: 'https://api.weather.com/v1/current',
 *   owner_id: 123
 * };
 * ```
 */
export interface DataRecord {
    /** Unique identifier for this data record */
    id: number

    /** Human-readable name or identifier for this record */
    name: string

    /** Timestamp when this record was created or last updated */
    date: Date

    /** MIME type of the data content (e.g., 'application/json', 'image/png') */
    contentType: string

    /** URL or path where this record can be accessed */
    url: string

    /**
     * Function that returns the actual data content as a Buffer.
     *
     * This lazy-loading approach allows for efficient memory usage
     * when working with large datasets or files.
     *
     * @returns Promise resolving to the data content as a Buffer
     */
    data: () => Promise<Buffer>

    // ========== Asset-specific fields (optional) ==========

    /**
     * Human-readable description of the asset.
     *
     * Used primarily by AssetsManager components to provide
     * additional context about stored files and resources.
     */
    description?: string

    /**
     * Source URL for data provenance.
     *
     * Records the original source of this data for traceability
     * and debugging purposes. Used by AssetsManager components.
     */
    source?: string

    /**
     * ID of the user who owns this asset.
     *
     * Enables access control and ownership tracking for
     * asset management. Used by AssetsManager components.
     */
    owner_id?: number | null

    /**
     * Original filename provided by the user.
     *
     * Preserves the original filename when assets are uploaded
     * or imported. Used by AssetsManager components.
     */
    filename?: string

    /**
     * Whether the asset is publicly accessible.
     *
     * Controls visibility of assets. If true, asset can be accessed
     * by anyone. If false, only the owner can access it.
     * Used by AssetsManager components for access control.
     */
    is_public?: boolean

    // ========== TilesetManager support (optional) ==========

    /**
     * Public URL to tileset.json for Cesium loading.
     * Cesium accesses files directly via this URL.
     */
    tileset_url?: string

    // ========== Legacy: Multi-file asset support (deprecated) ==========

    /**
     * @deprecated No longer used. Kept for backward compatibility.
     */
    file_index?: {
        /** List of files with their storage paths */
        files: Array<{
            /** Storage path for this file */
            path: string
            /** Original filename */
            name: string
            /** File size in bytes */
            size?: number
        }>
        /** Main entry point file (e.g., 'tileset.json') */
        root_file?: string
    }

    // ========== Async upload support (optional) ==========

    /**
     * Status of async upload processing.
     * - 'pending': Job queued, waiting to start
     * - 'processing': Job is running
     * - 'completed': Job finished successfully
     * - 'failed': Job failed with error
     */
    upload_status?: 'pending' | 'processing' | 'completed' | 'failed' | null

    /**
     * Error message if upload failed.
     */
    upload_error?: string | null

    /**
     * BullMQ job ID for tracking.
     */
    upload_job_id?: string | null
}
