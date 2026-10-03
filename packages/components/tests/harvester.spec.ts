import { test } from '@japa/runner'
import Database from 'better-sqlite3'
import fs from 'node:fs/promises'
import { KyselyDatabaseAdapter } from '@cepseudo/database'
import { LocalStorageService } from '@cepseudo/storage'
import { StorageError } from '@cepseudo/shared'
import type { DataRecord, HarvesterConfiguration } from '@cepseudo/shared'
import { Harvester } from '../src/harvester.js'

const BASE_DIR = '.test-harvester'
const MINUTE = 60_000

class HourlyAggregate extends Harvester {
    calls: Array<DataRecord | DataRecord[]> = []

    async harvest(sourceData: DataRecord | DataRecord[]): Promise<Buffer> {
        this.calls.push(sourceData)
        return Buffer.from(JSON.stringify({ count: Array.isArray(sourceData) ? sourceData.length : 1 }))
    }

    getUserConfiguration(): HarvesterConfiguration {
        return {
            name: 'agg',
            description: 'Aggregates one hour of source data',
            contentType: 'application/json',
            endpoint: 'agg',
            source: 'src',
            source_range: '1h',
            triggerMode: 'on-source',
        }
    }
}

test.group('Harvester - time-based windows', group => {
    let db: KyselyDatabaseAdapter
    let storage: LocalStorageService
    let harvester: HourlyAggregate

    async function insertSource(date: Date): Promise<void> {
        const url = await storage.save(Buffer.from('{}'), 'src', 'json')
        await db.save({ name: 'src', type: 'application/json', url, date })
    }

    async function latestAgg(): Promise<DataRecord | undefined> {
        return db.getLatestByName('agg')
    }

    group.each.setup(async () => {
        storage = new LocalStorageService(BASE_DIR)
        db = KyselyDatabaseAdapter.fromSQLiteDatabase(new Database(':memory:'), url => storage.retrieve(url), { enableForeignKeys: false })
        await db.getUserRepository().initializeTables()
        await db.createTable('src')
        await db.createTable('agg')
        harvester = new HourlyAggregate()
        harvester.setDependencies(db, storage)
    })

    group.each.teardown(async () => {
        await db.close()
        await fs.rm(BASE_DIR, { recursive: true, force: true })
    })

    test('no source data at all: nothing happens', async ({ assert }) => {
        assert.isFalse(await harvester.run())
        assert.isUndefined(await latestAgg())
    })

    test('a window crossing now is clamped: the result is never dated in the future', async ({ assert }) => {
        const now = Date.now()
        await insertSource(new Date(now - 5 * MINUTE))
        await insertSource(new Date(now - 2 * MINUTE))

        assert.isTrue(await harvester.run())
        const stored = await latestAgg()
        assert.isDefined(stored)
        assert.isAtMost(stored!.date.getTime(), Date.now())
        assert.lengthOf(harvester.calls[0] as DataRecord[], 2)
    })

    test('records landing after a clamped window are picked up by the next run', async ({ assert }) => {
        const now = Date.now()
        await insertSource(new Date(now - 3 * MINUTE))
        assert.isTrue(await harvester.run())
        const firstDate = (await latestAgg())!.date

        // The first window ended at firstDate (exclusive): a record dated there belongs to the next run
        await insertSource(firstDate)
        // The second window must end strictly after firstDate
        await new Promise(r => setTimeout(r, 5))
        assert.isTrue(await harvester.run())
        assert.isAbove((await latestAgg())!.date.getTime(), firstDate.getTime())
        assert.lengthOf(harvester.calls[1] as DataRecord[], 1)
    })

    test('a gap in the source longer than the range does not stall the harvester', async ({ assert }) => {
        const now = Date.now()
        // Old data, harvested long ago
        await insertSource(new Date(now - 10 * 60 * MINUTE))
        assert.isTrue(await harvester.run())

        // Nothing for nine hours, then fresh data
        await insertSource(new Date(now - 4 * MINUTE))
        assert.isTrue(await harvester.run(), 'the empty window must advance to the next record')
        assert.lengthOf(harvester.calls[1] as DataRecord[], 1)
        assert.isAtMost((await latestAgg())!.date.getTime(), Date.now())
    })

    test('a window with data is harvested as before', async ({ assert }) => {
        const start = Date.now() - 3 * 60 * MINUTE
        for (let i = 0; i < 4; i++) await insertSource(new Date(start + i * 20 * MINUTE))

        assert.isTrue(await harvester.run())
        // First run opens one second before the first record: three records fall in the first hour
        assert.lengthOf(harvester.calls[0] as DataRecord[], 3)
    })
})

