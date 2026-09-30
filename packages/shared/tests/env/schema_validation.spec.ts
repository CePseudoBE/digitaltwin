import { test } from '@japa/runner'
import { Env } from '../../src/env/env.js'

test.group('Env schema validation', () => {
    test('throws if required S3 keys are missing', ({ assert }) => {
        const schema = {
            STORAGE_CONFIG: Env.schema.enum(['local', 's3']),
            S3_ACCESS_KEY_ID: Env.schema.string(),
            S3_SECRET_ACCESS_KEY: Env.schema.string(),
            S3_ENDPOINT: Env.schema.string({ format: 'url' }),
            S3_BUCKET: Env.schema.string(),
        }

        assert.throws(() => {
            Env.validate(schema, {
                STORAGE_CONFIG: 's3',
                S3_ACCESS_KEY_ID: '', // <= vide
                S3_SECRET_ACCESS_KEY: '', // <= vide
                S3_ENDPOINT: '',   // <= vide
                S3_BUCKET: ''      // <= vide
            })
        }, 'Missing environment variable: S3_ACCESS_KEY_ID')
    })

    test('passes when optional fields are omitted', ({ assert }) => {
        const schema = {
            STORAGE_CONFIG: Env.schema.enum(['local', 's3']),
            S3_REGION: Env.schema.string({ optional: true }),
        }

        const config = Env.validate(schema, {
            STORAGE_CONFIG: 'local'
        })

        assert.equal(config.STORAGE_CONFIG, 'local')
        assert.isUndefined(config.S3_REGION)
    })

    test('throws on invalid enum value', ({ assert }) => {
        const schema = {
            STORAGE_CONFIG: Env.schema.enum(['local', 's3']),
        }

        assert.throws(() => {
            Env.validate(schema, {
                STORAGE_CONFIG: 'gcp'
            })
        }, 'Invalid value for STORAGE_CONFIG, expected one of local, s3')
    })
})
