import { StorageService } from '../storage_service.js'
import fs from 'fs/promises'
import path from 'path'

/**
 * Local filesystem-based implementation of the StorageService.
 * Saves files in a configured folder using a timestamp as filename.
 */
export class LocalStorageService extends StorageService {
    constructor(private baseDir: string = 'data') {
        super()
    }

    /**
     * Saves the given buffer to disk under a unique filename.
     * @param buffer - Content to save
     * @param collectorName - Name of the collector (used for folder)
     * @param extension - Optional file extension (e.g. 'json', 'txt')
     * @returns Relative path to the saved file
     */
    async save(buffer: Buffer, collectorName: string, extension?: string): Promise<string> {
        const now = new Date()
        const timestamp = now.toISOString().replace(/[:.]/g, '-')
        const folder = collectorName || 'default'
        const filename = extension ? `${timestamp}.${extension}` : timestamp
        const dirPath = path.join(this.baseDir, folder)
        const filePath = path.join(dirPath, filename)

        await fs.mkdir(dirPath, { recursive: true })
        await fs.writeFile(filePath, buffer)

        // return relative path (e.g., 'mycollector/2025-07-07T15-45-22-456Z.json')
        return path.join(folder, filename)
    }

    /**
     * Retrieves a file as buffer using its relative path.
     * @param relativePath - Filename previously returned by `save`
     * @returns File content as Buffer
     */
    async retrieve(relativePath: string): Promise<Buffer> {
        const filePath = path.join(this.baseDir, relativePath)
        return fs.readFile(filePath)
    }

    /**
     * Deletes a stored file.
     * @param relativePath - Filename previously returned by `save`
     */
    async delete(relativePath: string): Promise<void> {
        const filePath = path.join(this.baseDir, relativePath)
        await fs.rm(filePath, { force: true })
    }

    /**
     * Saves the given buffer to disk at a specific path (preserves filename).
     * Unlike save(), this method does not auto-generate a timestamp filename.
     * @param buffer - Content to save
     * @param relativePath - Full relative path including filename (e.g., 'tilesets/123/tileset.json')
     * @returns The same relative path that was provided
     */
    async saveWithPath(buffer: Buffer, relativePath: string): Promise<string> {
        const filePath = path.join(this.baseDir, relativePath)
        const dirPath = path.dirname(filePath)

        await fs.mkdir(dirPath, { recursive: true })
        await fs.writeFile(filePath, buffer)

        return relativePath
    }

    /**
     * Returns a local file path for the stored file.
     * Note: For local storage, this returns a relative file path, not an HTTP URL.
     * In production, use a cloud storage service (OVH, S3) for public URLs.
     * @param relativePath - The storage path of the file
     * @returns The file path (relative to baseDir)
     */
    getPublicUrl(relativePath: string): string {
        // For local storage, return the file path
        // In a real deployment, you'd need Express static serving or similar
        return path.join(this.baseDir, relativePath)
    }

    /**
     * Deletes all files under a given prefix (folder).
     * @param prefix - The folder/prefix to delete (e.g., 'tilesets/123')
     * @returns Number of files deleted
     */
    async deleteByPrefix(prefix: string): Promise<number> {
        const folderPath = path.join(this.baseDir, prefix)

        try {
            // Check if folder exists
            await fs.access(folderPath)

            // Count files before deletion
            const countFiles = async (dir: string): Promise<number> => {
                let count = 0
                const entries = await fs.readdir(dir, { withFileTypes: true })
                for (const entry of entries) {
                    if (entry.isDirectory()) {
                        count += await countFiles(path.join(dir, entry.name))
                    } else {
                        count++
                    }
                }
                return count
            }

            const fileCount = await countFiles(folderPath)

            // Delete folder recursively
            await fs.rm(folderPath, { recursive: true, force: true })

            return fileCount
        } catch {
            // Folder doesn't exist
            return 0
        }
    }
}
