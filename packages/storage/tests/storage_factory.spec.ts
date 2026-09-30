import { test } from '@japa/runner'
import { StorageServiceFactory } from '../src/storage_factory.js'
import { LocalStorageService } from '../src/adapters/local_storage_service.js'
import { S3StorageService } from '../src/adapters/s3_storage_service.js'
import { Env } from '@cepseudo/shared'
import fs from 'fs/promises'

function mockEnv(config: Record<string, unknown>) {
    Env.config = config
}

test.group('StorageServiceFactory', (group) => {
    const testDir = '.test_factory_tmp'

    group.teardown(async () => {
        await fs.rm(testDir, { recursive: true, force: true })
    })

    test('"local" creates working LocalStorageService (save + retrieve)', async ({ assert }) => {
        mockEnv({ STORAGE_CONFIG: 'local', LOCAL_STORAGE_DIR: testDir })

        const storage = StorageServiceFactory.create()
        assert.instanceOf(storage, LocalStorageService)

        const data = Buffer.from('factory test')
        const savedPath = await storage.save(data, 'factory', 'txt')
        const retrieved = await storage.retrieve(savedPath)
        assert.deepEqual(retrieved, data)
    })

    // Nothing listens on port 1: the start-up CORS call fails fast, without reaching the network
    const s3Env = {
        STORAGE_CONFIG: 's3',
        S3_ACCESS_KEY_ID: 'test-key',
        S3_SECRET_ACCESS_KEY: 'test-secret',
        S3_ENDPOINT: 'http://127.0.0.1:1',
        S3_BUCKET: 'test-bucket'
    }

    test('"s3" creates an S3StorageService addressing the bucket in the host by default', ({ assert }) => {
        mockEnv(s3Env)

        const storage = StorageServiceFactory.create()
        assert.instanceOf(storage, S3StorageService)
        assert.equal(storage.getPublicUrl('a/b.json'), 'http://test-bucket.127.0.0.1:1/a/b.json')
    })

    test('"s3" reads S3_FORCE_PATH_STYLE and S3_PUBLIC_URL', ({ assert }) => {
        mockEnv({ ...s3Env, S3_FORCE_PATH_STYLE: 'true' })
        assert.equal(StorageServiceFactory.create().getPublicUrl('a/b.json'), 'http://127.0.0.1:1/test-bucket/a/b.json')

        mockEnv({ ...s3Env, S3_PUBLIC_URL: 'https://cdn.example.org' })
        assert.equal(StorageServiceFactory.create().getPublicUrl('a/b.json'), 'https://cdn.example.org/a/b.json')
    })

    test('unknown config throws error', ({ assert }) => {
        mockEnv({ STORAGE_CONFIG: 'unknown' })

        assert.throws(
            () => StorageServiceFactory.create(),
            /Unsupported STORAGE_CONFIG: unknown/
        )
    })
})
