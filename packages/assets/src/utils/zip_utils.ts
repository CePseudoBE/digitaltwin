import { fromBufferPromise } from 'yauzl'
import type { Entry, ZipFile } from 'yauzl'
import type { StorageService } from '@cepseudo/storage'
import { DigitalTwinError } from '@cepseudo/shared'

/**
 * Result of extracting and storing a ZIP archive
 */
export interface ExtractedArchiveResult {
    /** The root/main file path (e.g., 'tileset.json') */
    root_file?: string
    /** Total number of files extracted */
    file_count: number
}

/** Bounds applied to every archive before anything is inflated. */
export interface ZipLimits {
    /** Maximum number of files in the archive (directories do not count) */
    maxEntries?: number
    /** Maximum total uncompressed size, in bytes */
    maxTotalBytes?: number
    /** Maximum uncompressed size of a single file, in bytes */
    maxEntryBytes?: number
}

export const DEFAULT_ZIP_LIMITS: Required<ZipLimits> = {
    maxEntries: 10_000,
    maxTotalBytes: 2 * 1024 ** 3, // 2 GB
    maxEntryBytes: 500 * 1024 ** 2, // 500 MB
}

/** Thrown when an archive exceeds a ZipLimits bound. Maps to HTTP 413. */
export class ZipLimitError extends DigitalTwinError {
    readonly code = 'ZIP_LIMIT_EXCEEDED' as const
    readonly statusCode = 413 as const
}

interface ArchiveEntry {
    entry: Entry
    path: string
}

/**
 * Opens the archive and lists its file entries from the central directory.
 * Nothing is inflated at this point; sizes come from the entry headers.
 */
async function openArchive(zipBuffer: Buffer): Promise<{ zipfile: ZipFile; entries: ArchiveEntry[] }> {
    const zipfile = await fromBufferPromise(zipBuffer, { lazyEntries: true, autoClose: false })
    const entries: ArchiveEntry[] = []

    await new Promise<void>((resolve, reject) => {
        zipfile.on('entry', (entry: Entry) => {
            if (!entry.fileName.endsWith('/')) entries.push({ entry, path: entry.fileName })
            zipfile.readEntry()
        })
        zipfile.on('end', resolve)
        zipfile.on('error', reject)
        zipfile.readEntry()
    })

    return { zipfile, entries }
}

/** Rejects the archive before any inflation when the declared sizes already break a limit. */
function assertWithinLimits(entries: ArchiveEntry[], limits: Required<ZipLimits>): void {
    if (entries.length > limits.maxEntries) {
        throw new ZipLimitError(`Archive contains ${entries.length} files, limit is ${limits.maxEntries}`, {
            limit: 'maxEntries',
            actual: entries.length,
        })
    }

    let total = 0
    for (const { entry, path } of entries) {
        if (entry.uncompressedSize > limits.maxEntryBytes) {
            throw new ZipLimitError(`"${path}" inflates to ${entry.uncompressedSize} bytes, limit is ${limits.maxEntryBytes}`, {
                limit: 'maxEntryBytes',
                path,
                actual: entry.uncompressedSize,
            })
        }
        total += entry.uncompressedSize
        if (total > limits.maxTotalBytes) {
            throw new ZipLimitError(`Archive inflates to more than ${limits.maxTotalBytes} bytes`, {
                limit: 'maxTotalBytes',
                actual: total,
            })
        }
    }
}

/**
 * Inflates one entry. The declared size is a hard cap: an entry that keeps
 * producing bytes past it is a lying header, so the stream is destroyed.
 */
async function inflateEntry(zipfile: ZipFile, entry: Entry): Promise<Buffer> {
    const stream = await zipfile.openReadStreamPromise(entry)
    const chunks: Buffer[] = []
    let size = 0

    for await (const chunk of stream as AsyncIterable<Buffer>) {
        size += chunk.length
        if (size > entry.uncompressedSize) {
            stream.destroy()
            throw new ZipLimitError(`"${entry.fileName}" inflates past its declared size of ${entry.uncompressedSize} bytes`, {
                limit: 'maxEntryBytes',
                path: entry.fileName,
            })
        }
        chunks.push(chunk)
    }

    return Buffer.concat(chunks)
}

