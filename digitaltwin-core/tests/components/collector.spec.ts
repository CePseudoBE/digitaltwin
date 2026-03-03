
import { test } from '@japa/runner'
import { Collector } from '../../src/components/collector.js'
import type { DataResponse } from "../../src/components/types.js"
import { MockDatabaseAdapter } from '../mocks/mock_database_adapter.js'
import { LocalStorageService } from '../../src/storage/adapters/local_storage_service.js'

class DummyCollector extends Collector {
    collected: boolean = false

    getConfiguration() {
        return {
            name: 'dummy',
            contentType: 'application/json',
            description: 'Test dummy collector',
            endpoint: 'dummy',
        }
    }

    getSchedule(): string {
        return '* * * * *'
    }

    async collect(): Promise<Buffer> {
        this.collected = true
        return Buffer.from(JSON.stringify({ hello: 'world' }))
    }
}

test.group('Collector', () => {
    test('run() calls collect(), saves blob and metadata', async ({ assert }) => {
        const storage = new LocalStorageService('.test_tmp')
        const db = new MockDatabaseAdapter({ storage })

        const collector = new DummyCollector()
        collector.setDependencies(db, storage)

        const result = await collector.run()

        assert.instanceOf(result, Buffer)
        assert.isTrue(collector.collected)
        assert.equal(db.getRecordCount(), 1)

        const savedRecord = await db.getLatestByName('dummy')
        assert.isDefined(savedRecord)
        assert.equal(savedRecord!.name, 'dummy')
        assert.equal(savedRecord!.contentType, 'application/json')
    })

    test('retrieve() returns last saved blob with headers', async ({ assert }) => {
        const mockBlob = Buffer.from('{"test":"ok"}')
        const storage = new LocalStorageService('.test_tmp')

        // Créer un record pré-existant
        const existingRecord = {
            id: 1,
            name: 'dummy',
            contentType: 'application/json',
            url: 'dummy/123.json',
            date: new Date(),
            data: async () => mockBlob,
        }

        const db = new MockDatabaseAdapter({
            storage,
            initialData: [existingRecord]
        })

        const collector = new DummyCollector()
        collector.setDependencies(db, storage)

        const response: DataResponse = await collector.retrieve()

        assert.equal(response.status, 200)
        assert.deepEqual(response.content, mockBlob)
        assert.equal(response.headers?.['Content-Type'], 'application/json')
    })

    test('retrieve() returns 404 when no data exists', async ({ assert }) => {
        const storage = new LocalStorageService('.test_tmp')
        const db = new MockDatabaseAdapter({ storage })

        const collector = new DummyCollector()
        collector.setDependencies(db, storage)

        const response: DataResponse = await collector.retrieve()

        assert.equal(response.status, 404)
        assert.equal(response.content, 'No data available')
    })

    test('handles database errors gracefully', async ({ assert }) => {
        const storage = new LocalStorageService('.test_tmp')
        const db = new MockDatabaseAdapter({
            storage,
            shouldThrow: { save: true }
        })

        const collector = new DummyCollector()
        collector.setDependencies(db, storage)

        // Le test devrait lever une StorageError wrapping l'erreur originale
        await assert.rejects(async () => {
            await collector.run()
        }, /Mock save error/)
    })
})

// Error throwing collector for testing
class ErrorThrowingCollector extends Collector {
    getConfiguration() {
        return {
            name: 'error-collector',
            contentType: 'application/json',
            description: 'Collector that throws',
            endpoint: 'error-collector',
        }
    }

    getSchedule(): string {
        return '* * * * *'
    }

    async collect(): Promise<Buffer> {
        throw new Error('Collection failed')
    }
}

// Collector that returns empty buffer
class EmptyBufferCollector extends Collector {
    getConfiguration() {
        return {
            name: 'empty-collector',
            contentType: 'application/json',
            description: 'Collector returning empty buffer',
            endpoint: 'empty-collector',
        }
    }

    getSchedule(): string {
        return '0 * * * *'
    }

    async collect(): Promise<Buffer> {
        return Buffer.from('')
    }
}

// Collector with large data
class LargeDataCollector extends Collector {
    getConfiguration() {
        return {
            name: 'large-collector',
            contentType: 'application/octet-stream',
            description: 'Collector with large data',
            endpoint: 'large-collector',
        }
    }

    getSchedule(): string {
        return '0 0 * * *'
    }

    async collect(): Promise<Buffer> {
        // Create 1MB of data
        return Buffer.alloc(1024 * 1024, 'x')
    }
}

test.group('Collector error handling', () => {
    test('should propagate collect() errors', async ({ assert }) => {
        const storage = new LocalStorageService('.test_err')
        const db = new MockDatabaseAdapter({ storage })

        const collector = new ErrorThrowingCollector()
        collector.setDependencies(db, storage)

        await assert.rejects(async () => {
            await collector.run()
        }, /Collection failed/)
    })

    test('should handle empty buffer from collect()', async ({ assert }) => {
        const storage = new LocalStorageService('.test_empty')
        const db = new MockDatabaseAdapter({ storage })

        const collector = new EmptyBufferCollector()
        collector.setDependencies(db, storage)

        const result = await collector.run()

        assert.instanceOf(result, Buffer)
        assert.equal(result.length, 0)
    })

    test('should handle large data from collect()', async ({ assert }) => {
        const storage = new LocalStorageService('.test_large')
        const db = new MockDatabaseAdapter({ storage })

        const collector = new LargeDataCollector()
        collector.setDependencies(db, storage)

        const result = await collector.run()

        assert.instanceOf(result, Buffer)
        assert.equal(result.length, 1024 * 1024)
    })

    test('should handle getLatestByName errors during retrieve', async ({ assert }) => {
        const storage = new LocalStorageService('.test_retrieve_err')
        const db = new MockDatabaseAdapter({
            storage,
            shouldThrow: { getLatestByName: true }
        })

        const collector = new DummyCollector()
        collector.setDependencies(db, storage)

        await assert.rejects(async () => {
            await collector.retrieve()
        }, /Mock getLatestByName error/)
    })
})

test.group('Collector configuration', () => {
    test('getConfiguration() should return valid config', ({ assert }) => {
        const collector = new DummyCollector()
        const config = collector.getConfiguration()

        assert.isDefined(config.name)
        assert.isDefined(config.contentType)
        assert.isString(config.name)
        assert.isString(config.contentType)
    })

    test('getSchedule() should return valid cron expression', ({ assert }) => {
        const collector = new DummyCollector()
        const schedule = collector.getSchedule()

        assert.isString(schedule)
        // Basic cron format check (5 parts)
        const parts = schedule.split(' ')
        assert.isTrue(parts.length >= 5)
    })

    test('setDependencies should enable collector to run successfully', async ({ assert }) => {
        const storage = new LocalStorageService('.test_deps')
        const db = new MockDatabaseAdapter({ storage })
        const collector = new DummyCollector()

        collector.setDependencies(db, storage)

        // Verify dependencies are correctly set by performing an operation
        const result = await collector.run()
        assert.instanceOf(result, Buffer)
        assert.isTrue(collector.collected)
    })
})
