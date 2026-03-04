import type { DataRecord, DataResolver, MetadataRow } from '@digitaltwin/shared'

/**
 * Convert a DB metadata row to a full DataRecord with lazy-loaded blob.
 *
 * Also maps asset-specific fields if present (for AssetsManager components).
 */
export function mapToDataRecord(row: MetadataRow | any, dataResolver: DataResolver): DataRecord {
    return {
        id: row.id,
        name: row.name,
        date: new Date(row.date),
        contentType: row.type,
        url: row.url,
        data: () => dataResolver(row.url),

        // Asset-specific fields (optional, only for AssetsManager)
        description: row.description,
        source: row.source,
        owner_id: row.owner_id,
        filename: row.filename,
        // Default to true for backward compatibility with records created before is_public column
        // SQLite stores booleans as 0/1, so we normalize to proper boolean
        is_public: row.is_public === undefined || row.is_public === null ? true : Boolean(row.is_public),

        // TilesetManager support
        tileset_url: row.tileset_url || undefined,

        // Legacy (deprecated)
        file_index: row.file_index
            ? typeof row.file_index === 'string'
                ? JSON.parse(row.file_index)
                : row.file_index
            : undefined,

        // Async upload support
        upload_status: row.upload_status || null,
        upload_error: row.upload_error || null,
        upload_job_id: row.upload_job_id || null
    }
}
