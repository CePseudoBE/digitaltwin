import type { DataRecord, DataResolver, MetadataRow } from '@cepseudo/shared'

type FileIndex = NonNullable<DataRecord['file_index']>
type UploadStatus = NonNullable<DataRecord['upload_status']>

/**
 * Convert a DB metadata row to a full DataRecord with lazy-loaded blob.
 *
 * Also maps asset-specific fields if present (for AssetsManager components).
 */
export function mapToDataRecord(row: MetadataRow | Record<string, unknown>, dataResolver: DataResolver): DataRecord {
    // Driver rows are untyped: each value is kept as read, nulls included, so the API output stays the same
    const r: Record<string, unknown> = { ...row }
    return {
        id: r.id as number,
        name: r.name as string,
        date: new Date(r.date as string | number | Date),
        contentType: r.type as string,
        url: r.url as string,
        data: () => dataResolver(r.url as string),

        // Asset-specific fields (optional, only for AssetsManager)
        description: r.description as string | undefined,
        source: r.source as string | undefined,
        owner_id: r.owner_id as number | null | undefined,
        filename: r.filename as string | undefined,
        // Default to true for backward compatibility with records created before is_public column
        // SQLite stores booleans as 0/1, so we normalize to proper boolean
        is_public: r.is_public === undefined || r.is_public === null ? true : Boolean(r.is_public),

        // TilesetManager support
        tileset_url: (r.tileset_url as string | undefined) || undefined,

        // Presigned upload support
        presigned_key: (r.presigned_key as string | null | undefined) || null,
        presigned_expires_at: r.presigned_expires_at ? new Date(r.presigned_expires_at as string | Date) : null,

        // Legacy (deprecated)
        file_index: r.file_index
            ? ((typeof r.file_index === 'string' ? JSON.parse(r.file_index) : r.file_index) as FileIndex)
            : undefined,

        // Async upload support
        upload_status: (r.upload_status as UploadStatus | undefined) || null,
        upload_error: (r.upload_error as string | undefined) || null,
        upload_job_id: (r.upload_job_id as string | undefined) || null
    }
}
