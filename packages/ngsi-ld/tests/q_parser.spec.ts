import { test } from '@japa/runner'
import { parseQ, evaluateQ } from '../src/subscriptions/q_parser.js'
import type { NgsiLdEntity } from '../src/types/entity.js'

function makeEntity(attrs: Record<string, unknown>): NgsiLdEntity {
    const entity: NgsiLdEntity = { id: 'urn:ngsi-ld:Test:1', type: 'Test' }
    for (const [key, value] of Object.entries(attrs)) {
        if (typeof value === 'object' && value !== null && 'type' in value) {
            entity[key] = value as never
        } else {
            entity[key] = { type: 'Property', value } as never
        }
    }
    return entity
}

test.group('parseQ() - single comparisons', () => {
    test('parses == comparison', ({ assert }) => {
        const expr = parseQ('status=="ok"')
        assert.equal(expr.kind, 'comparison')
        if (expr.kind === 'comparison') {
            assert.equal(expr.attribute, 'status')
            assert.equal(expr.operator, '==')
            assert.equal(expr.value, 'ok')
        }
    })

    test('parses > with number', ({ assert }) => {
        const expr = parseQ('pm25>30')
        assert.equal(expr.kind, 'comparison')
        if (expr.kind === 'comparison') {
            assert.equal(expr.attribute, 'pm25')
            assert.equal(expr.operator, '>')
            assert.equal(expr.value, 30)
        }
    })

    test('parses >= operator', ({ assert }) => {
        const expr = parseQ('temperature>=20')
        if (expr.kind === 'comparison') {
            assert.equal(expr.operator, '>=')
        }
    })

    test('parses <= operator', ({ assert }) => {
        const expr = parseQ('humidity<=80')
        if (expr.kind === 'comparison') {
            assert.equal(expr.operator, '<=')
        }
    })

    test('parses != operator', ({ assert }) => {
        const expr = parseQ('status!="down"')
        if (expr.kind === 'comparison') {
            assert.equal(expr.operator, '!=')
        }
    })

    test('parses < operator', ({ assert }) => {
        const expr = parseQ('noise<50')
        if (expr.kind === 'comparison') {
            assert.equal(expr.operator, '<')
            assert.equal(expr.value, 50)
        }
    })

    test('throws on empty expression', ({ assert }) => {
        assert.throws(() => parseQ(''), /Empty q-filter/)
    })

    test('throws on invalid term', ({ assert }) => {
        assert.throws(() => parseQ('justanattr'), /Invalid q-filter term/)
    })
})

test.group('parseQ() - edge cases', () => {
    test('parses float value correctly', ({ assert }) => {
        const expr = parseQ('temperature>=18.5')
        assert.equal(expr.kind, 'comparison')
        if (expr.kind === 'comparison') {
            assert.equal(expr.value, 18.5)
        }
    })

    test('parses term with whitespace around operator', ({ assert }) => {
        // The regex allows optional whitespace around operators
        const expr = parseQ('pm25 > 30')
        assert.equal(expr.kind, 'comparison')
        if (expr.kind === 'comparison') {
            assert.equal(expr.attribute, 'pm25')
            assert.equal(expr.operator, '>')
            assert.equal(expr.value, 30)
        }
    })

    test('semicolon inside quoted value is a known limitation', ({ assert }) => {
        // The parser splits on ';' before parsing individual terms.
        // A value like "Jean;Pierre" would be split into ['name=="Jean', 'Pierre"']
        // which causes a parse error. This is a known v1 limitation.
        assert.throws(() => parseQ('name=="Jean;Pierre"'))
    })
})

test.group('parseQ() - AND chaining with ;', () => {
    test('parses AND chain as QAnd', ({ assert }) => {
        const expr = parseQ('pm25>30;temperature<10')
        assert.equal(expr.kind, 'and')
        if (expr.kind === 'and') {
            assert.lengthOf(expr.terms, 2)
            assert.equal(expr.terms[0].attribute, 'pm25')
            assert.equal(expr.terms[1].attribute, 'temperature')
        }
    })

    test('parses three-term AND chain', ({ assert }) => {
        const expr = parseQ('pm25>30;temperature<10;humidity!=95')
        assert.equal(expr.kind, 'and')
        if (expr.kind === 'and') {
            assert.lengthOf(expr.terms, 3)
        }
    })
})

test.group('evaluateQ() - number comparisons', () => {
    test('> passes when attribute value is higher', ({ assert }) => {
        const entity = makeEntity({ pm25: 63.2 })
        const expr = parseQ('pm25>30')
        assert.isTrue(evaluateQ(expr, entity))
    })

    test('> fails when attribute value is lower', ({ assert }) => {
        const entity = makeEntity({ pm25: 10 })
        const expr = parseQ('pm25>30')
        assert.isFalse(evaluateQ(expr, entity))
    })

    test('< passes when attribute value is lower', ({ assert }) => {
        const entity = makeEntity({ temperature: 5 })
        const expr = parseQ('temperature<10')
        assert.isTrue(evaluateQ(expr, entity))
    })

    test('>= passes on equal value', ({ assert }) => {
        const entity = makeEntity({ level: 50 })
        const expr = parseQ('level>=50')
        assert.isTrue(evaluateQ(expr, entity))
    })

    test('<= passes on equal value', ({ assert }) => {
        const entity = makeEntity({ level: 50 })
        const expr = parseQ('level<=50')
        assert.isTrue(evaluateQ(expr, entity))
    })
})

test.group('evaluateQ() - string comparisons', () => {
    test('== passes with matching string', ({ assert }) => {
        const entity = makeEntity({ status: 'ok' })
        const expr = parseQ('status=="ok"')
        assert.isTrue(evaluateQ(expr, entity))
    })

    test('== fails with non-matching string', ({ assert }) => {
        const entity = makeEntity({ status: 'down' })
        const expr = parseQ('status=="ok"')
        assert.isFalse(evaluateQ(expr, entity))
    })

    test('!= passes when attribute is different', ({ assert }) => {
        const entity = makeEntity({ status: 'down' })
        const expr = parseQ('status!="ok"')
        assert.isTrue(evaluateQ(expr, entity))
    })
})

test.group('evaluateQ() - missing attributes', () => {
    test('missing attribute with != returns true', ({ assert }) => {
        const entity = makeEntity({})
        const expr = parseQ('missingAttr!="x"')
        assert.isTrue(evaluateQ(expr, entity))
    })

    test('missing attribute with == returns false', ({ assert }) => {
        const entity = makeEntity({})
        const expr = parseQ('missingAttr=="x"')
        assert.isFalse(evaluateQ(expr, entity))
    })

    test('missing attribute with > returns false', ({ assert }) => {
        const entity = makeEntity({})
        const expr = parseQ('missingAttr>0')
        assert.isFalse(evaluateQ(expr, entity))
    })
})

test.group('evaluateQ() - AND chain', () => {
    test('AND: all terms pass → true', ({ assert }) => {
        const entity = makeEntity({ pm25: 63.2, temperature: 5 })
        const expr = parseQ('pm25>30;temperature<10')
        assert.isTrue(evaluateQ(expr, entity))
    })

    test('AND: one term fails → false', ({ assert }) => {
        const entity = makeEntity({ pm25: 10, temperature: 5 })
        const expr = parseQ('pm25>30;temperature<10')
        assert.isFalse(evaluateQ(expr, entity))
    })

    test('AND: all terms fail → false', ({ assert }) => {
        const entity = makeEntity({ pm25: 10, temperature: 25 })
        const expr = parseQ('pm25>30;temperature<10')
        assert.isFalse(evaluateQ(expr, entity))
    })
})
