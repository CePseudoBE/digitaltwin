import { test } from '@japa/runner'
import { safeAsync, tryAsync, safeCleanup, retryAsync } from '../../src/utils/safe_async.js'

test.group('safeAsync', () => {
    test('returns result on success', async ({ assert }) => {
        const result = await safeAsync(
            async () => 'success',
            'test operation'
        )
        assert.equal(result, 'success')
    })

    test('swallows errors and returns undefined', async ({ assert }) => {
        const result = await safeAsync(
            async () => { throw new Error('fail') },
            'test operation'
        )
        assert.isUndefined(result)
    })
})

test.group('tryAsync', () => {
    test('returns [result, undefined] on success', async ({ assert }) => {
        const [result, error] = await tryAsync(async () => 'success')

        assert.equal(result, 'success')
        assert.isUndefined(error)
    })

    test('returns [undefined, error] on failure', async ({ assert }) => {
        const [result, error] = await tryAsync(async () => {
            throw new Error('test error')
        })

        assert.isUndefined(result)
        assert.instanceOf(error, Error)
        assert.equal(error?.message, 'test error')
    })

    test('wraps non-Error throws (string) into Error', async ({ assert }) => {
        const [, error] = await tryAsync(async () => { throw 'string error' })

        assert.instanceOf(error, Error)
        assert.equal(error?.message, 'string error')
    })
})

test.group('safeCleanup', () => {
    test('executes all operations even when some fail', async ({ assert }) => {
        const results: string[] = []

        await safeCleanup([
            { operation: async () => { results.push('first') }, context: 'first op' },
            { operation: async () => { throw new Error('fail') }, context: 'failing op' },
            { operation: async () => { results.push('third') }, context: 'third op' }
        ])

        assert.deepEqual(results, ['first', 'third'])
    })

    test('never throws even if all operations fail', async ({ assert }) => {
        await assert.doesNotReject(async () => {
            await safeCleanup([
                { operation: async () => { throw new Error('fail1') }, context: 'op1' },
                { operation: async () => { throw new Error('fail2') }, context: 'op2' }
            ])
        })
    })

    test('handles empty operations array', async ({ assert }) => {
        await assert.doesNotReject(async () => {
            await safeCleanup([])
        })
    })
})

test.group('retryAsync', () => {
    test('retries on failure then succeeds', async ({ assert }) => {
        let attempts = 0
        const result = await retryAsync(
            async () => {
                attempts++
                if (attempts < 3) throw new Error('not yet')
                return 'success after retries'
            },
            { maxRetries: 3, initialDelayMs: 10 }
        )

        assert.equal(result, 'success after retries')
        assert.equal(attempts, 3)
    })

    test('throws after exhausting all retries', async ({ assert }) => {
        let attempts = 0

        await assert.rejects(
            async () => {
                await retryAsync(
                    async () => {
                        attempts++
                        throw new Error('always fails')
                    },
                    { maxRetries: 2, initialDelayMs: 10 }
                )
            },
            /always fails/
        )

        assert.equal(attempts, 3) // initial + 2 retries
    })

    test('respects maxDelayMs cap on exponential backoff', async ({ assert }) => {
        const start = Date.now()

        try {
            await retryAsync(
                async () => { throw new Error('fail') },
                { maxRetries: 2, initialDelayMs: 1000, maxDelayMs: 50 }
            )
        } catch {
            // Expected
        }

        const elapsed = Date.now() - start
        // With maxDelayMs=50, two retries should take ~100ms max, not 1000+2000ms
        assert.isBelow(elapsed, 500)
    })

    test('with maxRetries: 0, attempts exactly once', async ({ assert }) => {
        let attempts = 0

        await assert.rejects(async () => {
            await retryAsync(
                async () => {
                    attempts++
                    throw new Error('single attempt')
                },
                { maxRetries: 0, initialDelayMs: 10 }
            )
        })

        assert.equal(attempts, 1)
    })
})
