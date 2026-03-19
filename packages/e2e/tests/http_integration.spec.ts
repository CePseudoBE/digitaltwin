/**
 * HTTP Integration Tests
 *
 * Starts the real DigitalTwinEngine with Express, sends HTTP requests
 * with x-user-id / x-user-roles headers (simulating APISIX gateway),
 * and verifies full-stack responses.
 */
import { test } from '@japa/runner'
import { RedisContainer } from '@testcontainers/redis'
import type { StartedRedisContainer } from '@testcontainers/redis'
import { setupInfrastructure, type E2EInfrastructure } from './helpers/setup.js'
import { DigitalTwinEngine } from '@cepseudo/engine'
import { AuthConfig } from '@cepseudo/auth'
import { LogLevel } from '@cepseudo/shared'
import {
    WeatherCollector,
    CalculatorHandler,
    E2ECustomTableManager,
} from './helpers/test_components.js'

const ENGINE_PORT = 19876

test.group('HTTP Integration — Engine + APISIX headers', (group) => {
    let infra: E2EInfrastructure
    let redis: StartedRedisContainer
    let engine: DigitalTwinEngine
    let collector: WeatherCollector
    let baseUrl: string

    group.setup(async () => {
        // --- Infrastructure ---
        infra = await setupInfrastructure()

        // Start Redis for queue manager
        redis = await new RedisContainer('redis:7-alpine').start()

        // --- Auth: ENABLED (not disabled) so APISIX header parsing is active ---
        delete process.env.DIGITALTWIN_DISABLE_AUTH
        AuthConfig._resetConfig()

        // Reset ApisixAuthParser cached provider
        const { ApisixAuthParser } = await import('@cepseudo/auth')
        ApisixAuthParser._resetProvider()

        // --- Components ---
        collector = new WeatherCollector()
        const handler = new CalculatorHandler()
        const customTable = new E2ECustomTableManager()

        // --- Engine ---
        engine = new DigitalTwinEngine({
            database: infra.db,
            storage: infra.storage,
            collectors: [collector],
            handlers: [handler],
            customTableManagers: [customTable],
            redis: {
                host: redis.getHost(),
                port: redis.getMappedPort(6379),
            },
            server: { port: ENGINE_PORT },
            logging: { level: LogLevel.SILENT },
            queues: { multiQueue: true },
        })

        await engine.start()
        baseUrl = `http://localhost:${ENGINE_PORT}`

        // Manually run the collector so its retrieve endpoint has data
        // (the cron schedule is every 15 min, too slow for tests)
        await collector.run()
    })

    group.teardown(async () => {
        try {
            await Promise.race([
                engine.stop(),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Engine stop timeout')), 5000)
                ),
            ])
        } catch {
            // Ignore shutdown errors
        }

        // Restore disabled auth for other test groups
        process.env.DIGITALTWIN_DISABLE_AUTH = 'true'
        AuthConfig._resetConfig()

        await redis.stop()
        await infra.cleanup()
    })

    // ── Health endpoints ──────────────────────────────────────────────────

    test('GET /api/health/live returns 200', async ({ assert }) => {
        const res = await fetch(`${baseUrl}/api/health/live`)
        assert.equal(res.status, 200)

        const body = await res.json()
        assert.equal(body.status, 'ok')
    })

    test('GET /api/health/ready returns 200', async ({ assert }) => {
        const res = await fetch(`${baseUrl}/api/health/ready`)
        assert.oneOf(res.status, [200, 503])
    })

    // ── Handler endpoints (no auth required) ──────────────────────────────

    test('GET /e2e-calculator/health returns 200', async ({ assert }) => {
        const res = await fetch(`${baseUrl}/e2e-calculator/health`)
        assert.equal(res.status, 200)

        const body = await res.json()
        assert.equal(body.status, 'ok')
    })

    test('POST /e2e-calculator/sum computes result', async ({ assert }) => {
        const res = await fetch(`${baseUrl}/e2e-calculator/sum`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ a: 17, b: 25 }),
        })
        assert.equal(res.status, 200)

        const body = await res.json()
        assert.equal(body.result, 42)
    })

    // ── Collector endpoint ────────────────────────────────────────────────

    test('GET /e2e-weather returns collected data', async ({ assert }) => {
        const res = await fetch(`${baseUrl}/e2e-weather`)
        assert.equal(res.status, 200)

        const body = await res.json()
        assert.properties(body, ['temperature', 'humidity', 'pressure', 'timestamp'])
        assert.equal(body.temperature, 22.5)
    })

    // ── CustomTableManager CRUD with APISIX headers ────────────────────────

    test('POST /{table} without auth headers returns 401', async ({ assert }) => {
        const res = await fetch(`${baseUrl}/e2e_custom_records`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: 'No Auth', value: 0 }),
        })
        assert.equal(res.status, 401)
    })

    test('POST /{table} with APISIX headers creates record', async ({ assert }) => {
        // Ensure user exists in DB first
        await infra.db.getUserRepository().findOrCreateUser({
            id: 'http-user-1',
            roles: ['user'],
        })

        const res = await fetch(`${baseUrl}/e2e_custom_records`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-user-id': 'http-user-1',
                'x-user-roles': 'user',
            },
            body: JSON.stringify({ title: 'HTTP Created', value: 42, active: true }),
        })
        assert.equal(res.status, 201)

        const body = await res.json()
        assert.property(body, 'id')
        assert.isAbove(body.id, 0)
    })

    test('GET /{table} returns all records', async ({ assert }) => {
        const res = await fetch(`${baseUrl}/e2e_custom_records`)
        assert.equal(res.status, 200)

        const body = await res.json()
        assert.isArray(body)
        assert.isAbove(body.length, 0)
    })

    test('GET /{table}/:id returns specific record', async ({ assert }) => {
        // Create a record first
        await infra.db.getUserRepository().findOrCreateUser({
            id: 'http-user-2',
            roles: ['user'],
        })

        const createRes = await fetch(`${baseUrl}/e2e_custom_records`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-user-id': 'http-user-2',
                'x-user-roles': 'user',
            },
            body: JSON.stringify({ title: 'Fetchable Record', value: 99 }),
        })
        const { id } = await createRes.json()

        const res = await fetch(`${baseUrl}/e2e_custom_records/${id}`)
        assert.equal(res.status, 200)

        const body = await res.json()
        assert.equal(body.title, 'Fetchable Record')
        assert.equal(body.value, 99)
    })

    test('PUT /{table}/:id as owner updates record', async ({ assert }) => {
        await infra.db.getUserRepository().findOrCreateUser({
            id: 'http-user-3',
            roles: ['user'],
        })

        const createRes = await fetch(`${baseUrl}/e2e_custom_records`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-user-id': 'http-user-3',
                'x-user-roles': 'user',
            },
            body: JSON.stringify({ title: 'Original Title', value: 10 }),
        })
        const { id } = await createRes.json()

        const res = await fetch(`${baseUrl}/e2e_custom_records/${id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'x-user-id': 'http-user-3',
                'x-user-roles': 'user',
            },
            body: JSON.stringify({ title: 'Updated Title', value: 20 }),
        })
        assert.equal(res.status, 200)
    })

    test('PUT /{table}/:id as non-owner returns 403', async ({ assert }) => {
        // Create record as user A
        await infra.db.getUserRepository().findOrCreateUser({
            id: 'http-owner-a',
            roles: ['user'],
        })
        await infra.db.getUserRepository().findOrCreateUser({
            id: 'http-owner-b',
            roles: ['user'],
        })

        const createRes = await fetch(`${baseUrl}/e2e_custom_records`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-user-id': 'http-owner-a',
                'x-user-roles': 'user',
            },
            body: JSON.stringify({ title: 'Owned by A', value: 1 }),
        })
        const { id } = await createRes.json()

        // Try to update as user B
        const res = await fetch(`${baseUrl}/e2e_custom_records/${id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'x-user-id': 'http-owner-b',
                'x-user-roles': 'user',
            },
            body: JSON.stringify({ title: 'Hacked by B' }),
        })
        assert.equal(res.status, 403)
    })

    test('DELETE /{table}/:id as owner succeeds', async ({ assert }) => {
        await infra.db.getUserRepository().findOrCreateUser({
            id: 'http-user-del',
            roles: ['user'],
        })

        const createRes = await fetch(`${baseUrl}/e2e_custom_records`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-user-id': 'http-user-del',
                'x-user-roles': 'user',
            },
            body: JSON.stringify({ title: 'To Be Deleted', value: 0 }),
        })
        const { id } = await createRes.json()

        const res = await fetch(`${baseUrl}/e2e_custom_records/${id}`, {
            method: 'DELETE',
            headers: {
                'x-user-id': 'http-user-del',
                'x-user-roles': 'user',
            },
        })
        assert.equal(res.status, 200)

        // Verify deletion
        const getRes = await fetch(`${baseUrl}/e2e_custom_records/${id}`)
        assert.equal(getRes.status, 404)
    })

    test('DELETE /{table}/:id as non-owner returns 403', async ({ assert }) => {
        await infra.db.getUserRepository().findOrCreateUser({
            id: 'http-del-owner',
            roles: ['user'],
        })
        await infra.db.getUserRepository().findOrCreateUser({
            id: 'http-del-attacker',
            roles: ['user'],
        })

        const createRes = await fetch(`${baseUrl}/e2e_custom_records`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-user-id': 'http-del-owner',
                'x-user-roles': 'user',
            },
            body: JSON.stringify({ title: 'Protected Record', value: 777 }),
        })
        const { id } = await createRes.json()

        const res = await fetch(`${baseUrl}/e2e_custom_records/${id}`, {
            method: 'DELETE',
            headers: {
                'x-user-id': 'http-del-attacker',
                'x-user-roles': 'user',
            },
        })
        assert.equal(res.status, 403)
    })

    // ── 404 for unknown routes ────────────────────────────────────────────

    test('GET /nonexistent returns 404', async ({ assert }) => {
        const res = await fetch(`${baseUrl}/nonexistent`)
        assert.equal(res.status, 404)
    })
})
