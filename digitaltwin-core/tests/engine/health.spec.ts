import { test } from '@japa/runner'
import {
    HealthChecker,
    createDatabaseCheck,
    createRedisCheck,
    performHealthCheck,
    livenessCheck,
    type HealthCheckFn
} from '../../src/engine/health.js'
import { MockDatabaseAdapter } from '../mocks/mock_database_adapter.js'

test.group('livenessCheck', () => {
    test('returns ok status', ({ assert }) => {
        const result = livenessCheck()
        assert.deepEqual(result, { status: 'ok' })
    })
})

test.group('HealthChecker', () => {
    test('registerCheck adds a health check', ({ assert }) => {
        const checker = new HealthChecker()

        checker.registerCheck('test', async () => ({ status: 'up' }))

        assert.deepEqual(checker.getCheckNames(), ['test'])
    })

    test('removeCheck removes a health check', ({ assert }) => {
        const checker = new HealthChecker()

        checker.registerCheck('test', async () => ({ status: 'up' }))
        const removed = checker.removeCheck('test')

        assert.isTrue(removed)
        assert.deepEqual(checker.getCheckNames(), [])
    })

    test('removeCheck returns false for non-existent check', ({ assert }) => {
        const checker = new HealthChecker()
        const removed = checker.removeCheck('non-existent')
        assert.isFalse(removed)
    })

    test('performCheck returns healthy when all checks pass', async ({ assert }) => {
        const checker = new HealthChecker()

        checker.registerCheck('service1', async () => ({ status: 'up' }))
        checker.registerCheck('service2', async () => ({ status: 'up' }))

        const result = await checker.performCheck()

        assert.equal(result.status, 'healthy')
        assert.equal(result.checks['service1'].status, 'up')
        assert.equal(result.checks['service2'].status, 'up')
    })

    test('performCheck returns degraded when non-database check fails', async ({ assert }) => {
        const checker = new HealthChecker()

        checker.registerCheck('database', async () => ({ status: 'up' }))
        checker.registerCheck('redis', async () => ({ status: 'down', error: 'Connection refused' }))

        const result = await checker.performCheck()

        assert.equal(result.status, 'degraded')
    })

    test('performCheck returns unhealthy when database check fails', async ({ assert }) => {
        const checker = new HealthChecker()

        checker.registerCheck('database', async () => ({ status: 'down', error: 'DB error' }))
        checker.registerCheck('redis', async () => ({ status: 'up' }))

        const result = await checker.performCheck()

        assert.equal(result.status, 'unhealthy')
    })

    test('performCheck handles check exceptions gracefully', async ({ assert }) => {
        const checker = new HealthChecker()

        checker.registerCheck('failing', async () => {
            throw new Error('Check crashed')
        })

        const result = await checker.performCheck()

        assert.equal(result.status, 'degraded')
        assert.equal(result.checks['failing'].status, 'down')
        assert.equal(result.checks['failing'].error, 'Check crashed')
    })

    test('performCheck includes latency for each check', async ({ assert }) => {
        const checker = new HealthChecker()

        checker.registerCheck('slow', async () => {
            await new Promise(resolve => setTimeout(resolve, 10))
            return { status: 'up' }
        })

        const result = await checker.performCheck()

        assert.isNumber(result.checks['slow'].latency)
        assert.isAbove(result.checks['slow'].latency!, 5)
    })

    test('performCheck includes timestamp and uptime', async ({ assert }) => {
        const checker = new HealthChecker()
        checker.registerCheck('test', async () => ({ status: 'up' }))

        const result = await checker.performCheck()

        assert.isString(result.timestamp)
        assert.isNumber(result.uptime)
    })

    test('setComponentCounts includes components in result', async ({ assert }) => {
        const checker = new HealthChecker()

        checker.setComponentCounts({
            collectors: 2,
            harvesters: 1,
            handlers: 3,
            assetsManagers: 1
        })
        checker.registerCheck('test', async () => ({ status: 'up' }))

        const result = await checker.performCheck()

        assert.isDefined(result.components)
        assert.equal(result.components?.collectors, 2)
        assert.equal(result.components?.harvesters, 1)
    })

    test('setVersion includes version in result', async ({ assert }) => {
        const checker = new HealthChecker()

        checker.setVersion('1.2.3')
        checker.registerCheck('test', async () => ({ status: 'up' }))

        const result = await checker.performCheck()

        assert.equal(result.version, '1.2.3')
    })
})

test.group('createDatabaseCheck', () => {
    test('returns up when database is accessible', async ({ assert }) => {
        const db = new MockDatabaseAdapter()
        const check = createDatabaseCheck(db)

        const result = await check()

        assert.equal(result.status, 'up')
        assert.isNumber(result.latency)
    })

    test('returns down when database throws', async ({ assert }) => {
        const db = new MockDatabaseAdapter({ shouldThrow: { doesTableExists: true } })
        const check = createDatabaseCheck(db)

        const result = await check()

        assert.equal(result.status, 'down')
        assert.isDefined(result.error)
    })
})

test.group('performHealthCheck (convenience function)', () => {
    test('creates and runs checks for all provided services', async ({ assert }) => {
        const db = new MockDatabaseAdapter()

        const result = await performHealthCheck(db)

        assert.equal(result.status, 'healthy')
        assert.isDefined(result.checks['database'])
    })

    test('includes component counts when provided', async ({ assert }) => {
        const db = new MockDatabaseAdapter()

        const result = await performHealthCheck(db, null, undefined, {
            collectors: 5,
            harvesters: 3,
            handlers: 2,
            assetsManagers: 1
        })

        assert.equal(result.components?.collectors, 5)
    })
})
