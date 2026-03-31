/**
 * NGSI-LD E2E Tests
 *
 * Starts a real DigitalTwinEngine with the @cepseudo/ngsi-ld plugin loaded
 * automatically. Verifies entity CRUD, subscription CRUD, and the full
 * notification flow: collect() → entity cache → subscription match → HTTP POST
 * to a local webhook receiver.
 *
 * Infrastructure: PostgreSQL (subscriptions) + Redis (entity cache, queues)
 * started via testcontainers (or CI env vars for PG, always testcontainers for Redis).
 */
import { test } from '@japa/runner'
import * as http from 'node:http'
import type { AddressInfo } from 'node:net'
import { RedisContainer } from '@testcontainers/redis'
import type { StartedRedisContainer } from '@testcontainers/redis'
import { DigitalTwinEngine } from '@cepseudo/engine'
import { LogLevel, Logger } from '@cepseudo/shared'
import { registerNgsiLd } from '@cepseudo/ngsi-ld'
import { setupInfrastructure, type E2EInfrastructure } from './helpers/setup.js'
import { NgsiLdWeatherCollector } from './helpers/test_components.js'

const ENGINE_PORT = 19878

// ── Webhook server helper ─────────────────────────────────────────────────────

interface WebhookServer {
    url: string
    waitForCall(timeoutMs?: number): Promise<unknown>
    stop(): Promise<void>
}

function startWebhookServer(): Promise<WebhookServer> {
    return new Promise((resolve, reject) => {
        const pending: Array<(body: unknown) => void> = []
        const received: unknown[] = []

        const server = http.createServer((req, res) => {
            let raw = ''
            req.on('data', chunk => { raw += chunk })
            req.on('end', () => {
                const body = JSON.parse(raw)
                received.push(body)
                if (pending.length > 0) {
                    pending.shift()!(body)
                }
                res.writeHead(200, { 'Content-Type': 'application/json' })
                res.end('{}')
            })
        })

        server.listen(0, '127.0.0.1', () => {
            const { port } = server.address() as AddressInfo
            resolve({
                url: `http://127.0.0.1:${port}/webhook`,
                waitForCall(timeoutMs = 15000): Promise<unknown> {
                    // If already received, return immediately
                    if (received.length > 0) return Promise.resolve(received[received.length - 1])
                    return new Promise((res, rej) => {
                        const timer = setTimeout(() => rej(new Error('Webhook not called within timeout')), timeoutMs)
                        pending.push(body => { clearTimeout(timer); res(body) })
                    })
                },
                stop(): Promise<void> {
                    return new Promise(res => server.close(() => res()))
                },
            })
        })

        server.on('error', reject)
    })
}

// ── Test group ────────────────────────────────────────────────────────────────

