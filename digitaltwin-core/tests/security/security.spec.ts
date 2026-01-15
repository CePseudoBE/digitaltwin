import { test } from '@japa/runner'
import { LocalStorageService } from '../../src/storage/adapters/local_storage_service.js'
import { MockDatabaseAdapter } from '../mocks/mock_database_adapter.js'
import fs from 'fs/promises'

test.group('Security - Path Traversal Protection', group => {
    const baseDir = '.test_security_tmp'
    let storage: LocalStorageService

    group.setup(async () => {
        storage = new LocalStorageService(baseDir)
        await fs.mkdir(baseDir, { recursive: true })
    })

    group.teardown(async () => {
        await fs.rm(baseDir, { recursive: true, force: true })
    })

    test('retrieve() blocks path traversal with ../', async ({ assert }) => {
        await assert.rejects(
            () => storage.retrieve('../../../etc/passwd'),
            /path traversal detected/
        )
    })

    test('retrieve() blocks path traversal with multiple ../', async ({ assert }) => {
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
        const buffer = Buffer.from('malicious content')
        await assert.rejects(
            () => storage.saveWithPath(buffer, '../../../malicious.txt'),
            /path traversal detected/
        )
    })

    test('getPublicUrl() blocks path traversal', async ({ assert }) => {
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
        // First save a file
        const buffer = Buffer.from('test content')
        const savedPath = await storage.saveWithPath(buffer, 'nested/folder/file.txt')

        // Should be able to retrieve it
        const content = await storage.retrieve(savedPath)
        assert.deepEqual(content, buffer)

        // Cleanup
        await storage.delete(savedPath)
    })

    test('allows paths that contain .. but do not escape', async ({ assert }) => {
        // "foo..bar" contains ".." but is a valid filename, not path traversal
        const buffer = Buffer.from('test')
        const savedPath = await storage.saveWithPath(buffer, 'foo..bar.txt')
        const content = await storage.retrieve(savedPath)
        assert.deepEqual(content, buffer)
        await storage.delete(savedPath)
    })
})

test.group('Security - SQL Table Name Validation Pattern', () => {
    // Test the validation pattern directly (without real DB)
    const validateTableName = (name: string): void => {
        if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
            throw new Error(
                `Invalid table name: "${name}". Must start with a letter or underscore and contain only alphanumeric characters and underscores.`
            )
        }
        if (name.length > 63) {
            throw new Error(`Table name too long: "${name}". Maximum 63 characters allowed.`)
        }
    }

    test('rejects table name with SQL injection attempt', ({ assert }) => {
        assert.throws(
            () => validateTableName('users; DROP TABLE important_data; --'),
            /Invalid table name/
        )
    })

    test('rejects table name with spaces', ({ assert }) => {
        assert.throws(
            () => validateTableName('table with spaces'),
            /Invalid table name/
        )
    })

    test('rejects table name starting with number', ({ assert }) => {
        assert.throws(
            () => validateTableName('123table'),
            /Invalid table name/
        )
    })

    test('rejects table name with special characters', ({ assert }) => {
        assert.throws(
            () => validateTableName('table-with-dashes'),
            /Invalid table name/
        )
    })

    test('rejects table name with quotes', ({ assert }) => {
        assert.throws(
            () => validateTableName("users' OR '1'='1"),
            /Invalid table name/
        )
    })

    test('rejects excessively long table name (>63 chars)', ({ assert }) => {
        const longName = 'a'.repeat(64)
        assert.throws(
            () => validateTableName(longName),
            /Table name too long/
        )
    })

    test('accepts valid table name with letters', ({ assert }) => {
        assert.doesNotThrow(() => validateTableName('valid_table_name'))
    })

    test('accepts valid table name starting with underscore', ({ assert }) => {
        assert.doesNotThrow(() => validateTableName('_internal_table'))
    })

    test('accepts valid table name with numbers after first char', ({ assert }) => {
        assert.doesNotThrow(() => validateTableName('table123'))
    })

    test('accepts table name at max length (63 chars)', ({ assert }) => {
        const maxName = 'a'.repeat(63)
        assert.doesNotThrow(() => validateTableName(maxName))
    })
})

test.group('Security - Asset Update Preserves ID (Mock)', () => {
    test('updateAssetMetadata preserves the original record ID', async ({ assert }) => {
        const db = new MockDatabaseAdapter()

        // Create a record
        const originalRecord = await db.save({
            name: 'test_assets',
            type: 'image/png',
            url: '/storage/test.png',
            date: new Date(),
            description: 'Original description',
            source: 'https://original.com',
            is_public: true
        })

        const originalId = originalRecord.id

        // Update the record using the new updateAssetMetadata method
        const updatedRecord = await db.updateAssetMetadata('test_assets', originalId, {
            description: 'Updated description',
            source: 'https://updated.com',
            is_public: false
        })

        // Verify ID is preserved
        assert.equal(updatedRecord.id, originalId)

        // Verify updates were applied
        assert.equal((updatedRecord as any).description, 'Updated description')
        assert.equal((updatedRecord as any).source, 'https://updated.com')
        assert.equal((updatedRecord as any).is_public, false)

        // Verify record still exists with same ID
        const fetchedRecord = await db.getById(String(originalId), 'test_assets')
        assert.isDefined(fetchedRecord)
        assert.equal(fetchedRecord!.id, originalId)
    })

    test('updateAssetMetadata throws for non-existent record', async ({ assert }) => {
        const db = new MockDatabaseAdapter()

        await assert.rejects(
            () => db.updateAssetMetadata('test_assets', 999999, { description: 'test' }),
            /not found/
        )
    })

    test('updateAssetMetadata with partial updates only modifies specified fields', async ({ assert }) => {
        const db = new MockDatabaseAdapter()

        // Create a record with all fields
        const originalRecord = await db.save({
            name: 'test_assets',
            type: 'image/png',
            url: '/storage/test.png',
            date: new Date(),
            description: 'Original description',
            source: 'https://original.com',
            is_public: true
        })

        // Update only the description
        const updatedRecord = await db.updateAssetMetadata('test_assets', originalRecord.id, {
            description: 'New description'
        })

        // Verify only description changed
        assert.equal((updatedRecord as any).description, 'New description')
        assert.equal((updatedRecord as any).source, 'https://original.com')
        assert.equal((updatedRecord as any).is_public, true)
    })
})
