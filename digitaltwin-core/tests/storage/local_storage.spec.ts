import { test } from '@japa/runner'
import { LocalStorageService } from '../../src/storage/adapters/local_storage_service.js'
import fs from 'fs/promises'
import path from 'path'

const baseDir = '.test_tmp'

test.group('LocalStorageService', (group) => {
    const storage = new LocalStorageService(baseDir)
    const collectorName = 'mycollector'
    const content = Buffer.from('hello world')
    let savedPath: string

    group.teardown(async () => {
        await fs.rm(baseDir, { recursive: true, force: true })
    })

    test('should save a file and return its path', async ({ assert }) => {
        savedPath = await storage.save(content, collectorName, 'txt')

        const fullPath = path.join(baseDir, savedPath)
        const exists = await fs.access(fullPath).then(() => true).catch(() => false)
        assert.isTrue(exists)
    })

    test('should retrieve the saved file content', async ({ assert }) => {
        const retrieved = await storage.retrieve(savedPath)
        assert.deepEqual(retrieved, content)
    })

    test('should delete the file', async ({ assert }) => {
        await storage.delete(savedPath)

        const exists = await fs.access(path.join(baseDir, savedPath))
            .then(() => true)
            .catch(() => false)

        assert.isFalse(exists)
    })
})