class FailingAggregate extends HourlyAggregate {
    override async harvest(): Promise<Buffer> {
        throw new Error('aggregation overflow')
    }
}

class SourcelessAggregate extends HourlyAggregate {
    override getUserConfiguration(): HarvesterConfiguration {
        return { ...super.getUserConfiguration(), source: undefined }
    }
}

class WeatherEnrichedReadings extends Harvester {
    async harvest(
        sourceData: DataRecord | DataRecord[],
        dependenciesData: Record<string, DataRecord | DataRecord[] | null>
    ): Promise<Buffer> {
        const reading = JSON.parse((await (sourceData as DataRecord).data()).toString())
        const weather = JSON.parse((await (dependenciesData.weather as DataRecord).data()).toString())
        return Buffer.from(JSON.stringify({ value: reading.value, temperature: weather.temperature }))
    }

    getUserConfiguration(): HarvesterConfiguration {
        return {
            name: 'enriched',
            description: 'Source readings enriched with the weather at that time',
            contentType: 'application/json',
            endpoint: 'enriched',
            source: 'src',
            dependencies: ['weather'],
            dependenciesLimit: [1],
        }
    }
}

test.group('Harvester - run', group => {
    let db: KyselyDatabaseAdapter
    let storage: LocalStorageService

    async function insert(name: string, date: Date, content: object): Promise<void> {
        const url = await storage.save(Buffer.from(JSON.stringify(content)), name, 'json')
        await db.save({ name, type: 'application/json', url, date })
    }

    group.each.setup(async () => {
        storage = new LocalStorageService(BASE_DIR)
        db = KyselyDatabaseAdapter.fromSQLiteDatabase(new Database(':memory:'), url => storage.retrieve(url), { enableForeignKeys: false })
        await db.getUserRepository().initializeTables()
        for (const table of ['src', 'agg', 'weather', 'enriched']) await db.createTable(table)
    })

    group.each.teardown(async () => {
        await db.close()
        await fs.rm(BASE_DIR, { recursive: true, force: true })
    })

    test('run() turns an error thrown by harvest() into a StorageError naming the harvester and its source', async ({ assert }) => {
        await insert('src', new Date(Date.now() - 5 * MINUTE), {})
        const harvester = new FailingAggregate()
        harvester.setDependencies(db, storage)

        const error = await harvester.run().catch((e: unknown) => e)

        assert.instanceOf(error, StorageError)
        assert.equal((error as StorageError).code, 'STORAGE_ERROR')
        assert.include((error as StorageError).message, 'aggregation overflow')
        assert.deepEqual((error as StorageError).context, { harvesterName: 'agg', source: 'src' })
    })

    test('run() refuses a configuration without a source with a plain error', async ({ assert }) => {
        const harvester = new SourcelessAggregate()
        harvester.setDependencies(db, storage)

        const error = await harvester.run().catch((e: unknown) => e)

        assert.instanceOf(error, Error)
        assert.notInstanceOf(error, StorageError)
        assert.include((error as Error).message, 'must specify a source')
    })

    test('a dependency contributes its latest record before the source record, and the result is stored', async ({ assert }) => {
        const sourceDate = new Date('2025-01-01T12:00:00Z')
        await insert('weather', new Date(sourceDate.getTime() - 120 * MINUTE), { temperature: 18 })
        await insert('weather', new Date(sourceDate.getTime() - 60 * MINUTE), { temperature: 20 })
        await insert('weather', new Date(sourceDate.getTime() + 60 * MINUTE), { temperature: 30 })
        await insert('src', sourceDate, { value: 50 })
        const harvester = new WeatherEnrichedReadings()
        harvester.setDependencies(db, storage)

        assert.isTrue(await harvester.run())

        const stored = await db.getLatestByName('enriched')
        assert.equal(stored?.date.getTime(), sourceDate.getTime())
        assert.deepEqual(JSON.parse((await stored!.data()).toString()), { value: 50, temperature: 20 })
    })
})
