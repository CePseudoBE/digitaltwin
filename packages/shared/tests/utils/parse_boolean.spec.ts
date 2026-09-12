import { test } from '@japa/runner'
import { parseBoolean } from '../../src/utils/parse_boolean.js'
import { ValidationError } from '../../src/errors/index.js'

test.group('parseBoolean', () => {
    test('passes booleans through', ({ assert }) => {
        assert.isTrue(parseBoolean(true))
        assert.isFalse(parseBoolean(false))
    })

    test('parses form-field strings, including the ones Boolean() gets wrong', ({ assert }) => {
        assert.isFalse(parseBoolean('false'))
        assert.isFalse(parseBoolean('0'))
        assert.isFalse(parseBoolean(' FALSE '))
        assert.isTrue(parseBoolean('true'))
        assert.isTrue(parseBoolean('1'))
        assert.isTrue(parseBoolean('True'))
    })

    test('parses numeric 0 and 1', ({ assert }) => {
        assert.isFalse(parseBoolean(0))
        assert.isTrue(parseBoolean(1))
    })

    test('treats missing values as not provided', ({ assert }) => {
        assert.isUndefined(parseBoolean(undefined))
        assert.isUndefined(parseBoolean(null))
        assert.isUndefined(parseBoolean(''))
    })

    test('rejects anything else with a ValidationError naming the field', ({ assert }) => {
        assert.throws(() => parseBoolean('maybe', 'is_public'), ValidationError)
        assert.throws(() => parseBoolean('maybe', 'is_public'), /is_public/)
        assert.throws(() => parseBoolean(2), ValidationError)
        assert.throws(() => parseBoolean({}), ValidationError)
    })
})