const utf8 = new TextDecoder('utf-8', { fatal: true })

/** Text files come back as strings, anything that is not valid UTF-8 as a Buffer. */
function asTextOrBuffer(content: Buffer): string | Buffer {
    try {
        return utf8.decode(content)
    } catch {
        return content
    }
}

/**
 * Extracts the content of a zip file entry by entry, inflating one file at a time.
 * @param zipBuffer - The content of the zip file as Buffer
 * @param limits - Bounds on entry count and sizes; defaults to DEFAULT_ZIP_LIMITS
 * @returns A generator yielding tuples containing the name and content of each file in the zip file
 * @throws {ZipLimitError} Before the first entry when the archive exceeds a limit
 */
export async function* extractZipContentStream(
    zipBuffer: Buffer,
    limits: ZipLimits = {}
): AsyncGenerator<[string, string | Buffer]> {
    const { zipfile, entries } = await openArchive(zipBuffer)
    try {
        assertWithinLimits(entries, { ...DEFAULT_ZIP_LIMITS, ...limits })
        for (const { entry, path } of entries) {
            yield [path, asTextOrBuffer(await inflateEntry(zipfile, entry))]
        }
    } finally {
        zipfile.close()
    }
}

/**
 * Converts a zip file to a dictionary containing all files and their contents
 * @param zipBuffer - The content of the zip file as Buffer
 * @param limits - Bounds on entry count and sizes; defaults to DEFAULT_ZIP_LIMITS
 * @returns A dictionary containing the content of the zip file
 */
export async function zipToDict(zipBuffer: Buffer, limits: ZipLimits = {}): Promise<Record<string, string | Buffer>> {
    const output: Record<string, string | Buffer> = {}

    for await (const [name, content] of extractZipContentStream(zipBuffer, limits)) {
        output[name] = content
    }

    return output
}

/**
 * Detects the root file for 3D Tiles tilesets
 * Looks for tileset.json or similar entry point files
 * @param files - List of file paths in the archive
 * @returns The path to the root file, or undefined if not found
 */
export function detectTilesetRootFile(files: string[]): string | undefined {
    // Priority order for 3D Tiles root files
    const rootFilePatterns = [
        /^tileset\.json$/i,
        /\/tileset\.json$/i,
        /^[^/]+\/tileset\.json$/i, // One level deep
        /tileset\.json$/i // Any tileset.json as fallback
    ]

    for (const pattern of rootFilePatterns) {
        const match = files.find(f => pattern.test(f))
        if (match) return match
    }

    return undefined
}

/**
 * Normalizes file paths from ZIP archives
 * Removes leading directory if all files share the same root folder
 * @param files - Original file paths from the archive
 * @returns Normalized file paths (original -> normalized)
 */
export function normalizeArchivePaths(files: string[]): Map<string, string> {
    const pathMap = new Map<string, string>()

    // Check if all files share a common root directory
    const firstParts = files.map(f => f.split('/')[0])
    const commonRoot = firstParts.every(p => p === firstParts[0]) && firstParts[0] !== '' ? firstParts[0] : null

    for (const file of files) {
        if (commonRoot && file.startsWith(commonRoot + '/')) {
            // Remove the common root prefix
            pathMap.set(file, file.substring(commonRoot.length + 1))
        } else {
            pathMap.set(file, file)
        }
    }

    return pathMap
}

