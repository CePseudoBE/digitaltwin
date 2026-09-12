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

test.group('LocalStorageService - save() and deleteByPrefix() guards', (group) => {
    const baseDir = '.test_security_save_tmp'
    let storage: LocalStorageService

    group.setup(async () => {
        storage = new LocalStorageService(baseDir)
        await fs.mkdir(baseDir, { recursive: true })
    })

    group.teardown(async () => {
        await fs.rm(baseDir, { recursive: true, force: true })
    })

    test('save() blocks traversal through the extension argument', async ({ assert }) => {
        await assert.rejects(() => storage.save(Buffer.from('x'), 'col', '../../../escaped.txt'), /path traversal detected/)
    })

    test('save() blocks traversal through the collector name', async ({ assert }) => {
        await assert.rejects(() => storage.save(Buffer.from('x'), '../outside', 'txt'), /path traversal detected/)
    })

    test('save() returns forward-slash keys that retrieve() accepts', async ({ assert }) => {
        const key = await storage.save(Buffer.from('payload'), 'col', 'json')
        assert.notInclude(key, '\\')
        assert.match(key, /^col\/[^/]+\.json$/)
        assert.equal((await storage.retrieve(key)).toString(), 'payload')
    })

    test('deleteByPrefix() refuses the storage root in every spelling', async ({ assert }) => {
        await storage.save(Buffer.from('keep'), 'col', 'txt')
        for (const prefix of ['', ' ', '.', '/', './', 'col/..', '..']) {
            await assert.rejects(() => storage.deleteByPrefix(prefix), /refuses|path traversal/)
        }
        assert.isTrue((await fs.readdir(`${baseDir}/col`)).length > 0)
    })

    test('deleteByPrefix() still deletes a real folder', async ({ assert }) => {
        await storage.save(Buffer.from('a'), 'gone', 'txt')
        assert.equal(await storage.deleteByPrefix('gone'), 1)
    })
})
