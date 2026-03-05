import { test } from '@japa/runner'
import { LocalStorageService } from '../src/adapters/local_storage_service.js'
import fs from 'fs/promises'

test.group('LocalStorageService - Path Traversal Protection', (group) => {
    const baseDir = '.test_security_tmp'
    let storage: LocalStorageService

    group.setup(async () => {
        storage = new LocalStorageService(baseDir)
        await fs.mkdir(baseDir, { recursive: true })
    })

    group.teardown(async () => {
        await fs.rm(baseDir, { recursive: true, force: true })
    })

    test('retrieve() blocks ../ traversal', async ({ assert }) => {
        await assert.rejects(
            () => storage.retrieve('../../../etc/passwd'),
            /path traversal detected/
        )
    })

    test('retrieve() blocks nested ../ traversal', async ({ assert }) => {
        await assert.rejects(
            () => storage.retrieve('folder/../../../../../../etc/passwd'),
            /path traversal detected/
        )
    })

    test('delete() blocks path traversal', async ({ assert }) => {
        await assert.rejects(
            () => storage.delete('../../../important_file.txt'),
            /path traversal detected/
        )
    })

    test('saveWithPath() blocks path traversal', async ({ assert }) => {
        await assert.rejects(
            () => storage.saveWithPath(Buffer.from('malicious'), '../../../malicious.txt'),
            /path traversal detected/
        )
    })

    test('getPublicUrl() blocks path traversal', ({ assert }) => {
        assert.throws(
            () => storage.getPublicUrl('../../../secret/file.txt'),
            /path traversal detected/
        )
    })

    test('deleteByPrefix() blocks path traversal', async ({ assert }) => {
        await assert.rejects(
            () => storage.deleteByPrefix('../../../important_folder'),
            /path traversal detected/
        )
    })

    test('allows valid nested paths within base directory', async ({ assert }) => {
        const buffer = Buffer.from('test content')
        const savedPath = await storage.saveWithPath(buffer, 'nested/folder/file.txt')

        const content = await storage.retrieve(savedPath)
        assert.deepEqual(content, buffer)
        await storage.delete(savedPath)
    })

    test('allows filenames containing .. that do not escape', async ({ assert }) => {
        const buffer = Buffer.from('test')
        const savedPath = await storage.saveWithPath(buffer, 'foo..bar.txt')
        const content = await storage.retrieve(savedPath)
        assert.deepEqual(content, buffer)
        await storage.delete(savedPath)
    })
})
