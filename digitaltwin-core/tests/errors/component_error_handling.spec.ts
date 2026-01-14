import { test } from '@japa/runner'
import { Collector } from '../../src/components/collector.js'
import { Harvester } from '../../src/components/harvester.js'
import { StorageError } from '../../src/errors/index.js'
import type { CollectorConfiguration, HarvesterConfiguration } from '../../src/components/types.js'
import { MockDatabaseAdapter } from '../mocks/mock_database_adapter.js'
import { MockStorageService } from '../mocks/mock_storage_service.js'

// Test Collector that throws an error
class FailingCollector extends Collector {
    getConfiguration(): CollectorConfiguration {
        return {
            name: 'failing-collector',
            description: 'A collector that fails',
            contentType: 'application/json',
            endpoint: 'failing'
        }
    }

    getSchedule(): string {
        return '0 * * * *'
    }

    async collect(): Promise<Buffer> {
        throw new Error('Simulated collection failure')
    }
}

// Test Collector that succeeds but storage fails
class StorageFailingCollector extends Collector {
    getConfiguration(): CollectorConfiguration {
        return {
            name: 'storage-failing-collector',
            description: 'A collector where storage fails',
            contentType: 'application/json',
            endpoint: 'storage-failing'
        }
    }

    getSchedule(): string {
        return '0 * * * *'
    }

    async collect(): Promise<Buffer> {
        return Buffer.from('test data')
    }
}

// Test Harvester that throws an error
class FailingHarvester extends Harvester {
    getUserConfiguration(): HarvesterConfiguration {
        return {
            name: 'failing-harvester',
            description: 'A harvester that fails',
            contentType: 'application/json',
            endpoint: 'failing-harvest',
            source: 'test-source'
        }
    }

    async harvest(): Promise<Buffer> {
        throw new Error('Simulated harvest failure')
    }
}

test.group('Collector Error Handling', () => {
    test('run() wraps collect() errors in StorageError', async ({ assert }) => {
        const collector = new FailingCollector()
        collector.setDependencies(new MockDatabaseAdapter(), new MockStorageService())

        try {
            await collector.run()
            assert.fail('Expected StorageError to be thrown')
        } catch (error) {
            assert.instanceOf(error, StorageError)
            assert.equal((error as StorageError).code, 'STORAGE_ERROR')
            assert.include((error as StorageError).message, 'failing-collector')
            assert.include((error as StorageError).message, 'Simulated collection failure')
            assert.deepInclude((error as StorageError).context, { collectorName: 'failing-collector' })
        }
    })

    test('run() wraps storage errors in StorageError', async ({ assert }) => {
        const collector = new StorageFailingCollector()

        // Create a storage that throws on save
        const failingStorage = new MockStorageService()
        failingStorage.save = async () => {
            throw new Error('Storage unavailable')
        }

        collector.setDependencies(new MockDatabaseAdapter(), failingStorage)

        try {
            await collector.run()
            assert.fail('Expected StorageError to be thrown')
        } catch (error) {
            assert.instanceOf(error, StorageError)
            assert.include((error as StorageError).message, 'Storage unavailable')
        }
    })

    test('run() wraps database errors in StorageError', async ({ assert }) => {
        const collector = new StorageFailingCollector()

        // Create a database that throws on save
        const failingDb = new MockDatabaseAdapter({ shouldThrow: { save: true } })

        collector.setDependencies(failingDb, new MockStorageService())

        try {
            await collector.run()
            assert.fail('Expected StorageError to be thrown')
        } catch (error) {
            assert.instanceOf(error, StorageError)
            assert.include((error as StorageError).message, 'Mock save error')
        }
    })
})

test.group('Harvester Error Handling', () => {
    test('run() wraps harvest() errors in StorageError', async ({ assert }) => {
        const harvester = new FailingHarvester()

        // Create mock with source data that will trigger the harvest
        const mockDb = new MockDatabaseAdapter()

        // Add source data that the harvester will try to process
        const sourceDate = new Date()
        mockDb.addTestRecord('test-source', sourceDate)

        harvester.setDependencies(mockDb, new MockStorageService())

        try {
            await harvester.run()
            assert.fail('Expected StorageError to be thrown')
        } catch (error) {
            assert.instanceOf(error, StorageError)
            assert.equal((error as StorageError).code, 'STORAGE_ERROR')
            assert.include((error as StorageError).message, 'failing-harvester')
            assert.include((error as StorageError).message, 'Simulated harvest failure')
            assert.deepInclude((error as StorageError).context, {
                harvesterName: 'failing-harvester',
                source: 'test-source'
            })
        }
    })

    test('run() throws error when source is not specified', async ({ assert }) => {
        class NoSourceHarvester extends Harvester {
            getUserConfiguration(): HarvesterConfiguration {
                return {
                    name: 'no-source-harvester',
                    description: 'A harvester without source',
                    contentType: 'application/json',
                    endpoint: 'no-source'
                    // source is missing
                }
            }

            async harvest(): Promise<Buffer> {
                return Buffer.from('test')
            }
        }

        const harvester = new NoSourceHarvester()
        harvester.setDependencies(new MockDatabaseAdapter(), new MockStorageService())

        try {
            await harvester.run()
            assert.fail('Expected Error to be thrown')
        } catch (error) {
            assert.instanceOf(error, Error)
            assert.include((error as Error).message, 'must specify a source')
        }
    })
})