/**
 * Extracts a ZIP archive and stores each file individually using the storage service.
 *
 * This function:
 * 1. Lists the archive entries and checks them against the limits before inflating anything
 * 2. Normalizes paths (removes common root directory if present)
 * 3. Inflates and stores each file using the storage service with a unique base path
 * 4. Returns the root file path and file count
 *
 * Files are uploaded in parallel batches for performance; only one batch is inflated at a time.
 *
 * @param zipBuffer - The ZIP file content as a Buffer
 * @param storage - The storage service to use for saving files
 * @param basePath - Base path/folder for storing extracted files (e.g., 'tilesets/1234567890')
 * @param limits - Bounds on entry count and sizes; defaults to DEFAULT_ZIP_LIMITS
 * @returns ExtractedArchiveResult with root file and file count
 * @throws {ZipLimitError} When the archive exceeds a limit; nothing has been stored in that case
 *
 * @example
 * ```typescript
 * const result = await extractAndStoreArchive(zipBuffer, storage, 'tilesets/1234567890')
 * // result.root_file = 'tileset.json'
 * // result.file_count = 42
 * ```
 */
export async function extractAndStoreArchive(
    zipBuffer: Buffer,
    storage: StorageService,
    basePath: string,
    limits: ZipLimits = {}
): Promise<ExtractedArchiveResult> {
    const { zipfile, entries } = await openArchive(zipBuffer)

    try {
        assertWithinLimits(entries, { ...DEFAULT_ZIP_LIMITS, ...limits })

        const filePaths = entries.map(e => e.path)
        const byPath = new Map(entries.map(e => [e.path, e.entry]))

        // Normalize paths (remove common root if present)
        const normalizedPaths = normalizeArchivePaths(filePaths)

        // Detect root file before normalization, then get normalized path
        const rootFileOriginal = detectTilesetRootFile(filePaths)
        const rootFileNormalized = rootFileOriginal ? normalizedPaths.get(rootFileOriginal) : undefined

        // Inflate and store files in parallel (batched to bound memory and storage pressure)
        const PARALLEL_UPLOADS = 10
        const work = Array.from(normalizedPaths.entries())
        const totalFiles = work.length
        let uploadedCount = 0
        const uploadedPaths: string[] = []

        console.log(`[ZipUtils] Extracting ${totalFiles} files to ${basePath}`)

        try {
            const totalBatches = Math.ceil(totalFiles / PARALLEL_UPLOADS)
            // Log progress every 10% or at least every 10 batches
            const logInterval = Math.max(1, Math.floor(totalBatches / 10))

            for (let i = 0; i < work.length; i += PARALLEL_UPLOADS) {
                const batch = work.slice(i, i + PARALLEL_UPLOADS)
                const batchNum = Math.floor(i / PARALLEL_UPLOADS) + 1

                await Promise.all(
                    batch.map(async ([originalPath, normalizedPath]) => {
                        const content = await inflateEntry(zipfile, byPath.get(originalPath)!)
                        const storagePath = `${basePath}/${normalizedPath}`
                        await storage.saveWithPath(content, storagePath)
                        uploadedPaths.push(storagePath)
                    })
                )

                uploadedCount += batch.length

                // Log progress periodically (every ~10%) or on last batch
                if (batchNum % logInterval === 0 || batchNum === totalBatches) {
                    const percent = Math.round((uploadedCount / totalFiles) * 100)
                    console.log(`[ZipUtils] Progress: ${percent}% (${uploadedCount}/${totalFiles} files)`)
                }
            }
        } catch (error) {
            // Clean up any files that were already uploaded before the error
            if (uploadedPaths.length > 0) {
                console.log(`[ZipUtils] Error during extraction, cleaning up ${uploadedPaths.length} uploaded files...`)
                await storage.deleteBatch(uploadedPaths).catch(cleanupErr => {
                    console.error(`[ZipUtils] Failed to clean up files after error:`, cleanupErr)
                })
            }
            throw error
        }

        return {
            root_file: rootFileNormalized,
            file_count: uploadedCount
        }
    } finally {
        zipfile.close()
    }
}
