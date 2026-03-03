import { Env } from '../../src/env/env.js'
import { test } from '@japa/runner'



test.group('Env.validate', () => {
    test('validates required string', ({ assert }) => {
        const config = Env.validate({
            FOO: Env.schema.string()
        }, {
            FOO: 'bar'
        })

        assert.equal(config.FOO, 'bar')
    })

    test('throws if required string is missing', ({ assert }) => {
        assert.throws(() => {
            Env.validate({
                FOO: Env.schema.string()
            }, {})
        }, 'Missing environment variable: FOO')
    })

    test('supports optional string', ({ assert }) => {
        const config = Env.validate({
            BAR: Env.schema.string({ optional: true })
        }, {})

        assert.isUndefined(config.BAR)
    })

    test('validates url format', ({ assert }) => {
        assert.throws(() => {
            Env.validate({
                URL: Env.schema.string({ format: 'url' })
            }, {
                URL: 'not-a-url'
            })
        }, 'Invalid URL format for URL')

        const config = Env.validate({
            URL: Env.schema.string({ format: 'url' })
        }, {
            URL: 'https://example.com'
        })

        assert.equal(config.URL, 'https://example.com')
    })


    test('validates number', ({ assert }) => {
        const config = Env.validate({
            PORT: Env.schema.number()
        }, {
            PORT: '3000'
        })

        assert.equal(config.PORT, 3000)
    })

    test('validates enum', ({ assert }) => {
        const config = Env.validate({
            MODE: Env.schema.enum(['dev', 'prod'])
        }, {
            MODE: 'prod'
        })

        assert.equal(config.MODE, 'prod')
    })

    test('throws on invalid enum value', ({ assert }) => {
        assert.throws(() => {
            Env.validate({
                MODE: Env.schema.enum(['dev', 'prod'])
            }, {
                MODE: 'staging'
            })
        }, 'Invalid value for MODE, expected one of dev, prod')
    })

    test('validates email format', ({ assert }) => {
        assert.throws(() => {
            Env.validate({
                EMAIL: Env.schema.string({ format: 'email' })
            }, {
                EMAIL: 'invalid_email'
            })
        }, 'Invalid email format for EMAIL')

        const config = Env.validate({
            EMAIL: Env.schema.string({ format: 'email' })
        }, {
            EMAIL: 'test@example.com'
        })

        assert.equal(config.EMAIL, 'test@example.com')
    })

    test('Env.config equals object returned by validate', ({ assert }) => {
        const config = Env.validate({
            HELLO: Env.schema.string()
        }, {
            HELLO: 'world'
        })

        assert.deepEqual(Env.config, config)

        Env.config = {}
    })

})
