import { test } from '@japa/runner'
import { LocalStorageService } from '../src/adapters/local_storage_service.js'
import fs from 'fs/promises'
import path from 'path'

const baseDir = '.test_storage_tmp'

test.group('LocalStorageService', (group) => {
    let storage: LocalStorageService

    group.setup(async () => {
        storage = new LocalStorageService(baseDir)
        await fs.mkdir(baseDir, { recursive: true })
    })

    group.teardown(async () => {
        await fs.rm(baseDir, { recursive: true, force: true })
    })

    test('save() creates file and returns path', async ({ assert }) => {
        const content = Buffer.from('hello world')
        const savedPath = await storage.save(content, 'mycollector', 'txt')

        const fullPath = path.join(baseDir, savedPath)
        const exists = await fs.access(fullPath).then(() => true).catch(() => false)
        assert.isTrue(exists)
    })

    test('save() + retrieve() round-trip returns identical content', async ({ assert }) => {
        const content = Buffer.from('test data for retrieval')
        const savedPath = await storage.save(content, 'collector', 'json')

        const retrieved = await storage.retrieve(savedPath)
        assert.deepEqual(retrieved, content)
    })

    test('delete() removes the file', async ({ assert }) => {
        const content = Buffer.from('to be deleted')
        const savedPath = await storage.save(content, 'collector', 'txt')

        await storage.delete(savedPath)

        const exists = await fs.access(path.join(baseDir, savedPath)).then(() => true).catch(() => false)
        assert.isFalse(exists)
    })

    test('saveWithPath() creates file at exact path with parent dirs', async ({ assert }) => {
        const content = Buffer.from('nested content')
        const relativePath = 'deep/nested/folder/file.txt'

        const result = await storage.saveWithPath(content, relativePath)

        assert.equal(result, relativePath)
        const fullPath = path.join(baseDir, relativePath)
        const exists = await fs.access(fullPath).then(() => true).catch(() => false)
        assert.isTrue(exists)
    })

    test('saveWithPath() file is retrievable', async ({ assert }) => {
        const content = Buffer.from('retrievable nested')
        const relativePath = 'retrieve/test/data.bin'
        await storage.saveWithPath(content, relativePath)

        const retrieved = await storage.retrieve(relativePath)
        assert.deepEqual(retrieved, content)
    })

    test('deleteByPrefix() removes all files under prefix', async ({ assert }) => {
        await storage.saveWithPath(Buffer.from('a'), 'prefix_test/a.txt')
        await storage.saveWithPath(Buffer.from('b'), 'prefix_test/sub/b.txt')
        await storage.saveWithPath(Buffer.from('c'), 'prefix_test/sub/c.txt')

        const count = await storage.deleteByPrefix('prefix_test')

        assert.equal(count, 3)
        const exists = await fs.access(path.join(baseDir, 'prefix_test')).then(() => true).catch(() => false)
        assert.isFalse(exists)
    })

    test('deleteByPrefix() does not touch other files', async ({ assert }) => {
        await storage.saveWithPath(Buffer.from('keep'), 'other_folder/keep.txt')
        await storage.saveWithPath(Buffer.from('del'), 'del_folder/remove.txt')

        await storage.deleteByPrefix('del_folder')

        const kept = await storage.retrieve('other_folder/keep.txt')
        assert.deepEqual(kept, Buffer.from('keep'))
    })

    test('getPublicUrl() returns path relative to baseDir', ({ assert }) => {
        const url = storage.getPublicUrl('some/file.txt')
        assert.equal(url, path.join(baseDir, 'some/file.txt'))
    })

    test('binary round-trip preserves data exactly', async ({ assert }) => {
        const binary = Buffer.from([0x00, 0xFF, 0x80, 0x7F, 0xDE, 0xAD, 0xBE, 0xEF])
        const savedPath = await storage.save(binary, 'binary_test', 'bin')

        const retrieved = await storage.retrieve(savedPath)
        assert.deepEqual(retrieved, binary)
    })

    test('deleteBatch() removes multiple files', async ({ assert }) => {
        const path1 = await storage.saveWithPath(Buffer.from('1'), 'batch/one.txt')
        const path2 = await storage.saveWithPath(Buffer.from('2'), 'batch/two.txt')

        await storage.deleteBatch([path1, path2])

        await assert.rejects(() => storage.retrieve(path1))
        await assert.rejects(() => storage.retrieve(path2))
    })
})
