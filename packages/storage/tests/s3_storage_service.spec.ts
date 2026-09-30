/**
 * Tests for S3StorageService: integration against a local MinIO container
 * (path style, as MinIO requires), plus request-free checks of the public URL
 * and of DeleteObjects error handling.
 */
import { test } from '@japa/runner'
import { GenericContainer, Wait } from 'testcontainers'
import type { StartedTestContainer } from 'testcontainers'
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3'
import { S3StorageService } from '../src/adapters/s3_storage_service.js'

const MINIO_USER = 'minioadmin'
const MINIO_PASSWORD = 'minioadmin'
const BUCKET = 'test-bucket'

// Community fork: upstream MinIO is archived and its images are no longer public.
async function startMinio(): Promise<{ container: StartedTestContainer; endpoint: string }> {
    const container = await new GenericContainer('pgsty/minio:RELEASE.2026-08-04T00-00-00Z')
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
    const { CreateBucketCommand, PutBucketPolicyCommand } = await import('@aws-sdk/client-s3')
    const s3 = new S3Client({
        endpoint,
        region: 'us-east-1',
        credentials: { accessKeyId: MINIO_USER, secretAccessKey: MINIO_PASSWORD },
        forcePathStyle: true,
        requestChecksumCalculation: 'WHEN_REQUIRED',
        responseChecksumValidation: 'WHEN_REQUIRED',
    })
    await s3.send(new CreateBucketCommand({ Bucket: BUCKET }))
    // MinIO ignores object ACLs: a bucket policy is what lets the public URL test read anonymously
    const policy = {
        Version: '2012-10-17',
        Statement: [{ Effect: 'Allow', Principal: { AWS: ['*'] }, Action: ['s3:GetObject'], Resource: [`arn:aws:s3:::${BUCKET}/*`] }]
    }
    await s3.send(new PutBucketPolicyCommand({ Bucket: BUCKET, Policy: JSON.stringify(policy) }))
    await s3.destroy()
}

function makeStorage(endpoint: string): S3StorageService {
    return new S3StorageService({
        accessKey: MINIO_USER,
        secretKey: MINIO_PASSWORD,
        endpoint,
        region: 'us-east-1',
        bucket: BUCKET,
        pathStyle: true,
    })
}

test.group('S3StorageService (MinIO integration)', group => {
    let container: StartedTestContainer
    let endpoint: string
    let storage: S3StorageService

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

    test('getPublicUrl() serves the object anonymously, keys with spaces and # included', async ({ assert }) => {
        const key = 'tilesets/42/my tile #1.json'
        await storage.saveWithPath(Buffer.from('{"asset":{}}'), key)

        const response = await fetch(storage.getPublicUrl(key))
        assert.equal(response.status, 200)
        assert.equal(await response.text(), '{"asset":{}}')
    })

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

test.group('S3StorageService - getPublicUrl() (no network)', () => {
    const config = { accessKey: 'x', secretKey: 'x', bucket: 'city' }
    const key = 'tilesets/42/my tile #1.json'

    test('puts the bucket in the host by default and encodes each path segment', ({ assert }) => {
        const storage = new S3StorageService({ ...config, endpoint: 'https://s3.example.org' })
        assert.equal(storage.getPublicUrl(key), 'https://city.s3.example.org/tilesets/42/my%20tile%20%231.json')
    })

    test('puts the bucket in the path with pathStyle', ({ assert }) => {
        const storage = new S3StorageService({ ...config, endpoint: 'http://localhost:9000/', pathStyle: true })
        assert.equal(storage.getPublicUrl(key), 'http://localhost:9000/city/tilesets/42/my%20tile%20%231.json')
    })

    test('uses publicUrl instead of the bucket URL', ({ assert }) => {
        const storage = new S3StorageService({ ...config, endpoint: 'https://s3.example.org', publicUrl: 'https://cdn.example.org/assets/' })
        assert.equal(storage.getPublicUrl(key), 'https://cdn.example.org/assets/tilesets/42/my%20tile%20%231.json')
    })
})

test.group('S3StorageService - DeleteObjects errors (no network)', group => {
    const originalSend = S3Client.prototype.send

    group.each.teardown(() => {
        S3Client.prototype.send = originalSend
    })

    test('deleteByPrefix() throws when S3 reports keys it could not delete', async ({ assert }) => {
        const stubbedSend = async (command: unknown) =>
            command instanceof ListObjectsV2Command
                ? { Contents: [{ Key: 'tilesets/1/a.json' }, { Key: 'tilesets/1/b.json' }] }
                : { Errors: [{ Key: 'tilesets/1/b.json', Code: 'AccessDenied', Message: 'Access Denied' }] }
        S3Client.prototype.send = stubbedSend as unknown as typeof originalSend
        const storage = new S3StorageService({ accessKey: 'x', secretKey: 'x', endpoint: 'http://127.0.0.1:1', bucket: 'b' })

        await assert.rejects(() => storage.deleteByPrefix('tilesets/1'), /Failed to delete 1 of 2 objects \(tilesets\/1\/b\.json: AccessDenied Access Denied\)/)
    })
})

test.group('S3StorageService - deleteByPrefix() guard (no network)', () => {
    test('refuses prefixes that would match the whole bucket before calling S3', async ({ assert }) => {
        const storage = new S3StorageService({
            accessKey: 'x', secretKey: 'x', endpoint: 'http://127.0.0.1:1', region: 'us-east-1', bucket: 'b', pathStyle: true,
        })
        for (const prefix of ['', ' ', '/', '.', './']) {
            await assert.rejects(() => storage.deleteByPrefix(prefix), /refuses/)
        }
    })
})
