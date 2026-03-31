import { test } from '@japa/runner'
import { randomUUID } from 'node:crypto'
import * as http from 'node:http'
import { Queue, Worker } from 'bullmq'
import { Redis } from 'ioredis'
import { RedisContainer } from '@testcontainers/redis'
import { startNotificationWorker } from '../src/notifications/notification_worker.js'
import type { NotificationJobData, NotificationPayload } from '../src/types/notification.js'
import type { Subscription } from '../src/types/subscription.js'
import type { NgsiLdEntity } from '../src/types/entity.js'
import { property } from '../src/helpers/property.js'
import { buildUrn } from '../src/helpers/urn.js'

const QUEUE_NAME = 'ngsi-ld-notifications'

// --- Helpers ---

function makeSub(endpoint: string, overrides: Partial<Subscription> = {}): Subscription {
    return {
        id: randomUUID(),
        entityTypes: ['AirQualityObserved'],
        notificationEndpoint: endpoint,
        notificationFormat: 'normalized',
        throttling: 0,
        isActive: true,
        timesSent: 0,
        timesFailed: 0,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
        ...overrides,
    }
}

function makeEntity(): NgsiLdEntity {
    return {
        id: buildUrn('AirQualityObserved', 'sensor-1'),
        type: 'AirQualityObserved',
        pm25: property(55),
    }
}

// --- Mock store and cache ---

interface RecordedNotification {
    id: string
    success: boolean
    at: string
}

function makeMockStore() {
    const calls: RecordedNotification[] = []
    return {
        calls,
        async recordNotification(id: string, success: boolean, at: string): Promise<void> {
            calls.push({ id, success, at })
        },
    }
}

interface RecordedCacheUpdate {
    id: string
    at: string
}

function makeMockCache() {
    const calls: RecordedCacheUpdate[] = []
    return {
        calls,
        async updateLastNotified(id: string, at: string): Promise<void> {
            calls.push({ id, at })
        },
    }
}

function makeMockLogger() {
    return {
        info(_msg: string) {},
        warn(_msg: string) {},
    }
}

// --- HTTP webhook helpers ---

interface WebhookRequest {
    method: string
    headers: http.IncomingHttpHeaders
    body: string
}

function startWebhookServer(statusCode: number): Promise<{ server: http.Server; requests: WebhookRequest[]; url: string }> {
    return new Promise(resolve => {
        const requests: WebhookRequest[] = []
        const server = http.createServer((req, res) => {
            let body = ''
            req.on('data', chunk => { body += chunk })
            req.on('end', () => {
                requests.push({ method: req.method ?? '', headers: req.headers, body })
                res.writeHead(statusCode)
                res.end()
            })
        })
        server.listen(0, '127.0.0.1', () => {
            const addr = server.address() as { port: number }
            resolve({ server, requests, url: `http://127.0.0.1:${addr.port}/webhook` })
        })
    })
}

function waitForEvent(emitter: { on: (event: string, cb: (...args: any[]) => void) => void }, event: string, timeoutMs = 10000): Promise<void> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`Timed out waiting for '${event}' event`)), timeoutMs)
        emitter.on(event, () => {
            clearTimeout(timer)
            resolve()
        })
    })
}

// --- Tests ---

test.group('notification worker (integration)', group => {
    let redisContainer: Awaited<ReturnType<ReturnType<typeof RedisContainer.prototype.start>['constructor']>>
    let redis: Redis
    let queue: Queue<NotificationJobData>
    let worker: Worker<NotificationJobData>
    let webhookServer: http.Server
    let webhookRequests: WebhookRequest[]
    let webhookUrl: string
    let store: ReturnType<typeof makeMockStore>
    let cache: ReturnType<typeof makeMockCache>

    group.each.setup(async () => {
        redisContainer = await new RedisContainer('redis:7-alpine').start()
        const host = (redisContainer as any).getHost() as string
        const port = (redisContainer as any).getPort() as number

        redis = new Redis({ host, port, maxRetriesPerRequest: null })

        const connection = { host, port }
        queue = new Queue<NotificationJobData>(QUEUE_NAME, { connection })
        store = makeMockStore()
        cache = makeMockCache()
        const logger = makeMockLogger()
        worker = startNotificationWorker(connection, store as any, cache as any, logger as any)
    })

    group.each.teardown(async () => {
        await worker.close()
        await queue.close()
        if (webhookServer) {
            await new Promise<void>(resolve => webhookServer.close(() => resolve()))
        }
        await redis.quit()
        await (redisContainer as any).stop()
    })

    test('delivers notification via POST and records success', async ({ assert }) => {
        const webhook = await startWebhookServer(200)
        webhookServer = webhook.server
        webhookRequests = webhook.requests
        webhookUrl = webhook.url

        const sub = makeSub(webhookUrl)
        const entity = makeEntity()
        const notificationId = randomUUID()
        const notifiedAt = new Date().toISOString()

        const jobData: NotificationJobData = {
            subscription: sub,
            entity,
            notificationId,
            notifiedAt,
        }

        await queue.add('notify', jobData, { attempts: 1 })
        await waitForEvent(worker, 'completed')

        // Webhook received the POST
        assert.lengthOf(webhookRequests, 1)
        assert.equal(webhookRequests[0].method, 'POST')

        // Content-Type header was application/ld+json
        assert.equal(webhookRequests[0].headers['content-type'], 'application/ld+json')

        // Payload is a valid NotificationPayload
        const payload = JSON.parse(webhookRequests[0].body) as NotificationPayload
        assert.equal(payload.type, 'Notification')
        assert.equal(payload.subscriptionId, sub.id)
        assert.lengthOf(payload.data, 1)
        assert.equal(payload.data[0].id, entity.id)

        // store.recordNotification called with success = true
        assert.lengthOf(store.calls, 1)
        assert.equal(store.calls[0].id, sub.id)
        assert.isTrue(store.calls[0].success)
        assert.equal(store.calls[0].at, notifiedAt)

        // cache.updateLastNotified called
        assert.lengthOf(cache.calls, 1)
        assert.equal(cache.calls[0].id, sub.id)
        assert.equal(cache.calls[0].at, notifiedAt)
    })

    test('records failure when webhook returns HTTP 500', async ({ assert }) => {
        const webhook = await startWebhookServer(500)
        webhookServer = webhook.server
        webhookRequests = webhook.requests
        webhookUrl = webhook.url

        const sub = makeSub(webhookUrl)
        const entity = makeEntity()
        const notificationId = randomUUID()
        const notifiedAt = new Date().toISOString()

        const jobData: NotificationJobData = {
            subscription: sub,
            entity,
            notificationId,
            notifiedAt,
        }

        // Use attempts: 1 so we do not wait for retries
        await queue.add('notify', jobData, { attempts: 1 })
        await waitForEvent(worker, 'failed')

        // store.recordNotification called with success = false
        assert.lengthOf(store.calls, 1)
        assert.equal(store.calls[0].id, sub.id)
        assert.isFalse(store.calls[0].success)
    })
})
