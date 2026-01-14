import { StorageService } from "../../src/storage/storage_service.js";

export class MockStorageService extends StorageService {
    private storage: Map<string, Buffer> = new Map()

    async save(buffer: Buffer, collectorName: string, extension?: string): Promise<string> {
        const timestamp = Date.now()
        const path = `${collectorName}/${timestamp}${extension ? '.' + extension : ''}`
        this.storage.set(path, buffer)
        return path
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
}
