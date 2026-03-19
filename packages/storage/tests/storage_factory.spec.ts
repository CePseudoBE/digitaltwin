import { test } from '@japa/runner'
import { StorageServiceFactory } from '../src/storage_factory.js'
import { LocalStorageService } from '../src/adapters/local_storage_service.js'
import { OvhS3StorageService } from '../src/adapters/ovh_storage_service.js'
import { Env } from '@digitaltwin/shared'
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

    test('"ovh" creates OvhS3StorageService', ({ assert }) => {
        mockEnv({
            STORAGE_CONFIG: 'ovh',
            OVH_ACCESS_KEY: 'test-key',
            OVH_SECRET_KEY: 'test-secret',
            OVH_ENDPOINT: 'https://s3.gra.io.cloud.ovh.net',
            OVH_BUCKET: 'test-bucket',
            OVH_REGION: 'gra'
        })

        const storage = StorageServiceFactory.create()
        assert.instanceOf(storage, OvhS3StorageService)
    })

    test('unknown config throws error', ({ assert }) => {
        mockEnv({ STORAGE_CONFIG: 'unknown' })

        assert.throws(
            () => StorageServiceFactory.create(),
            /Unsupported STORAGE_CONFIG: unknown/
        )
    })
})
