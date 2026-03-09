/**
 * Integration tests for OvhS3StorageService using a local MinIO container.
 *
 * MinIO is S3-compatible — the same AWS SDK code runs against it as against
 * OVH Object Storage. The only difference is pathStyle: true for localhost
 * (MinIO) vs pathStyle: false for OVH (virtual-hosted style).
 *
 * These tests never touch the real OVH bucket.
 */
import { test } from '@japa/runner'
import { GenericContainer, Wait } from 'testcontainers'
import { OvhS3StorageService } from '../src/adapters/ovh_storage_service.js'

const MINIO_USER = 'minioadmin'
const MINIO_PASSWORD = 'minioadmin'
const BUCKET = 'test-bucket'

async function startMinio() {
    const container = await new GenericContainer('minio/minio')
        .withEnvironment({
            MINIO_ROOT_USER: MINIO_USER,
            MINIO_ROOT_PASSWORD: MINIO_PASSWORD,
        })
        .withCommand(['server', '/data'])
        .withExposedPorts(9000)
        .withWaitStrategy(Wait.forHttp('/minio/health/live', 9000))
        .start()

    const port = container.getMappedPort(9000)
    const endpoint = `http://localhost:${port}`
    return { container, endpoint }
}

async function createBucket(endpoint: string): Promise<void> {
    // Use the AWS SDK directly to create the bucket before tests
    const { S3Client, CreateBucketCommand } = await import('@aws-sdk/client-s3')
    const s3 = new S3Client({
        endpoint,
        region: 'us-east-1',
        credentials: { accessKeyId: MINIO_USER, secretAccessKey: MINIO_PASSWORD },
        forcePathStyle: true,
        requestChecksumCalculation: 'WHEN_REQUIRED',
        responseChecksumValidation: 'WHEN_REQUIRED',
    })
    await s3.send(new CreateBucketCommand({ Bucket: BUCKET }))
    await s3.destroy()
}

function makeStorage(endpoint: string): OvhS3StorageService {
    return new OvhS3StorageService({
        accessKey: MINIO_USER,
        secretKey: MINIO_PASSWORD,
        endpoint,
        region: 'us-east-1',
        bucket: BUCKET,
        pathStyle: true,
    })
}