test.group('NGSI-LD E2E — engine + real HTTP', group => {
    let infra: E2EInfrastructure
    let redis: StartedRedisContainer
    let engine: DigitalTwinEngine
    let collector: NgsiLdWeatherCollector
    let baseUrl: string
    let webhook: WebhookServer

    group.setup(async () => {
        infra = await setupInfrastructure()
        redis = await new RedisContainer('redis:7-alpine').start()
        webhook = await startWebhookServer()

        collector = new NgsiLdWeatherCollector()

        engine = new DigitalTwinEngine({
            database: infra.db,
            storage: infra.storage,
            collectors: [collector],
            redis: {
                host: redis.getHost(),
                port: redis.getMappedPort(6379),
            },
            server: { port: ENGINE_PORT },
            logging: { level: LogLevel.SILENT },
            queues: { multiQueue: true },
        })

        // DIGITALTWIN_DISABLE_AUTH is already set to 'true' by setupInfrastructure()
        await engine.start()

        // Explicitly register the NGSI-LD plugin — pnpm strict isolation prevents
        // the engine's auto-discovery (dynamic import) from resolving @cepseudo/ngsi-ld
        // from the engine package's context. The e2e process owns the dependency.
        const redisConfig = engine.getRedisConfig()
        await registerNgsiLd({
            router: engine.getRouter(),
            db: engine.getDatabase(),
            redis: redisConfig,
            components: engine.getAllComponents(),
            logger: new Logger('ngsi-ld'),
        })

        baseUrl = `http://localhost:${ENGINE_PORT}`
    })

    group.teardown(async () => {
        await webhook.stop()
        try {
            await Promise.race([
                engine.stop(),
                new Promise((_, reject) => setTimeout(() => reject(new Error('stop timeout')), 5000)),
            ])
        } catch { /* ignore */ }
        await redis.stop()
        await infra.cleanup()
    })

    // ── Entity endpoints ──────────────────────────────────────────────────────

    test('POST /ngsi-ld/v1/entities creates entity, GET retrieves it', async ({ assert }) => {
        const entity = {
            id: 'urn:ngsi-ld:WeatherObserved:test-post-1',
            type: 'WeatherObserved',
            temperature: { type: 'Property', value: 21.0 },
        }

        const postRes = await fetch(`${baseUrl}/ngsi-ld/v1/entities`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(entity),
        })
        assert.equal(postRes.status, 201)
        assert.include(postRes.headers.get('Location') ?? '', encodeURIComponent(entity.id))

        const getRes = await fetch(`${baseUrl}/ngsi-ld/v1/entities/${encodeURIComponent(entity.id)}`)
        assert.equal(getRes.status, 200)

        const body = await getRes.json() as Record<string, unknown>
        assert.equal(body['id'], entity.id)
        assert.equal(body['type'], entity.type)
        assert.property(body, '@context')
    })

    test('GET /ngsi-ld/v1/entities?type= filters by entity type', async ({ assert }) => {
        await fetch(`${baseUrl}/ngsi-ld/v1/entities`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: 'urn:ngsi-ld:AirQualityObserved:e2e-1', type: 'AirQualityObserved', pm25: { type: 'Property', value: 45 } }),
        })

        const res = await fetch(`${baseUrl}/ngsi-ld/v1/entities?type=AirQualityObserved`)
        assert.equal(res.status, 200)

        const body = await res.json() as Array<Record<string, unknown>>
        assert.isArray(body)
        assert.isTrue(body.every(e => e['type'] === 'AirQualityObserved'))
    })

    test('GET /ngsi-ld/v1/entities?q= applies value filter', async ({ assert }) => {
        await fetch(`${baseUrl}/ngsi-ld/v1/entities`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: 'urn:ngsi-ld:WeatherObserved:q-hot', type: 'WeatherObserved', temperature: { type: 'Property', value: 38 } }),
        })
        await fetch(`${baseUrl}/ngsi-ld/v1/entities`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: 'urn:ngsi-ld:WeatherObserved:q-cold', type: 'WeatherObserved', temperature: { type: 'Property', value: 5 } }),
        })

        const res = await fetch(`${baseUrl}/ngsi-ld/v1/entities?type=WeatherObserved&q=temperature>30`)
        assert.equal(res.status, 200)

        const body = await res.json() as Array<Record<string, unknown>>
        const ids = body.map(e => e['id'])
        assert.include(ids, 'urn:ngsi-ld:WeatherObserved:q-hot')
        assert.notInclude(ids, 'urn:ngsi-ld:WeatherObserved:q-cold')
    })

    test('PATCH /ngsi-ld/v1/entities/:id merges attributes', async ({ assert }) => {
        const id = 'urn:ngsi-ld:WeatherObserved:patch-test'
        await fetch(`${baseUrl}/ngsi-ld/v1/entities`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, type: 'WeatherObserved', temperature: { type: 'Property', value: 10 } }),
        })

        const patchRes = await fetch(`${baseUrl}/ngsi-ld/v1/entities/${encodeURIComponent(id)}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ temperature: { type: 'Property', value: 25 } }),
        })
        assert.equal(patchRes.status, 204)

        const getRes = await fetch(`${baseUrl}/ngsi-ld/v1/entities/${encodeURIComponent(id)}`)
        const body = await getRes.json() as Record<string, { value: unknown }>
        assert.equal(body['temperature'].value, 25)
    })

    test('DELETE /ngsi-ld/v1/entities/:id removes entity', async ({ assert }) => {
        const id = 'urn:ngsi-ld:WeatherObserved:delete-test'
        await fetch(`${baseUrl}/ngsi-ld/v1/entities`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, type: 'WeatherObserved' }),
        })

        const delRes = await fetch(`${baseUrl}/ngsi-ld/v1/entities/${encodeURIComponent(id)}`, { method: 'DELETE' })
        assert.equal(delRes.status, 204)

        const getRes = await fetch(`${baseUrl}/ngsi-ld/v1/entities/${encodeURIComponent(id)}`)
        assert.equal(getRes.status, 404)
    })

    test('GET /ngsi-ld/v1/entities/:id returns 404 for unknown entity', async ({ assert }) => {
        const res = await fetch(`${baseUrl}/ngsi-ld/v1/entities/${encodeURIComponent('urn:ngsi-ld:Unknown:nobody')}`)
        assert.equal(res.status, 404)
    })

    test('POST /ngsi-ld/v1/entities missing id returns 400', async ({ assert }) => {
        const res = await fetch(`${baseUrl}/ngsi-ld/v1/entities`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'WeatherObserved' }),
        })
        assert.equal(res.status, 400)
    })

    // ── Types endpoint ────────────────────────────────────────────────────────

    test('GET /ngsi-ld/v1/types lists entity types in cache', async ({ assert }) => {
        await fetch(`${baseUrl}/ngsi-ld/v1/entities`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: 'urn:ngsi-ld:ParkingSpot:types-test', type: 'ParkingSpot' }),
        })

        const res = await fetch(`${baseUrl}/ngsi-ld/v1/types`)
        assert.equal(res.status, 200)

        const body = await res.json() as { typeList: string[] }
        assert.include(body.typeList, 'ParkingSpot')
    })

    // ── Subscription CRUD ─────────────────────────────────────────────────────

    test('POST /ngsi-ld/v1/subscriptions creates subscription', async ({ assert }) => {
        const res = await fetch(`${baseUrl}/ngsi-ld/v1/subscriptions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                entities: [{ type: 'WeatherObserved' }],
                notification: { endpoint: { uri: webhook.url }, format: 'normalized' },
            }),
        })
        assert.equal(res.status, 201)

        const body = await res.json() as Record<string, unknown>
        assert.match(String(body['id']), /^[0-9a-f-]{36}$/)
        assert.isTrue(body['isActive'])
        assert.include(res.headers.get('Location') ?? '', '/ngsi-ld/v1/subscriptions/')
    })

    test('GET /ngsi-ld/v1/subscriptions lists subscriptions', async ({ assert }) => {
        await fetch(`${baseUrl}/ngsi-ld/v1/subscriptions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: 'List test sub',
                entities: [{ type: 'WeatherObserved' }],
                notification: { endpoint: { uri: webhook.url } },
            }),
        })

        const res = await fetch(`${baseUrl}/ngsi-ld/v1/subscriptions`)
        assert.equal(res.status, 200)

        const body = await res.json() as unknown[]
        assert.isArray(body)
        assert.isAbove(body.length, 0)
    })

    test('PATCH /ngsi-ld/v1/subscriptions/:id updates subscription', async ({ assert }) => {
        const createRes = await fetch(`${baseUrl}/ngsi-ld/v1/subscriptions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: 'Before patch',
                entities: [{ type: 'WeatherObserved' }],
                notification: { endpoint: { uri: webhook.url } },
            }),
        })
        const { id } = await createRes.json() as { id: string }

        const patchRes = await fetch(`${baseUrl}/ngsi-ld/v1/subscriptions/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'After patch' }),
        })
        assert.equal(patchRes.status, 204)

        const getRes = await fetch(`${baseUrl}/ngsi-ld/v1/subscriptions/${id}`)
        const body = await getRes.json() as { name: string }
        assert.equal(body.name, 'After patch')
    })

    test('DELETE /ngsi-ld/v1/subscriptions/:id removes subscription', async ({ assert }) => {
        const createRes = await fetch(`${baseUrl}/ngsi-ld/v1/subscriptions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                entities: [{ type: 'WeatherObserved' }],
                notification: { endpoint: { uri: webhook.url } },
            }),
        })
        const { id } = await createRes.json() as { id: string }

        const delRes = await fetch(`${baseUrl}/ngsi-ld/v1/subscriptions/${id}`, { method: 'DELETE' })
        assert.equal(delRes.status, 204)

        const getRes = await fetch(`${baseUrl}/ngsi-ld/v1/subscriptions/${id}`)
        assert.equal(getRes.status, 404)
    })

    test('POST /ngsi-ld/v1/subscriptions missing endpoint.uri returns 400', async ({ assert }) => {
        const res = await fetch(`${baseUrl}/ngsi-ld/v1/subscriptions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                entities: [{ type: 'WeatherObserved' }],
                notification: { endpoint: {} },
            }),
        })
        assert.equal(res.status, 400)
    })

    // ── Full notification flow ─────────────────────────────────────────────────

    test('collect() → entity cached → subscription matched → webhook notified', async ({ assert }) => {
        // Create a fresh webhook server for this test to get a clean call count
        const notifyWebhook = await startWebhookServer()

        try {
            // Create subscription watching WeatherObserved with no throttling
            const createRes = await fetch(`${baseUrl}/ngsi-ld/v1/subscriptions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: 'E2E notification test',
                    entities: [{ type: 'WeatherObserved' }],
                    notification: {
                        endpoint: { uri: notifyWebhook.url },
                        format: 'normalized',
                    },
                    throttling: 0,
                }),
            })
            assert.equal(createRes.status, 201)

            // Manually run the collector — triggers the engine event bus
            await collector.run()

            // Wait for the webhook to receive the notification (up to 15s)
            const payload = await notifyWebhook.waitForCall(15000) as {
                type: string
                subscriptionId: string
                data: Array<{ type: string; temperature?: { value: number } }>
            }

            assert.equal(payload.type, 'Notification')
            assert.isString(payload.subscriptionId)
            assert.isArray(payload.data)
            assert.isAbove(payload.data.length, 0)

            const entity = payload.data[0]
            assert.equal(entity.type, 'WeatherObserved')
            assert.property(entity, 'temperature')
        } finally {
            await notifyWebhook.stop()
        }
    })
})
