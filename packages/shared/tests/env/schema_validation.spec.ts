import { test } from '@japa/runner'
import { Env } from '../../src/env/env.js'

test.group('Env schema validation', () => {
    test('throws if required OVH keys are missing', ({ assert }) => {
        const schema = {
            STORAGE_CONFIG: Env.schema.enum(['local', 'ovh']),
            OVH_ACCESS_KEY: Env.schema.string(),
            OVH_SECRET_KEY: Env.schema.string(),
            OVH_ENDPOINT: Env.schema.string({ format: 'url' }),
            OVH_BUCKET: Env.schema.string(),
        }

        assert.throws(() => {
            Env.validate(schema, {
                STORAGE_CONFIG: 'ovh',
                OVH_ACCESS_KEY: '', // <= vide
                OVH_SECRET_KEY: '', // <= vide
                OVH_ENDPOINT: '',   // <= vide
                OVH_BUCKET: ''      // <= vide
            })
        }, 'Missing environment variable: OVH_ACCESS_KEY')
    })

    test('passes when optional fields are omitted', ({ assert }) => {
        const schema = {
            STORAGE_CONFIG: Env.schema.enum(['local', 'ovh']),
            OVH_REGION: Env.schema.string({ optional: true }),
        }

        const config = Env.validate(schema, {
            STORAGE_CONFIG: 'local'
        })

        assert.equal(config.STORAGE_CONFIG, 'local')
        assert.isUndefined(config.OVH_REGION)
    })

    test('throws on invalid enum value', ({ assert }) => {
        const schema = {
            STORAGE_CONFIG: Env.schema.enum(['local', 'ovh']),
        }

        assert.throws(() => {
            Env.validate(schema, {
                STORAGE_CONFIG: 'gcp'
            })
        }, 'Invalid value for STORAGE_CONFIG, expected one of local, ovh')
    })
})
