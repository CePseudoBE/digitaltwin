/**
 * Shared infrastructure setup for E2E tests.
 *
 * Starts PostgreSQL + MinIO via testcontainers (or uses env vars in CI).
 * Exports setupInfrastructure() returning { db, storage, authMiddleware, cleanup }.
 */
import { GenericContainer, Wait } from 'testcontainers'
import type { StartedTestContainer } from 'testcontainers'
import { KyselyDatabaseAdapter } from '@digitaltwin/database'
import { OvhS3StorageService } from '@digitaltwin/storage'
import { AuthMiddleware, UserService } from '@digitaltwin/auth'
import type { DatabaseAdapter } from '@digitaltwin/database'
import type { StorageService } from '@digitaltwin/storage'

const MINIO_USER = 'minioadmin'
const MINIO_PASSWORD = 'minioadmin'
const MINIO_BUCKET = 'test-bucket'

export interface E2EInfrastructure {
    db: DatabaseAdapter
    storage: OvhS3StorageService
    authMiddleware: AuthMiddleware
    cleanup: () => Promise<void>
}

async function startMinio(): Promise<{ container: StartedTestContainer; endpoint: string }> {
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
    const { S3Client, CreateBucketCommand } = await import('@aws-sdk/client-s3')
    const accessKey = process.env.TEST_MINIO_ACCESS_KEY || MINIO_USER
    const secretKey = process.env.TEST_MINIO_SECRET_KEY || MINIO_PASSWORD
    const s3 = new S3Client({
        endpoint,
        region: 'us-east-1',
        credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
        forcePathStyle: true,
        requestChecksumCalculation: 'WHEN_REQUIRED',
        responseChecksumValidation: 'WHEN_REQUIRED',
    })
    try {
        await s3.send(new CreateBucketCommand({ Bucket: MINIO_BUCKET }))
    } catch (err: unknown) {
        // Bucket may already exist (e.g. CI with MINIO_DEFAULT_BUCKETS)
        const code = (err as { name?: string }).name
        if (code !== 'BucketAlreadyOwnedByYou' && code !== 'BucketAlreadyExists') {
            throw err
        }
    }
    await s3.destroy()
}

function makeStorage(endpoint: string): OvhS3StorageService {
    return new OvhS3StorageService({
        accessKey: process.env.TEST_MINIO_ACCESS_KEY || MINIO_USER,
        secretKey: process.env.TEST_MINIO_SECRET_KEY || MINIO_PASSWORD,
        endpoint,
        region: 'us-east-1',
        bucket: process.env.TEST_MINIO_BUCKET || MINIO_BUCKET,
        pathStyle: true,
    })
}

async function startPostgres(): Promise<{ container: StartedTestContainer; host: string; port: number }> {
    const container = await new GenericContainer('postgres:16-alpine')
        .withEnvironment({
            POSTGRES_USER: 'test',
            POSTGRES_PASSWORD: 'test',
            POSTGRES_DB: 'test',
        })
        .withExposedPorts(5432)
        .withWaitStrategy(Wait.forLogMessage('database system is ready to accept connections'))
        .start()

    return {
        container,
        host: container.getHost(),
        port: container.getMappedPort(5432),
    }
}

/**
 * Set up full E2E infrastructure: PostgreSQL + MinIO + DatabaseAdapter + StorageService + AuthMiddleware.
 *
 * In CI, uses env vars (TEST_PG_HOST, TEST_MINIO_ENDPOINT) if available.
 * Otherwise, starts containers via testcontainers.
 */
export async function setupInfrastructure(): Promise<E2EInfrastructure> {
    const containers: StartedTestContainer[] = []

    // --- PostgreSQL ---
    let pgHost: string
    let pgPort: number
    const pgUser = process.env.TEST_PG_USER || 'test'
    const pgPassword = process.env.TEST_PG_PASSWORD || 'test'
    const pgDatabase = process.env.TEST_PG_DATABASE || 'test'

    if (process.env.TEST_PG_HOST) {
        pgHost = process.env.TEST_PG_HOST
        pgPort = parseInt(process.env.TEST_PG_PORT || '5432', 10)
    } else {
        const pg = await startPostgres()
        containers.push(pg.container)
        pgHost = pg.host
        pgPort = pg.port
    }

    // --- MinIO ---
    let minioEndpoint: string

    if (process.env.TEST_MINIO_ENDPOINT) {
        minioEndpoint = process.env.TEST_MINIO_ENDPOINT
    } else {
        const minio = await startMinio()
        containers.push(minio.container)
        minioEndpoint = minio.endpoint
    }

    await createBucket(minioEndpoint)

    // --- Storage ---
    const storage = makeStorage(minioEndpoint)

    // --- Database ---
    const dataResolver = async (url: string) => storage.retrieve(url)
    const db = await KyselyDatabaseAdapter.forPostgreSQL(
        { host: pgHost, port: pgPort, user: pgUser, password: pgPassword, database: pgDatabase },
        dataResolver
    )

    // Initialize user tables (needed for auth)
    await db.getUserRepository().initializeTables()

    // --- Auth ---
    // Disable auth for simpler E2E testing — auth_helpers.ts simulates it
    process.env.DIGITALTWIN_DISABLE_AUTH = 'true'
    const userService = new UserService(db.getUserRepository())
    const authMiddleware = new AuthMiddleware(userService)

    return {
        db,
        storage,
        authMiddleware,
        cleanup: async () => {
            await db.close()
            for (const c of containers) {
                await c.stop()
            }
        },
    }
}
