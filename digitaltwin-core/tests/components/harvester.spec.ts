import { test } from '@japa/runner'
import { Harvester } from '../../src/components/harvester.js'
import { HarvesterConfiguration } from '../../src/components/types.js'
import { DataRecord } from '../../src/types/data_record.js'
import { LocalStorageService } from '../../src/storage/adapters/local_storage_service.js'
import { MockDatabaseAdapter } from "../mocks/mock_database_adapter.js";

class TestHarvester extends Harvester {
    getConfiguration(): HarvesterConfiguration {
        return {
            name: 'test-harvester',
            description: 'Test harvester',
            contentType: 'application/json',
            endpoint: 'test-harvester',
            source: 'source-collector',
            source_range: undefined, // Pas de range = simple
            source_range_min: false,
            multiple_results: false,
            dependencies: ['weather-data'],
            dependenciesLimit: [1]
        }
    }

    async harvest(
        sourceData: DataRecord | DataRecord[],
        dependenciesData: Record<string, DataRecord | DataRecord[]>
    ): Promise<Buffer> {
        const source = Array.isArray(sourceData) ? sourceData[0] : sourceData
        const weather = dependenciesData['weather-data'] as DataRecord

        const result = {
            processed_at: new Date().toISOString(),
            source_value: JSON.parse((await source.data()).toString()).value,
            weather_temp: JSON.parse((await weather.data()).toString()).temperature,
            combined: true
        }

        return Buffer.from(JSON.stringify(result))
    }
}

test.group('Harvester WORKING', () => {
    test('Simple working case', async ({ assert }) => {
        const storage = new LocalStorageService('.test_tmp')
        const db = new MockDatabaseAdapter()

        // Créer des données TRÈS simples avec des dates fixes
        const now = new Date('2025-01-01T15:00:00Z')
        const oneHourAgo = new Date('2025-01-01T14:00:00Z')
        const oneDayAgo = new Date('2024-12-31T15:00:00Z')

        // Source data (après la dernière récolte)
        const sourceRecord = db.addTestRecord('source-collector', oneHourAgo)
        sourceRecord.data = async () => Buffer.from('{"value": 100}')

        // Dependency data (avant source)
        const weatherRecord = db.addTestRecord('weather-data', new Date('2025-01-01T13:00:00Z'))
        weatherRecord.data = async () => Buffer.from('{"temperature": 25}')

        // Harvester data (très ancien)
        db.addTestRecord('test-harvester', oneDayAgo)

        const harvester = new TestHarvester()
        harvester.setDependencies(db, storage)

        const result = await harvester.run()
        assert.isTrue(result, 'Harvester should succeed')

        // Vérifier que de nouvelles données ont été créées
        const harvesterRecords = db.getRecordsByName('test-harvester')
        assert.isTrue(harvesterRecords.length > 1, 'Should have new harvester record')
    })

    test('Mockdatabase getByDateRange', async ({ assert }) => {
        const db = new MockDatabaseAdapter()

        // Si on veut que getHours() retourne 12, 13, 14, 15, 16
        // Il faut créer les dates avec les bonnes heures locales
        const records = []

        for (let hour = 12; hour <= 16; hour++) {
            // Créer une date avec l'heure locale désirée
            const date = new Date(2025, 0, 1, hour, 0, 0, 0) // Année, mois-1, jour, heure, min, sec, ms
            const record = db.addTestRecord('test-component', date)
            records.push(record)
        }

        // Range pour récupérer 13h, 14h, 15h en heure locale
        const startDate = new Date(2025, 0, 1, 12, 30, 0, 0) // 12:30 local
        const endDate = new Date(2025, 0, 1, 15, 30, 0, 0)   // 15:30 local

        const rangeRecords = await db.getByDateRange('test-component', startDate, endDate)

        assert.equal(rangeRecords.length, 3, 'Should find exactly 3 records')
        assert.equal(rangeRecords[0].date.getHours(), 13, 'First record should be at 13h local')
        assert.equal(rangeRecords[1].date.getHours(), 14, 'Second record should be at 14h local')
        assert.equal(rangeRecords[2].date.getHours(), 15, 'Third record should be at 15h local')
    })

    test('Dependencies work correctly', async ({ assert }) => {
        const storage = new LocalStorageService('.test_tmp')
        const db = new MockDatabaseAdapter()

        // Créer des données dans le bon ordre temporel
        const base = new Date('2025-01-01T12:00:00Z')

        // 1. Dependency à 11h
        const depRecord = db.addTestRecord('weather-data', new Date(base.getTime() - 60 * 60 * 1000))
        depRecord.data = async () => Buffer.from('{"temperature": 20}')

        // 2. Source à 12h
        const sourceRecord = db.addTestRecord('source-collector', base)
        sourceRecord.data = async () => Buffer.from('{"value": 50}')

        // 3. Harvester ancien (hier)
        db.addTestRecord('test-harvester', new Date(base.getTime() - 24 * 60 * 60 * 1000))

        // Test getLatestBefore directement
        const foundDep = await db.getLatestBefore('weather-data', base)
        assert.isDefined(foundDep, 'Should find dependency before source date')
        assert.equal(foundDep!.id, depRecord.id, 'Should find the correct dependency')

        // Test complet du harvester
        const harvester = new TestHarvester()
        harvester.setDependencies(db, storage)

        const result = await harvester.run()
        assert.isTrue(result, 'Harvester with dependencies should succeed')
    })

    test('No dependencies needed', async ({ assert }) => {
        const storage = new LocalStorageService('.test_tmp')
        const db = new MockDatabaseAdapter()

        // Harvester sans dépendances
        class NoDepsHarvester extends Harvester {
            getConfiguration(): HarvesterConfiguration {
                return {
                    name: 'no-deps-harvester',
                    description: 'No dependencies',
                    contentType: 'application/json',
                    endpoint: 'no-deps',
                    source: 'source-collector',
                    source_range: undefined,
                    source_range_min: false,
                    multiple_results: false,
                    dependencies: [], // PAS de dépendances
                    dependenciesLimit: []
                }
            }
            async harvest(sourceData: any, deps: any): Promise<Buffer> {
                return Buffer.from('{"no_deps": true}')
            }
        }

        const base = new Date('2025-01-01T12:00:00Z')

        // Juste source + harvester ancien
        db.addTestRecord('source-collector', base)
        db.addTestRecord('no-deps-harvester', new Date(base.getTime() - 24 * 60 * 60 * 1000))

        const harvester = new NoDepsHarvester()
        harvester.setDependencies(db, storage)

        const result = await harvester.run()
        assert.isTrue(result, 'Harvester without dependencies should succeed')
    })
})