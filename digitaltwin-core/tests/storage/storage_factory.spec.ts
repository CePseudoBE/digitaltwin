import { test } from '@japa/runner'
import { StorageServiceFactory } from '../../src/storage/storage_factory.js'
import { LocalStorageService } from '../../src/storage/adapters/local_storage_service.js'
import { OvhS3StorageService } from '../../src/storage/adapters/ovh_storage_service.js'
import { Env } from '../../src/env/env.js'

function mockEnv(config: Record<string, any>) {
    Env.config = config
}

test.group('StorageServiceFactory', () => {
    test('creates a LocalStorageService when STORAGE_CONFIG is "local"', ({ assert }) => {
        mockEnv({
            STORAGE_CONFIG: 'local',
            LOCAL_STORAGE_DIR: '.tmp'
        })

        const storage = StorageServiceFactory.create()
        assert.instanceOf(storage, LocalStorageService)
    })

    test('creates an OvhS3StorageService when STORAGE_CONFIG is "ovh"', ({ assert }) => {
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

    test('throws on unsupported STORAGE_CONFIG', ({ assert }) => {
        mockEnv({ STORAGE_CONFIG: 'unknown' })

        assert.throws(() => {
            StorageServiceFactory.create()
        }, 'Unsupported STORAGE_CONFIG: unknown')
    })

})