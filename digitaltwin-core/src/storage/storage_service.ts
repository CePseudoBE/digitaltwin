/**
 * Abstract base class for storage service implementations.
 *
 * Defines the contract for persisting and retrieving binary data in the Digital Twin framework.
 * Concrete implementations provide storage backends like local filesystem, AWS S3, Azure Blob, etc.
 *
 * @abstract
 * @class StorageService
 *
 * @example
 * ```typescript
 * // Implement for specific storage backend
 * class S3StorageService extends StorageService {
 *   async save(buffer: Buffer, collectorName: string, extension?: string): Promise<string> {
 *     // Upload to S3 bucket
 *     return 's3://bucket/path/to/file'
 *   }
 *
 *   async retrieve(path: string): Promise<Buffer> {
 *     // Download from S3
 *     return buffer
 *   }
 *
 *   async delete(path: string): Promise<void> {
 *     // Delete from S3
 *   }
 * }
 * ```
 */
export abstract class StorageService {
    /**
     * Persists binary data and returns a unique identifier for retrieval.
     *
     * The storage implementation should ensure the returned path/URL is unique
     * and can be used later to retrieve the exact same data.
     *
     * @abstract
     * @param {Buffer} buffer - Binary data to store
     * @param {string} collectorName - Component name for organizing storage (used as folder/prefix)
     * @param {string} extension - Optional file extension for proper content handling
     * @returns {Promise<string>} Unique storage identifier (path, URL, or key)
     * @throws {Error} When storage operation fails
     *
     * @example
     * ```typescript
     * const buffer = Buffer.from('{"temperature": 23.5}')
     * const path = await storage.save(buffer, 'weather-sensor', 'json')
     * // Returns: '/storage/weather-sensor/2024-01-15_14-30-00.json'
     * ```
     */
    abstract save(buffer: Buffer, collectorName: string, extension?: string): Promise<string>

    /**
     * Retrieves previously stored binary data.
     *
     * Uses the identifier returned by save() to fetch the original data.
     *
     * @abstract
     * @param {string} path - Storage identifier from save() operation
     * @returns {Promise<Buffer>} The original binary data
     * @throws {Error} When file doesn't exist or retrieval fails
     *
     * @example
     * ```typescript
     * const path = '/storage/weather-sensor/2024-01-15_14-30-00.json'
     * const data = await storage.retrieve(path)
     * const json = JSON.parse(data.toString())
     * ```
     */
    abstract retrieve(path: string): Promise<Buffer>

    /**
     * Removes stored data permanently.
     *
     * Deletes the data associated with the given storage identifier.
     *
     * @abstract
     * @param {string} path - Storage identifier from save() operation
     * @returns {Promise<void>}
     * @throws {Error} When deletion fails or path doesn't exist
     *
     * @example
     * ```typescript
     * const path = '/storage/weather-sensor/old-data.json'
     * await storage.delete(path)
     * ```
     */
    abstract delete(path: string): Promise<void>

    /**
     * Persists binary data at a specific path (no auto-generated filename).
     *
     * Unlike save(), this method stores the file at the exact path specified,
     * preserving the original filename and directory structure.
     * Useful for extracting archives where file paths must be preserved.
     *
     * @param {Buffer} buffer - Binary data to store
     * @param {string} relativePath - Full relative path including filename (e.g., 'tilesets/123/tileset.json')
     * @returns {Promise<string>} The same path that was provided (for consistency)
     * @throws {Error} When storage operation fails
     *
     * @example
     * ```typescript
     * const buffer = Buffer.from('{"asset": {"version": "1.0"}}')
     * const path = await storage.saveWithPath(buffer, 'tilesets/123/tileset.json')
     * // Returns: 'tilesets/123/tileset.json'
     * ```
     */
    abstract saveWithPath(buffer: Buffer, relativePath: string): Promise<string>

    /**
     * Deletes multiple files in batch for better performance.
     *
     * Default implementation calls delete() sequentially, but storage backends
     * can override this with optimized bulk delete operations (e.g., S3 DeleteObjects).
     *
     * @param {string[]} paths - Array of storage identifiers to delete
     * @returns {Promise<void>}
     *
     * @example
     * ```typescript
     * await storage.deleteBatch([
     *   'tilesets/123/tileset.json',
     *   'tilesets/123/tile_0.b3dm',
     *   'tilesets/123/tile_1.b3dm'
     * ])
     * ```
     */
    async deleteBatch(paths: string[]): Promise<void> {
        // Default sequential implementation - subclasses can override with bulk operations
        await Promise.all(paths.map(path => this.delete(path).catch(() => {})))
    }

    /**
     * Returns the public URL for a stored file.
     *
     * For cloud storage (S3, OVH, Azure), this returns the direct HTTP URL.
     * For local storage, this may return a relative path or throw an error.
     *
     * @abstract
     * @param {string} relativePath - The storage path/key of the file
     * @returns {string} The public URL to access the file directly
     *
     * @example
     * ```typescript
     * const url = storage.getPublicUrl('tilesets/123/tileset.json')
     * // Returns: 'https://bucket.s3.region.cloud.ovh.net/tilesets/123/tileset.json'
     * ```
     */
    abstract getPublicUrl(relativePath: string): string

    /**
     * Deletes all files under a given prefix/folder.
     *
     * This is more efficient than deleteBatch() when you don't know all file paths,
     * as it lists objects by prefix and deletes them in bulk.
     * Useful for deleting entire tilesets or component data.
     *
     * @abstract
     * @param {string} prefix - The folder/prefix to delete (e.g., 'tilesets/123')
     * @returns {Promise<number>} Number of files deleted
     *
     * @example
     * ```typescript
     * const count = await storage.deleteByPrefix('tilesets/123')
     * // Deletes all files starting with 'tilesets/123/'
     * console.log(`Deleted ${count} files`)
     * ```
     */
    abstract deleteByPrefix(prefix: string): Promise<number>
}
