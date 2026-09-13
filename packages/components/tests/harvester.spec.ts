import { test } from '@japa/runner'
import Database from 'better-sqlite3'
import fs from 'node:fs/promises'
import { KyselyDatabaseAdapter } from '@cepseudo/database'
import { LocalStorageService } from '@cepseudo/storage'
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

        // New data arrives after the first run's end (which was "now" at that time)
        await new Promise(r => setTimeout(r, 5))
        await insertSource(new Date(Date.now()))
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
