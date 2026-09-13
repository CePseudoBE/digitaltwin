import { test } from '@japa/runner'
import { debounce } from '../src/debounce.js'

const wait = (ms: number) => new Promise(r => setTimeout(r, ms))

test.group('debounce', () => {
    test('runs once after the quiet period, with the last arguments', async ({ assert }) => {
        const calls: number[] = []
        const fn = debounce((n: number) => { calls.push(n) }, 20)

        fn(1)
        fn(2)
        fn(3)
        assert.deepEqual(calls, [])

        await wait(40)
        assert.deepEqual(calls, [3])
    })

    test('a call during the quiet period restarts the timer', async ({ assert }) => {
        let count = 0
        const fn = debounce(() => { count++ }, 30)

        fn()
        await wait(20)
        fn()
        await wait(20)
        assert.equal(count, 0)
        await wait(20)
        assert.equal(count, 1)
    })

    test('cancel() drops the pending call', async ({ assert }) => {
        let count = 0
        const fn = debounce(() => { count++ }, 10)

        fn()
        fn.cancel()
        await wait(30)
        assert.equal(count, 0)
    })

    test('an async rejection goes to onError instead of an unhandled rejection', async ({ assert }) => {
        const errors: unknown[] = []
        const fn = debounce(async () => { throw new Error('queue closed') }, 5, err => errors.push(err))

        fn()
        await wait(30)
        assert.lengthOf(errors, 1)
        assert.equal((errors[0] as Error).message, 'queue closed')
    })

    test('a synchronous throw goes to onError too', async ({ assert }) => {
        const errors: unknown[] = []
        const fn = debounce(() => { throw new Error('sync') }, 5, err => errors.push(err))

        fn()
        await wait(30)
        assert.lengthOf(errors, 1)
    })
})
