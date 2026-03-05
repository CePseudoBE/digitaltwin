import { test } from '@japa/runner'
import { mapToDataRecord } from '../src/map_to_data_record.js'
import type { DataResolver } from '@digitaltwin/shared'

function createMockResolver(): { resolver: DataResolver; storedData: Map<string, Buffer> } {
    const storedData = new Map<string, Buffer>()
    const resolver: DataResolver = async (url) => {
        const data = storedData.get(url)
        if (!data) {
            return Buffer.from(`content for ${url}`)
        }
        return data
    }
    return { resolver, storedData }
}

test.group('mapToDataRecord', () => {
    test('maps basic metadata row to DataRecord', ({ assert }) => {
        const { resolver } = createMockResolver()
        const row = {
            id: 1,
            name: 'test-record',
            date: '2024-01-15T10:30:00.000Z',
            type: 'application/json',
            url: 'mock://storage/test.json'
        }

        const record = mapToDataRecord(row, resolver)

        assert.equal(record.id, 1)
        assert.equal(record.name, 'test-record')
        assert.instanceOf(record.date, Date)
        assert.equal(record.contentType, 'application/json')
        assert.equal(record.url, 'mock://storage/test.json')
    })

    test('provides lazy-loaded data function', async ({ assert }) => {
        const { resolver, storedData } = createMockResolver()
        storedData.set('mock://storage/test.json', Buffer.from('{"data": true}'))

        const row = {
            id: 1,
            name: 'test',
            date: new Date().toISOString(),
            type: 'application/json',
            url: 'mock://storage/test.json'
        }

        const record = mapToDataRecord(row, resolver)

        assert.isFunction(record.data)
        const data = await record.data()
        assert.instanceOf(data, Buffer)
        assert.equal(data.toString(), '{"data": true}')
    })

    test('maps asset-specific fields when present', ({ assert }) => {
        const { resolver } = createMockResolver()
        const row = {
            id: 42,
            name: 'my-asset',
            date: '2024-06-01T00:00:00.000Z',
            type: 'image/png',
            url: 'mock://storage/image.png',
            description: 'A test image',
            source: 'https://example.com/original.png',
            owner_id: 123,
            filename: 'uploaded_image.png'
        }

        const record = mapToDataRecord(row, resolver)

        assert.equal(record.description, 'A test image')
        assert.equal(record.source, 'https://example.com/original.png')
        assert.equal(record.owner_id, 123)
        assert.equal(record.filename, 'uploaded_image.png')
    })

    test('handles missing asset-specific fields', ({ assert }) => {
        const { resolver } = createMockResolver()
        const row = {
            id: 1,
            name: 'minimal',
            date: new Date().toISOString(),
            type: 'text/plain',
            url: 'mock://storage/file.txt'
        }

        const record = mapToDataRecord(row, resolver)

        assert.isUndefined(record.description)
        assert.isUndefined(record.source)
        assert.isUndefined(record.owner_id)
        assert.isUndefined(record.filename)
    })

    test('defaults is_public to true when undefined', ({ assert }) => {
        const { resolver } = createMockResolver()
        const row = {
            id: 1,
            name: 'public-by-default',
            date: new Date().toISOString(),
            type: 'text/plain',
            url: 'mock://storage/file.txt'
        }

        const record = mapToDataRecord(row, resolver)

        assert.isTrue(record.is_public)
    })

    test('defaults is_public to true when null', ({ assert }) => {
        const { resolver } = createMockResolver()
        const row = {
            id: 1,
            name: 'public-by-default',
            date: new Date().toISOString(),
            type: 'text/plain',
            url: 'mock://storage/file.txt',
            is_public: null
        }

        const record = mapToDataRecord(row, resolver)

        assert.isTrue(record.is_public)
    })

    test('converts SQLite boolean 0 to false', ({ assert }) => {
        const { resolver } = createMockResolver()
        const row = {
            id: 1,
            name: 'private',
            date: new Date().toISOString(),
            type: 'text/plain',
            url: 'mock://storage/file.txt',
            is_public: 0
        }

        assert.isFalse(mapToDataRecord(row, resolver).is_public)
    })

    test('converts SQLite boolean 1 to true', ({ assert }) => {
        const { resolver } = createMockResolver()
        const row = {
            id: 1,
            name: 'public',
            date: new Date().toISOString(),
            type: 'text/plain',
            url: 'mock://storage/file.txt',
            is_public: 1
        }

        assert.isTrue(mapToDataRecord(row, resolver).is_public)
    })

    test('handles proper boolean values', ({ assert }) => {
        const { resolver } = createMockResolver()
        const makeRow = (is_public: boolean) => ({
            id: 1, name: 'test', date: new Date().toISOString(),
            type: 'text/plain', url: 'mock://file.txt', is_public
        })

        assert.isTrue(mapToDataRecord(makeRow(true), resolver).is_public)
        assert.isFalse(mapToDataRecord(makeRow(false), resolver).is_public)
    })

    test('parses date string to Date object', ({ assert }) => {
        const { resolver } = createMockResolver()
        const dateStr = '2024-03-15T14:30:00.000Z'
        const row = { id: 1, name: 'test', date: dateStr, type: 'text/plain', url: 'mock://file.txt' }

        const record = mapToDataRecord(row, resolver)

        assert.instanceOf(record.date, Date)
        assert.equal(record.date.toISOString(), dateStr)
    })

    test('handles Date object directly', ({ assert }) => {
        const { resolver } = createMockResolver()
        const dateObj = new Date('2024-03-15T14:30:00.000Z')
        const row = { id: 1, name: 'test', date: dateObj, type: 'text/plain', url: 'mock://file.txt' }

        const record = mapToDataRecord(row, resolver)

        assert.instanceOf(record.date, Date)
        assert.equal(record.date.getTime(), dateObj.getTime())
    })

    test('handles numeric timestamp', ({ assert }) => {
        const { resolver } = createMockResolver()
        const timestamp = Date.now()
        const row = { id: 1, name: 'test', date: timestamp, type: 'text/plain', url: 'mock://file.txt' }

        const record = mapToDataRecord(row, resolver)

        assert.instanceOf(record.date, Date)
        assert.equal(record.date.getTime(), timestamp)
    })

    test('data function calls resolver with correct URL', async ({ assert }) => {
        let retrievedUrl: string | null = null
        const resolver: DataResolver = async (url) => {
            retrievedUrl = url
            return Buffer.from(`content for ${url}`)
        }

        const row = { id: 1, name: 'test', date: new Date().toISOString(), type: 'text/plain', url: 'mock://storage/specific.txt' }
        const record = mapToDataRecord(row, resolver)

        assert.isNull(retrievedUrl)
        await record.data()
        assert.equal(retrievedUrl, 'mock://storage/specific.txt')
    })
})
