/**
 * Callback type for resolving data from a storage URL.
 *
 * Used by the database layer to lazily load blob data without
 * depending on a specific StorageService implementation.
 * This decouples LAYER 1 (database) from LAYER 1 (storage).
 *
 * @param url - The storage URL/path to resolve
 * @returns The raw data as a Buffer
 *
 * @example
 * ```typescript
 * // Create a DataResolver from a StorageService
 * const resolver: DataResolver = (url) => storage.retrieve(url)
 *
 * // Use in database adapter
 * const adapter = new KnexDatabaseAdapter(config, resolver)
 * ```
 */
export type DataResolver = (url: string) => Promise<Buffer>
