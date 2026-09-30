import { test } from '@japa/runner'
import Fastify from 'fastify'
import { RedisContainer } from '@testcontainers/redis'
import type { StartedRedisContainer } from '@testcontainers/redis'
import { KyselyDatabaseAdapter } from '@cepseudo/database'
import { Logger } from '@cepseudo/shared'
import { registerNgsiLd } from '../src/plugin.js'
import type { NgsiLdAuthenticator } from '../src/auth.js'

const denyAll: NgsiLdAuthenticator = { identify: async () => undefined }

test.group('registerNgsiLd publicRead', group => {
    let redis: StartedRedisContainer
    let db: KyselyDatabaseAdapter

    group.setup(async () => {
        redis = await new RedisContainer('redis:7-alpine').start()
        return async () => {
            await redis.stop()
        }
    })

    group.each.setup(async () => {
        db = await KyselyDatabaseAdapter.forSQLite({ filename: ':memory:', enableForeignKeys: false }, async () => Buffer.alloc(0))
        return async () => {
            delete process.env.NGSI_LD_PUBLIC_READ
            await db.close()
        }
    })

    async function anonymousStatus(method: 'GET' | 'POST', publicRead?: boolean): Promise<number> {
        const fastify = Fastify({ logger: false })
        const handle = await registerNgsiLd({
            fastify,
            db,
            redis: { host: redis.getHost(), port: redis.getPort() },
            components: [],
            logger: new Logger('ngsi-ld'),
            authMiddleware: denyAll,
            publicRead
        })
        try {
            const res = await fastify.inject({ method, url: '/ngsi-ld/v1/entities', payload: method === 'POST' ? { id: 'urn:ngsi-ld:T:1', type: 'T' } : undefined })
            return res.statusCode
        } finally {
            await handle.close()
            await fastify.close()
        }
    }

    test('anonymous reads are served by default, anonymous writes are refused', async ({ assert }) => {
        assert.equal(await anonymousStatus('GET'), 200)
        assert.equal(await anonymousStatus('POST'), 401)
    })

    test('NGSI_LD_PUBLIC_READ=false makes reads require credentials', async ({ assert }) => {
        process.env.NGSI_LD_PUBLIC_READ = 'false'
        assert.equal(await anonymousStatus('GET'), 401)
    })

    test('the publicRead option wins over NGSI_LD_PUBLIC_READ', async ({ assert }) => {
        process.env.NGSI_LD_PUBLIC_READ = 'false'
        assert.equal(await anonymousStatus('GET', true), 200)
    })
})
