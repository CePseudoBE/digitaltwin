import JSZip from 'jszip'
import type { StorageService } from '../storage/storage_service.js'

/**
 * Result of extracting and storing a ZIP archive
 */
export interface ExtractedArchiveResult {
    /** The root/main file path (e.g., 'tileset.json') */
    root_file?: string
    /** Total number of files extracted */
    file_count: number
}

/**
 * Extracts the content of a zip file as a stream (for large files)
 * @param zipBuffer - The content of the zip file as Buffer
 * @returns A generator yielding tuples containing the name and content of each file in the zip file
 */
export async function* extractZipContentStream(zipBuffer: Buffer): AsyncGenerator<[string, string | Buffer]> {
    const zip = new JSZip()
    const zipContent = await zip.loadAsync(zipBuffer)

    for (const [name, zipObject] of Object.entries(zipContent.files)) {
        if (!zipObject.dir) {
            // Skip directories
            const content = await zipObject.async('nodebuffer')

            // Try to decode as UTF-8, fallback to Buffer for binary files
            try {
                const textContent = content.toString('utf-8')
                // Check if it's valid UTF-8 by trying to encode it back
                Buffer.from(textContent, 'utf-8')
                yield [name, textContent]
            } catch {
                // If UTF-8 decoding fails, return as Buffer
                yield [name, content]
            }
        }
    }
}

/**
 * Converts a zip file to a dictionary containing all files and their contents
 * @param zipBuffer - The content of the zip file as Buffer
 * @returns A dictionary containing the content of the zip file
 */
export async function zipToDict(zipBuffer: Buffer): Promise<Record<string, string | Buffer>> {
    const output: Record<string, string | Buffer> = {}

    for await (const [name, content] of extractZipContentStream(zipBuffer)) {
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
 * 1. Extracts all files from the ZIP
 * 2. Normalizes paths (removes common root directory if present)
 * 3. Stores each file using the storage service with a unique base path
 * 4. Returns the root file path and file count
 *
 * Files are uploaded in parallel batches for performance.
 *
 * @param zipBuffer - The ZIP file content as a Buffer
 * @param storage - The storage service to use for saving files
 * @param basePath - Base path/folder for storing extracted files (e.g., 'tilesets/1234567890')
 * @returns ExtractedArchiveResult with root file and file count
 *
 * @example
 * ```typescript
 * const result = await extractAndStoreArchive(zipBuffer, storage, 'tilesets/1234567890')
 * // result.root_file = 'tileset.json'
 * // result.file_count = 42
 *
 * // Files are stored at:
 * // tilesets/1234567890/tileset.json
 * // tilesets/1234567890/tiles/tile_0.b3dm
 * // etc.
 * ```
 */
export async function extractAndStoreArchive(
    zipBuffer: Buffer,
    storage: StorageService,
    basePath: string
): Promise<ExtractedArchiveResult> {
    const zip = new JSZip()
    const zipContent = await zip.loadAsync(zipBuffer)

    // Get all file paths (excluding directories)
    const filePaths = Object.entries(zipContent.files)
        .filter(([_, zipObject]) => !zipObject.dir)
        .map(([name]) => name)

    // Normalize paths (remove common root if present)
    const normalizedPaths = normalizeArchivePaths(filePaths)

    // Detect root file before normalization, then get normalized path
    const rootFileOriginal = detectTilesetRootFile(filePaths)
    const rootFileNormalized = rootFileOriginal ? normalizedPaths.get(rootFileOriginal) : undefined

    // Extract and store files in parallel (batched to avoid overwhelming storage)
    const PARALLEL_UPLOADS = 10
    const entries = Array.from(normalizedPaths.entries())
    const totalFiles = entries.length
    let uploadedCount = 0
    const uploadedPaths: string[] = []

    console.log(`[ZipUtils] Extracting ${totalFiles} files to ${basePath}`)

    try {
        const totalBatches = Math.ceil(totalFiles / PARALLEL_UPLOADS)
        // Log progress every 10% or at least every 10 batches
        const logInterval = Math.max(1, Math.floor(totalBatches / 10))

        for (let i = 0; i < entries.length; i += PARALLEL_UPLOADS) {
            const batch = entries.slice(i, i + PARALLEL_UPLOADS)
            const batchNum = Math.floor(i / PARALLEL_UPLOADS) + 1

            await Promise.all(
                batch.map(async ([originalPath, normalizedPath]) => {
                    const zipObject = zipContent.files[originalPath]
                    const content = await zipObject.async('nodebuffer')

                    // Build storage path: basePath/normalizedPath
                    const storagePath = `${basePath}/${normalizedPath}`

                    // Save the file using saveWithPath which preserves the exact path
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
}
