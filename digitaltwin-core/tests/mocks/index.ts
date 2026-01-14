import { MockDatabaseAdapter, type MockDatabaseOptions } from './mock_database_adapter.js'

// Fonction utilitaire pour créer un mock simple
export function createMockDatabase(options: MockDatabaseOptions = {}) {
    return new MockDatabaseAdapter(options)
}

// Fonction pour créer un mock avec des données de test
export function createMockDatabaseWithData() {
    const mockData = [
        {
            id: 1,
            name: 'test-collector',
            contentType: 'application/json',
            url: 'test-collector/123.json',
            date: new Date('2025-01-01T10:00:00Z'),
            data: async () => Buffer.from('{"test": "data"}'),
        },
        {
            id: 2,
            name: 'another-collector',
            contentType: 'text/plain',
            url: 'another-collector/456.txt',
            date: new Date('2025-01-02T10:00:00Z'),
            data: async () => Buffer.from('Hello World'),
        }
    ]

    return new MockDatabaseAdapter({ initialData: mockData })
}

export function createMockDatabaseForHarvester() {
    const now = new Date()
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000)
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000)
    // CORRECTION: -2.5h au lieu de -3 jours !
    const twoHoursThirtyAgo = new Date(now.getTime() - 2.5 * 60 * 60 * 1000)

    const mockData = [
        // TOUTES les source data sont dans la plage de 3h
        {
            id: 1,
            name: 'source-collector',
            contentType: 'application/json',
            url: 'source-collector/1.json',
            date: twoHoursThirtyAgo, // -2.5h (DANS la plage de 3h)
            data: async () => Buffer.from('{"value": 100}'),
        },
        {
            id: 2,
            name: 'source-collector',
            contentType: 'application/json',
            url: 'source-collector/2.json',
            date: twoHoursAgo, // -2h
            data: async () => Buffer.from('{"value": 200}'),
        },
        {
            id: 3,
            name: 'source-collector',
            contentType: 'application/json',
            url: 'source-collector/3.json',
            date: oneHourAgo, // -1h
            data: async () => Buffer.from('{"value": 300}'),
        },
        // Dependency data
        {
            id: 4,
            name: 'weather-data',
            contentType: 'application/json',
            url: 'weather-data/1.json',
            date: twoHoursAgo,
            data: async () => Buffer.from('{"temperature": 25}'),
        },
        {
            id: 5,
            name: 'weather-data',
            contentType: 'application/json',
            url: 'weather-data/2.json',
            date: oneHourAgo,
            data: async () => Buffer.from('{"temperature": 23}'),
        },
        // CORRECTION CRITIQUE: Harvester data TRÈS ANCIEN
        {
            id: 6,
            name: 'test-harvester',
            contentType: 'application/json',
            url: 'test-harvester/1.json',
            date: new Date(now.getTime() - 24 * 60 * 60 * 1000), // -24h au lieu de -2h !
            data: async () => Buffer.from('{"processed": true}'),
        }
    ]

    return new MockDatabaseAdapter({ initialData: mockData })
}