import { StorageService } from '@cepseudo/storage'
import type { PresignedUploadResult, ObjectExistsResult } from '@cepseudo/storage'

export class MockStorageService extends StorageService {
    private storage: Map<string, Buffer> = new Map()
    private _supportsPresigned = false
    private _objectExistsMap: Map<string, boolean> = new Map()

    async save(buffer: Buffer, collectorName: string, extension?: string): Promise<string> {
        const timestamp = Date.now()
        const path = `${collectorName}/${timestamp}${extension ? '.' + extension : ''}`
        this.storage.set(path, buffer)
        return path
    }

    async saveWithPath(buffer: Buffer, relativePath: string): Promise<string> {
        this.storage.set(relativePath, buffer)
        return relativePath
    }

    async retrieve(path: string): Promise<Buffer> {
        const buffer = this.storage.get(path)
        if (!buffer) {
            throw new Error(`File not found: ${path}`)
        }
        return buffer
    }

    async delete(path: string): Promise<void> {
        this.storage.delete(path)
    }

    override async deleteBatch(paths: string[]): Promise<void> {
        for (const path of paths) {
            this.storage.delete(path)
        }
    }

    override async deleteByPrefix(prefix: string): Promise<number> {
        let count = 0
        for (const key of this.storage.keys()) {
            if (key.startsWith(prefix)) {
                this.storage.delete(key)
                count++
            }
        }
        return count
    }

    getPublicUrl(relativePath: string): string {
        return `https://mock-bucket.s3.example.com/${relativePath}`
    }

    // ========== Presigned URL support ==========

    setPresignedUrlSupport(enabled: boolean): void {
        this._supportsPresigned = enabled
    }

    override supportsPresignedUrls(): boolean {
        return this._supportsPresigned
    }

    override async generatePresignedUploadUrl(
        key: string,
        _contentType: string,
        expiresInSeconds: number = 300
    ): Promise<PresignedUploadResult> {
        if (!this._supportsPresigned) {
            throw new Error('Presigned URLs are not supported by this storage backend')
        }
        return {
            url: `https://mock-bucket.s3.example.com/${key}?presigned=true`,
            key,
            expiresAt: new Date(Date.now() + expiresInSeconds * 1000)
        }
    }

    override async objectExists(key: string): Promise<ObjectExistsResult> {
        if (!this._supportsPresigned) {
            throw new Error('Object existence check is not supported by this storage backend')
        }
        // Check explicit map first, then fall back to storage map
        const explicit = this._objectExistsMap.get(key)
        if (explicit !== undefined) {
            if (explicit) {
                const buffer = this.storage.get(key)
                return {
                    exists: true,
                    contentLength: buffer?.length ?? 0,
                    contentType: 'application/octet-stream'
                }
            }
            return { exists: false }
        }
        // Fall back to checking actual stored data
        if (this.storage.has(key)) {
            const buffer = this.storage.get(key)!
            return {
                exists: true,
                contentLength: buffer.length,
                contentType: 'application/octet-stream'
            }
        }
        return { exists: false }
    }

    /**
     * Control what objectExists returns for a specific key (overrides actual storage check)
     */
    setObjectExists(key: string, exists: boolean): void {
        this._objectExistsMap.set(key, exists)
    }

    // ========== Test utilities ==========

    has(path: string): boolean {
        return this.storage.has(path)
    }

    getStoredPaths(): string[] {
        return Array.from(this.storage.keys())
    }

    clear(): void {
        this.storage.clear()
        this._objectExistsMap.clear()
    }

    get size(): number {
        return this.storage.size
    }
}
