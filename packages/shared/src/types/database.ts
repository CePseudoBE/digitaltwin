/**
 * Database-related types shared across packages.
 */

/**
 * Structure used to store metadata about a data blob in the database.
 *
 * MetadataRow represents a single row in a component's database table,
 * linking stored binary data (via URL) with its metadata. Extended to
 * support asset-specific fields for AssetsManager components.
 */
export interface MetadataRow {
    /** Unique identifier of the data row (auto-generated on insert) */
    id?: number
    /** Logical name of the data source (component name, used as table identifier) */
    name: string
    /** MIME type of the associated blob (e.g. 'application/json', 'model/gltf-binary') */
    type: string
    /** Path or URL where the blob is stored (resolved by the StorageService) */
    url: string
    /** Timestamp indicating when the data was collected or uploaded */
    date: Date

    // ========== Asset-specific fields (optional) ==========
    /** Human-readable description of the asset (AssetsManager only) */
    description?: string
    /** Source URL for data provenance (AssetsManager only) */
    source?: string
    /** ID of the user who owns this asset (AssetsManager only) */
    owner_id?: number | null
    /** Original filename provided by the user (AssetsManager only) */
    filename?: string
    /** Whether the asset is publicly accessible (AssetsManager only) */
    is_public?: boolean
}
