import { test } from '@japa/runner'
import Database from 'better-sqlite3'
import fs from 'node:fs/promises'
import { KyselyDatabaseAdapter } from '@cepseudo/database'
import { LocalStorageService } from '@cepseudo/storage'
import { StorageError } from '@cepseudo/shared'
import type { CollectorConfiguration } from '@cepseudo/shared'
import { Collector } from '../src/collector.js'

const BASE_DIR = '.test-collector'

class WeatherCollector extends Collector {
    collectError?: Error

    getConfiguration(): CollectorConfiguration {
        return {
            name: 'weather',
            description: 'Weather readings under test',
            contentType: 'application/json',
            endpoint: 'weather',
        }
    }

    getSchedule(): string {
        return '0 * * * * *'
    }

    async collect(): Promise<Buffer> {
        if (this.collectError) throw this.collectError
        return Buffer.from('{"temperature":20}')
    }
}

async function runError(collector: Collector): Promise<StorageError> {
    const error = await collector.run().catch((e: unknown) => e)
    if (!(error instanceof StorageError)) throw new Error(`Expected a StorageError, got ${String(error)}`)
    return error
}

test.group('Collector - run and retrieve', group => {
    let db: KyselyDatabaseAdapter
    let storage: LocalStorageService
    let collector: WeatherCollector

    group.each.setup(async () => {
        storage = new LocalStorageService(BASE_DIR)
        db = KyselyDatabaseAdapter.fromSQLiteDatabase(new Database(':memory:'), url => storage.retrieve(url), { enableForeignKeys: false })
        await db.createTable('weather')
        collector = new WeatherCollector()
        collector.setDependencies(db, storage)
    })

    group.each.teardown(async () => {
        await db.close()
        await fs.rm(BASE_DIR, { recursive: true, force: true })
    })

    test('run() turns an error thrown by collect() into a StorageError naming the collector', async ({ assert }) => {
        collector.collectError = new Error('upstream API timed out')

        const error = await runError(collector)

        assert.equal(error.code, 'STORAGE_ERROR')
        assert.include(error.message, 'upstream API timed out')
        assert.deepEqual(error.context, { collectorName: 'weather' })
        assert.isUndefined(await db.getLatestByName('weather'))
    })

    test('run() turns a storage failure into a StorageError and indexes nothing', async ({ assert }) => {
        storage.save = async () => {
            throw new Error('disk full')
        }

        const error = await runError(collector)

        assert.include(error.message, 'disk full')
        assert.isUndefined(await db.getLatestByName('weather'))
    })

    test('run() turns a database failure into a StorageError that keeps the original message', async ({ assert }) => {
        db.save = async () => {
            throw new Error('database is locked')
        }

        const error = await runError(collector)

        assert.include(error.message, 'database is locked')
        assert.deepEqual(error.context, { collectorName: 'weather' })
    })

    test('retrieve() rejects when the database fails instead of answering as if there were no data', async ({ assert }) => {
        db.getLatestByName = async () => {
            throw new Error('connection lost')
        }

        await assert.rejects(() => collector.retrieve(), /connection lost/)
    })
})
