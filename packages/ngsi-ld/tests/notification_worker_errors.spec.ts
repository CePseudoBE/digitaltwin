import { test } from '@japa/runner'
import { RedisContainer } from '@testcontainers/redis'
import type { StartedRedisContainer } from '@testcontainers/redis'
import { Logger } from '@cepseudo/shared'
import { startNotificationWorker } from '../src/notifications/notification_worker.js'
import type { SubscriptionStore } from '../src/subscriptions/subscription_store.js'
import type { SubscriptionCache } from '../src/subscriptions/subscription_cache.js'

test.group('notification worker - Redis errors', group => {
    let redis: StartedRedisContainer

    group.setup(async () => {
        redis = await new RedisContainer('redis:7-alpine').start()
        return async () => {
            await redis.stop()
        }
    })

    test('an error event goes through the plugin logger', async ({ assert }) => {
        const warnings: string[] = []
        const logger = new Logger('ngsi-ld')
        logger.warn = (message: string) => {
            warnings.push(message)
        }
        // No job runs in this test, so the store and cache are never touched
        const worker = startNotificationWorker({ host: redis.getHost(), port: redis.getPort() }, {} as SubscriptionStore, {} as SubscriptionCache, logger)
        try {
            await worker.waitUntilReady()
            // What BullMQ does when a Redis connection drops
            worker.emit('error', new Error('Connection is closed.'))
            assert.deepEqual(warnings, ['NGSI-LD notification worker error: Connection is closed.'])
        } finally {
            await worker.close()
        }
    })
})
