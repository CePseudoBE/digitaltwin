import { test } from '@japa/runner'
import { property, geoProperty, relationship } from '../src/helpers/property.js'
import { buildUrn, parseUrn } from '../src/helpers/urn.js'
import { isNgsiLdCollector, isNgsiLdHarvester } from '../src/components/type_guards.js'
import { parseQ, evaluateQ } from '../src/subscriptions/q_parser.js'
import type { NgsiLdEntity } from '../src/types/entity.js'

// ── property() ───────────────────────────────────────────────────────────────
// Tested through q-filter evaluation — the primary consumer of Property values.

test.group('property() — q-filter evaluation', () => {
    test('a numeric property is correctly evaluated by a q-filter', ({ assert }) => {
        const entity: NgsiLdEntity = {
            id: buildUrn('AirQualityObserved', 'sensor-1'),
            type: 'AirQualityObserved',
            pm25: property(42),
        }

        assert.isTrue(evaluateQ(parseQ('pm25>30'), entity))
        assert.isFalse(evaluateQ(parseQ('pm25>50'), entity))
    })

    test('a string property is correctly evaluated by equality filter', ({ assert }) => {
        const entity: NgsiLdEntity = {
            id: buildUrn('Device', 'gateway-1'),
            type: 'Device',
            status: property('online'),
        }

        assert.isTrue(evaluateQ(parseQ('status=="online"'), entity))
        assert.isFalse(evaluateQ(parseQ('status=="offline"'), entity))
    })

    test('a property with observedAt metadata survives JSON round-trip', ({ assert }) => {
        const original = property(22.5, { observedAt: '2026-01-01T00:00:00Z', unitCode: 'CEL' })
        const roundTripped = JSON.parse(JSON.stringify(original))

        assert.equal(roundTripped.value, 22.5)
        assert.equal(roundTripped.observedAt, '2026-01-01T00:00:00Z')
        assert.equal(roundTripped.unitCode, 'CEL')
    })

    test('a null property causes equality filter to return false', ({ assert }) => {
        const entity: NgsiLdEntity = {
            id: buildUrn('Device', 'sensor-null'),
            type: 'Device',
            status: property(null),
        }

        // null value does not equal 'ok' — missing/null attributes fail equality
        assert.isFalse(evaluateQ(parseQ('status=="ok"'), entity))
    })
})

// ── geoProperty() ────────────────────────────────────────────────────────────
// Tested through entity storage — geoProperties live inside entities that are
// serialized to and from Redis (JSON round-trip).

test.group('geoProperty() — entity storage round-trip', () => {
    test('a geo property preserves geometry after JSON round-trip', ({ assert }) => {
        const entity: NgsiLdEntity = {
            id: buildUrn('ParkingSpot', 'lot-1'),
            type: 'ParkingSpot',
            location: geoProperty({ type: 'Point', coordinates: [4.35, 50.85] }),
        }

        const stored = JSON.parse(JSON.stringify(entity))
        assert.deepEqual(stored.location.value, { type: 'Point', coordinates: [4.35, 50.85] })
    })

    test('geo property metadata survives JSON round-trip', ({ assert }) => {
        const entity: NgsiLdEntity = {
            id: buildUrn('ParkingSpot', 'lot-2'),
            type: 'ParkingSpot',
            location: geoProperty(
                { type: 'Point', coordinates: [0, 0] },
                { observedAt: '2026-01-01T00:00:00Z' }
            ),
        }

        const stored = JSON.parse(JSON.stringify(entity))
        assert.equal(stored.location.observedAt, '2026-01-01T00:00:00Z')
    })
})

// ── relationship() ───────────────────────────────────────────────────────────

test.group('relationship() — entity storage round-trip', () => {
    test('a relationship preserves its target URN after JSON round-trip', ({ assert }) => {
        const entity: NgsiLdEntity = {
            id: buildUrn('Device', 'sensor-1'),
            type: 'Device',
            installedIn: relationship('urn:ngsi-ld:Building:headquarters'),
        }

        const stored = JSON.parse(JSON.stringify(entity))
        assert.equal(stored.installedIn.object, 'urn:ngsi-ld:Building:headquarters')
    })

    test('relationship metadata survives JSON round-trip', ({ assert }) => {
        const entity: NgsiLdEntity = {
            id: buildUrn('Device', 'sensor-2'),
            type: 'Device',
            installedIn: relationship(
                'urn:ngsi-ld:Building:headquarters',
                { observedAt: '2026-03-01T00:00:00Z' }
            ),
        }

        const stored = JSON.parse(JSON.stringify(entity))
        assert.equal(stored.installedIn.observedAt, '2026-03-01T00:00:00Z')
    })
})

// ── buildUrn / parseUrn ───────────────────────────────────────────────────────

test.group('URN helpers', () => {
    test('buildUrn produces a valid NGSI-LD URN', ({ assert }) => {
        assert.equal(buildUrn('AirQualityObserved', 'sensor-42'), 'urn:ngsi-ld:AirQualityObserved:sensor-42')
    })

    test('buildUrn and parseUrn are inverse operations', ({ assert }) => {
        const urn = buildUrn('WeatherObserved', 'station-99')
        const parsed = parseUrn(urn)
        assert.equal(parsed.type, 'WeatherObserved')
        assert.equal(parsed.localId, 'station-99')
    })

    test('localId containing colons round-trips correctly', ({ assert }) => {
        const urn = buildUrn('Device', 'zone:1:sensor:2')
        const parsed = parseUrn(urn)
        assert.equal(parsed.localId, 'zone:1:sensor:2')
    })

    test('parseUrn throws on invalid format', ({ assert }) => {
        assert.throws(() => parseUrn('not-a-urn'), /Invalid NGSI-LD URN/)
        assert.throws(() => parseUrn('urn:other:Foo:bar'), /Invalid NGSI-LD URN/)
    })
})

// ── Type guards ───────────────────────────────────────────────────────────────

test.group('NGSI-LD type guards', () => {
    test('a component implementing toNgsiLdEntity is recognized as NGSI-LD capable', ({ assert }) => {
        const ngsiCollector = {
            toNgsiLdEntity: () => ({} as NgsiLdEntity),
            collect: async () => Buffer.from(''),
            getSchedule: () => '* * * * * *',
        }
        const ngsiHarvester = {
            toNgsiLdEntity: () => ({} as NgsiLdEntity),
            harvest: async () => Buffer.from(''),
            getUserConfiguration: () => ({}),
        }

        assert.isTrue(isNgsiLdCollector(ngsiCollector))
        assert.isTrue(isNgsiLdHarvester(ngsiHarvester))
    })

    test('a standard component without toNgsiLdEntity is not treated as NGSI-LD capable', ({ assert }) => {
        const plainCollector = {
            collect: async () => Buffer.from(''),
            getSchedule: () => '* * * * * *',
        }
        const plainHarvester = {
            harvest: async () => Buffer.from(''),
            getUserConfiguration: () => ({}),
        }

        assert.isFalse(isNgsiLdCollector(plainCollector))
        assert.isFalse(isNgsiLdHarvester(plainHarvester))
        assert.isFalse(isNgsiLdCollector(null))
        assert.isFalse(isNgsiLdCollector({}))
    })
})
