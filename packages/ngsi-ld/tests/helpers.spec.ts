import { test } from '@japa/runner'
import { property, geoProperty, relationship } from '../src/helpers/property.js'
import { buildUrn, parseUrn } from '../src/helpers/urn.js'
import { isNgsiLdCollector, isNgsiLdHarvester } from '../src/components/type_guards.js'

test.group('property()', () => {
    test('creates a Property with the given value', ({ assert }) => {
        const p = property(42)
        assert.equal(p.type, 'Property')
        assert.equal(p.value, 42)
    })

    test('passes through optional metadata', ({ assert }) => {
        const p = property('hello', { observedAt: '2026-01-01T00:00:00Z', unitCode: 'CEL' })
        assert.equal(p.type, 'Property')
        assert.equal(p.value, 'hello')
        assert.equal(p.observedAt, '2026-01-01T00:00:00Z')
        assert.equal(p.unitCode, 'CEL')
    })

    test('handles boolean values', ({ assert }) => {
        const p = property(true)
        assert.equal(p.type, 'Property')
        assert.equal(p.value, true)
    })

    test('handles array values', ({ assert }) => {
        const p = property(['a', 'b'])
        assert.deepEqual(p.value, ['a', 'b'])
    })

    test('handles null value', ({ assert }) => {
        const p = property(null)
        assert.equal(p.type, 'Property')
        assert.isNull(p.value)
    })
})

test.group('geoProperty()', () => {
    test('creates a GeoProperty with Point geometry', ({ assert }) => {
        const geo = geoProperty({ type: 'Point', coordinates: [4.35, 50.85] })
        assert.equal(geo.type, 'GeoProperty')
        assert.deepEqual(geo.value, { type: 'Point', coordinates: [4.35, 50.85] })
    })

    test('passes through optional metadata', ({ assert }) => {
        const geo = geoProperty({ type: 'Point', coordinates: [0, 0] }, { observedAt: '2026-01-01T00:00:00Z' })
        assert.equal(geo.observedAt, '2026-01-01T00:00:00Z')
    })
})

test.group('relationship()', () => {
    test('creates a Relationship with the given URN', ({ assert }) => {
        const rel = relationship('urn:ngsi-ld:Building:42')
        assert.equal(rel.type, 'Relationship')
        assert.equal(rel.object, 'urn:ngsi-ld:Building:42')
    })

    test('passes through optional metadata', ({ assert }) => {
        const rel = relationship('urn:ngsi-ld:Building:42', { observedAt: '2026-01-01T00:00:00Z' })
        assert.equal(rel.observedAt, '2026-01-01T00:00:00Z')
    })
})

test.group('buildUrn()', () => {
    test('builds a correct NGSI-LD URN', ({ assert }) => {
        assert.equal(buildUrn('AirQualityObserved', 'sensor-42'), 'urn:ngsi-ld:AirQualityObserved:sensor-42')
    })

    test('handles localId with colons', ({ assert }) => {
        assert.equal(buildUrn('Device', 'zone:1:sensor:2'), 'urn:ngsi-ld:Device:zone:1:sensor:2')
    })
})

test.group('parseUrn()', () => {
    test('parses a valid NGSI-LD URN', ({ assert }) => {
        const result = parseUrn('urn:ngsi-ld:AirQualityObserved:sensor-42')
        assert.equal(result.type, 'AirQualityObserved')
        assert.equal(result.localId, 'sensor-42')
    })

    test('handles localId containing colons', ({ assert }) => {
        const result = parseUrn('urn:ngsi-ld:Device:zone:1:sensor:2')
        assert.equal(result.type, 'Device')
        assert.equal(result.localId, 'zone:1:sensor:2')
    })

    test('throws on invalid format (no ngsi-ld prefix)', ({ assert }) => {
        assert.throws(() => parseUrn('urn:other:Foo:bar'), /Invalid NGSI-LD URN/)
    })

    test('throws on completely wrong format', ({ assert }) => {
        assert.throws(() => parseUrn('not-a-urn'), /Invalid NGSI-LD URN/)
    })

    test('buildUrn and parseUrn are inverse operations', ({ assert }) => {
        const urn = buildUrn('WeatherObserved', 'station-99')
        const parsed = parseUrn(urn)
        assert.equal(parsed.type, 'WeatherObserved')
        assert.equal(parsed.localId, 'station-99')
    })
})

test.group('type guards', () => {
    test('isNgsiLdCollector returns false for plain object', ({ assert }) => {
        assert.isFalse(isNgsiLdCollector({}))
    })

    test('isNgsiLdCollector returns false for null', ({ assert }) => {
        assert.isFalse(isNgsiLdCollector(null))
    })

    test('isNgsiLdCollector returns true for duck-typed object', ({ assert }) => {
        const fakeCollector = {
            toNgsiLdEntity: () => ({}),
            collect: async () => Buffer.from(''),
            getSchedule: () => '* * * * * *',
        }
        assert.isTrue(isNgsiLdCollector(fakeCollector))
    })

    test('isNgsiLdHarvester returns false for plain object', ({ assert }) => {
        assert.isFalse(isNgsiLdHarvester({}))
    })

    test('isNgsiLdHarvester returns true for duck-typed object', ({ assert }) => {
        const fakeHarvester = {
            toNgsiLdEntity: () => ({}),
            harvest: async () => Buffer.from(''),
            getUserConfiguration: () => ({}),
        }
        assert.isTrue(isNgsiLdHarvester(fakeHarvester))
    })

    test('isNgsiLdCollector returns false when toNgsiLdEntity is missing', ({ assert }) => {
        const noNgsi = {
            collect: async () => Buffer.from(''),
            getSchedule: () => '* * * * * *',
        }
        assert.isFalse(isNgsiLdCollector(noNgsi))
    })
})