test.group('OvhS3StorageService (MinIO integration)', group => {
    let container: Awaited<ReturnType<typeof startMinio>>['container']
    let endpoint: string
    let storage: OvhS3StorageService

    group.setup(async () => {
        const result = await startMinio()
        container = result.container
        endpoint = result.endpoint
        await createBucket(endpoint)
        storage = makeStorage(endpoint)
    })

    group.teardown(async () => {
        await container.stop()
    })

    // ── save / retrieve ────────────────────────────────────────────────────

    test('save() returns a key and retrieve() returns the same content', async ({ assert }) => {
        const content = Buffer.from('hello world')
        const key = await storage.save(content, 'my-collector', 'txt')

        assert.isString(key)
        assert.match(key, /^my-collector\//)

        const retrieved = await storage.retrieve(key)
        assert.deepEqual(retrieved, content)
    })

    test('save() without extension produces a valid key', async ({ assert }) => {
        const key = await storage.save(Buffer.from('data'), 'raw-collector')
        assert.isString(key)
        assert.notMatch(key, /\.$/) // no trailing dot
    })

    test('retrieve() throws for a non-existent key', async ({ assert }) => {
        await assert.rejects(() => storage.retrieve('does/not/exist.bin'))
    })

    // ── saveWithPath ────────────────────────────────────────────────────────

    test('saveWithPath() stores at the exact key provided', async ({ assert }) => {
        const path = 'tilesets/42/tileset.json'
        const content = Buffer.from(JSON.stringify({ version: 1 }))

        const returned = await storage.saveWithPath(content, path)
        assert.equal(returned, path)

        const retrieved = await storage.retrieve(path)
        assert.deepEqual(retrieved, content)
    })

    // ── delete ──────────────────────────────────────────────────────────────

    test('delete() removes the object — retrieve() throws afterwards', async ({ assert }) => {
        const key = await storage.save(Buffer.from('to-delete'), 'del-test')
        await storage.delete(key)
        await assert.rejects(() => storage.retrieve(key))
    })

    test('delete() is a no-op for a non-existent key', async ({ assert }) => {
        await assert.doesNotReject(() => storage.delete('phantom/key.txt'))
    })

    // ── deleteByPrefix ──────────────────────────────────────────────────────

    test('deleteByPrefix() removes all objects under the prefix', async ({ assert }) => {
        const prefix = 'prefix-test'
        await storage.save(Buffer.from('a'), prefix, 'a')
        await storage.save(Buffer.from('b'), prefix, 'b')

        const deleted = await storage.deleteByPrefix(prefix)
        assert.isTrue(deleted >= 2)

        // Both objects are gone
        const remaining = await storage.deleteByPrefix(prefix)
        assert.equal(remaining, 0)
    })

    test('deleteByPrefix() returns 0 for an empty prefix', async ({ assert }) => {
        const count = await storage.deleteByPrefix('empty-prefix-xyz')
        assert.equal(count, 0)
    })

    // ── objectExists ────────────────────────────────────────────────────────

    test('objectExists() returns true for an existing object', async ({ assert }) => {
        const content = Buffer.from('exists-check')
        const key = await storage.save(content, 'exists-test')

        const result = await storage.objectExists(key)
        assert.isTrue(result.exists)
        assert.equal(result.contentLength, content.byteLength)
    })

    test('objectExists() returns false for a non-existent key', async ({ assert }) => {
        const result = await storage.objectExists('no/such/object.bin')
        assert.isFalse(result.exists)
    })

    // ── getPublicUrl ────────────────────────────────────────────────────────

    test('getPublicUrl() returns a URL containing the key', async ({ assert }) => {
        const key = 'some/path/file.json'
        const url = storage.getPublicUrl(key)

        assert.isString(url)
        assert.include(url, key)
        assert.include(url, BUCKET)
    })

    // ── generatePresignedUploadUrl ───────────────────────────────────────────

    test('supportsPresignedUrls() returns true', ({ assert }) => {
        assert.isTrue(storage.supportsPresignedUrls())
    })

    test('generatePresignedUploadUrl() returns a valid URL — PUT uploads the file', async ({ assert }) => {
        const key = 'upload/presigned-test.bin'
        const content = Buffer.from('presigned-upload-content')

        const result = await storage.generatePresignedUploadUrl(key, 'application/octet-stream', 300)

        assert.isString(result.url)
        assert.equal(result.key, key)
        assert.instanceOf(result.expiresAt, Date)
        assert.isTrue(result.expiresAt > new Date())

        // Actually upload via the presigned URL
        const response = await fetch(result.url, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/octet-stream' },
            body: content,
        })
        assert.isTrue(response.ok, `PUT to presigned URL failed: ${response.status} ${response.statusText}`)

        // Verify the file was actually stored
        const retrieved = await storage.retrieve(key)
        assert.deepEqual(retrieved, content)
    })

    // ── deleteBatch ─────────────────────────────────────────────────────────

    test('deleteBatch() removes multiple objects at once', async ({ assert }) => {
        const keys = await Promise.all([
            storage.save(Buffer.from('batch-1'), 'batch-test'),
            storage.save(Buffer.from('batch-2'), 'batch-test'),
            storage.save(Buffer.from('batch-3'), 'batch-test'),
        ])

        await storage.deleteBatch(keys)

        for (const key of keys) {
            const exists = await storage.objectExists(key)
            assert.isFalse(exists.exists)
        }
    })

    test('deleteBatch() with empty array is a no-op', async ({ assert }) => {
        await assert.doesNotReject(() => storage.deleteBatch([]))
    })
})
