import { test } from '@japa/runner'
import {
    HealthChecker,
    createDatabaseCheck,
    performHealthCheck,
    livenessCheck
} from '../src/health.js'
import { MockDatabaseAdapter } from './fixtures/mock_database.js'

test.group('HealthChecker', () => {
    test('reports healthy when all checks pass', async ({ assert }) => {
        const checker = new HealthChecker()
        checker.registerCheck('db', async () => ({ status: 'up' }))
        checker.registerCheck('cache', async () => ({ status: 'up' }))

        const result = await checker.performCheck()

        assert.equal(result.status, 'healthy')
        assert.equal(result.checks['db'].status, 'up')
        assert.equal(result.checks['cache'].status, 'up')
    })

    test('reports degraded when non-database check fails', async ({ assert }) => {
        const checker = new HealthChecker()
        checker.registerCheck('database', async () => ({ status: 'up' }))
        checker.registerCheck('redis', async () => ({ status: 'down', error: 'Connection refused' }))

        const result = await checker.performCheck()

        assert.equal(result.status, 'degraded')
    })

    test('reports unhealthy when database check fails', async ({ assert }) => {
        const checker = new HealthChecker()
        checker.registerCheck('database', async () => ({ status: 'down', error: 'DB error' }))
        checker.registerCheck('redis', async () => ({ status: 'up' }))

        const result = await checker.performCheck()

        assert.equal(result.status, 'unhealthy')
    })

    test('catches exceptions from failing checks and marks them down', async ({ assert }) => {
        const checker = new HealthChecker()
        checker.registerCheck('buggy', async () => { throw new Error('Check crashed') })

        const result = await checker.performCheck()

        assert.equal(result.status, 'degraded')
        assert.equal(result.checks['buggy'].status, 'down')
        assert.equal(result.checks['buggy'].error, 'Check crashed')
    })

    test('measures latency for each check', async ({ assert }) => {
        const checker = new HealthChecker()
        checker.registerCheck('slow', async () => {
            await new Promise(resolve => setTimeout(resolve, 15))
            return { status: 'up' }
        })

        const result = await checker.performCheck()

        assert.isNumber(result.checks['slow'].latency)
        assert.isAbove(result.checks['slow'].latency!, 10)
    })

    test('includes timestamp, uptime, version, and component counts', async ({ assert }) => {
        const checker = new HealthChecker()
        checker.registerCheck('test', async () => ({ status: 'up' }))
        checker.setVersion('2.0.0')
        checker.setComponentCounts({ collectors: 3, harvesters: 1, handlers: 2, assetsManagers: 0 })

        const result = await checker.performCheck()

        assert.isString(result.timestamp)
        assert.isNumber(result.uptime)
        assert.equal(result.version, '2.0.0')
        assert.equal(result.components?.collectors, 3)
    })

    test('register and remove checks', ({ assert }) => {
        const checker = new HealthChecker()
        checker.registerCheck('temp', async () => ({ status: 'up' }))
        assert.include(checker.getCheckNames(), 'temp')

        const removed = checker.removeCheck('temp')
        assert.isTrue(removed)
        assert.notInclude(checker.getCheckNames(), 'temp')

        assert.isFalse(checker.removeCheck('non-existent'))
    })
})

test.group('createDatabaseCheck', () => {
    test('returns up when database is accessible', async ({ assert }) => {
        const db = new MockDatabaseAdapter()
        const check = createDatabaseCheck(db)
        const result = await check()

        assert.equal(result.status, 'up')
    })

    test('returns down when database throws', async ({ assert }) => {
        const db = new MockDatabaseAdapter({ shouldThrow: { doesTableExists: true } })
        const check = createDatabaseCheck(db)
        const result = await check()

        assert.equal(result.status, 'down')
        assert.isDefined(result.error)
    })
})

test.group('performHealthCheck', () => {
    test('runs database check and returns status with component counts', async ({ assert }) => {
        const db = new MockDatabaseAdapter()

        const result = await performHealthCheck(db, null, undefined, {
            collectors: 5, harvesters: 3, handlers: 2, assetsManagers: 1
        })

        assert.equal(result.status, 'healthy')
        assert.isDefined(result.checks['database'])
        assert.equal(result.components?.collectors, 5)
    })
})
