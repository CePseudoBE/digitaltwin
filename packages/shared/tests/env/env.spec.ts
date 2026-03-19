import { Env } from '../../src/env/env.js'
import { test } from '@japa/runner'

test.group('Env.validate', () => {
    test('throws with clear message when required variable is missing', ({ assert }) => {
        assert.throws(() => {
            Env.validate({ DATABASE_URL: Env.schema.string() }, {})
        }, 'Missing environment variable: DATABASE_URL')
    })

    test('treats empty string as missing for required variables', ({ assert }) => {
        assert.throws(() => {
            Env.validate({ API_KEY: Env.schema.string() }, { API_KEY: '' })
        }, 'Missing environment variable: API_KEY')
    })

    test('returns undefined for optional variables when absent', ({ assert }) => {
        const config = Env.validate({
            OPTIONAL: Env.schema.string({ optional: true })
        }, {})

        assert.isUndefined(config.OPTIONAL)
    })

    test('stores validated config on Env.config', ({ assert }) => {
        const config = Env.validate({ KEY: Env.schema.string() }, { KEY: 'value' })

        assert.deepEqual(Env.config, config)
        Env.config = {}
    })
})

test.group('Env string format validation', () => {
    test('rejects invalid URL and accepts valid URL', ({ assert }) => {
        assert.throws(() => {
            Env.validate({ URL: Env.schema.string({ format: 'url' }) }, { URL: 'not-a-url' })
        }, 'Invalid URL format for URL')

        const config = Env.validate(
            { URL: Env.schema.string({ format: 'url' }) },
            { URL: 'https://example.com' }
        )
        assert.equal(config.URL, 'https://example.com')
    })

    test('rejects invalid email and accepts valid email', ({ assert }) => {
        assert.throws(() => {
            Env.validate({ EMAIL: Env.schema.string({ format: 'email' }) }, { EMAIL: 'invalid' })
        }, 'Invalid email format for EMAIL')

        const config = Env.validate(
            { EMAIL: Env.schema.string({ format: 'email' }) },
            { EMAIL: 'user@example.com' }
        )
        assert.equal(config.EMAIL, 'user@example.com')
    })
})

test.group('Env number parsing', () => {
    test('coerces string to number', ({ assert }) => {
        const config = Env.validate({ PORT: Env.schema.number() }, { PORT: '3000' })
        assert.strictEqual(config.PORT, 3000)
    })

    test('rejects non-numeric strings', ({ assert }) => {
        assert.throws(() => {
            Env.validate({ PORT: Env.schema.number() }, { PORT: 'not-a-number' })
        }, 'Invalid number format for PORT')
    })
})

test.group('Env boolean parsing', () => {
    test('accepts true/false and 1/0', ({ assert }) => {
        const config = Env.validate({
            A: Env.schema.boolean(),
            B: Env.schema.boolean(),
            C: Env.schema.boolean(),
            D: Env.schema.boolean()
        }, { A: 'true', B: 'false', C: '1', D: '0' })

        assert.strictEqual(config.A, true)
        assert.strictEqual(config.B, false)
        assert.strictEqual(config.C, true)
        assert.strictEqual(config.D, false)
    })

    test('rejects invalid boolean values', ({ assert }) => {
        assert.throws(() => {
            Env.validate({ DEBUG: Env.schema.boolean() }, { DEBUG: 'yes' })
        }, 'Invalid boolean format for DEBUG')
    })

    test('uses default value when optional and absent', ({ assert }) => {
        const config = Env.validate({
            DEBUG: Env.schema.boolean({ optional: true, default: false })
        }, {})

        assert.strictEqual(config.DEBUG, false)
    })
})

test.group('Env enum validation', () => {
    test('accepts valid enum value', ({ assert }) => {
        const config = Env.validate(
            { MODE: Env.schema.enum(['dev', 'prod']) },
            { MODE: 'prod' }
        )
        assert.equal(config.MODE, 'prod')
    })

    test('rejects invalid enum with helpful message listing allowed values', ({ assert }) => {
        assert.throws(() => {
            Env.validate(
                { MODE: Env.schema.enum(['dev', 'prod']) },
                { MODE: 'staging' }
            )
        }, 'Invalid value for MODE, expected one of dev, prod')
    })
})
