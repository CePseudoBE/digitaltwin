import { DatabaseAdapter } from '@digitaltwin/database'
import type { DataRecord, DataResolver, UserRepository } from '@digitaltwin/shared'
import { mapToDataRecord } from '@digitaltwin/database'
import { MockStorageService } from './mock_storage.js'

export interface MockDatabaseOptions {
    storage?: MockStorageService
    shouldThrow?: {
        save?: boolean
        delete?: boolean
        getById?: boolean
        getLatestByName?: boolean
        doesTableExists?: boolean
    }
}

export class MockDatabaseAdapter extends DatabaseAdapter {
    private records: Map<string, DataRecord> = new Map()
    private dataResolver: DataResolver
    private shouldThrowConfig: NonNullable<MockDatabaseOptions['shouldThrow']>
    private idCounter = 0
    private tables: Set<string> = new Set()

    constructor(options: MockDatabaseOptions = {}) {
        super()
        const storage = options.storage || new MockStorageService()
        this.dataResolver = (url) => storage.retrieve(url)
        this.shouldThrowConfig = {
            save: options.shouldThrow?.save ?? false,
            delete: options.shouldThrow?.delete ?? false,
            getById: options.shouldThrow?.getById ?? false,
            getLatestByName: options.shouldThrow?.getLatestByName ?? false,
            doesTableExists: options.shouldThrow?.doesTableExists ?? false,
        }
    }

    async save(meta: any): Promise<DataRecord> {
        if (this.shouldThrowConfig.save) throw new Error('Mock save error')
        const id = meta.id ?? (Date.now() + this.idCounter++)
        const record = mapToDataRecord({ ...meta, id }, this.dataResolver)
        this.records.set(id.toString(), record)
        return record
    }

    async delete(id: string): Promise<void> {
        if (this.shouldThrowConfig.delete) throw new Error('Mock delete error')
        this.records.delete(id)
    }

    async getById(id: string, name?: string): Promise<DataRecord | undefined> {
        if (this.shouldThrowConfig.getById) throw new Error('Mock getById error')
        const record = this.records.get(id)
        if (name && record && record.name !== name) return undefined
        return record
    }

    async getLatestByName(name: string): Promise<DataRecord | undefined> {
        if (this.shouldThrowConfig.getLatestByName) throw new Error('Mock getLatestByName error')
        return Array.from(this.records.values())
            .filter(r => r.name === name)
            .sort((a, b) => b.date.getTime() - a.date.getTime())[0]
    }

    async doesTableExists(name: string): Promise<boolean> {
        if (this.shouldThrowConfig.doesTableExists) throw new Error('Mock doesTableExists error')
        return this.tables.has(name)
    }

    async createTable(name: string): Promise<void> {
        this.tables.add(name)
    }

    async getFirstByName(name: string): Promise<DataRecord | undefined> {
        return Array.from(this.records.values())
            .filter(r => r.name === name)
            .sort((a, b) => a.date.getTime() - b.date.getTime())[0]
    }

    async getByDateRange(name: string, startDate: Date, endDate?: Date, limit?: number, order: 'asc' | 'desc' = 'asc'): Promise<DataRecord[]> {
        let results = Array.from(this.records.values())
            .filter(r => r.name === name && r.date >= startDate && (!endDate || r.date < endDate))
            .sort((a, b) => order === 'asc' ? a.date.getTime() - b.date.getTime() : b.date.getTime() - a.date.getTime())
        if (limit) results = results.slice(0, limit)
        return results
    }

    async getAfterDate(name: string, afterDate: Date, limit?: number): Promise<DataRecord[]> {
        let results = Array.from(this.records.values())
            .filter(r => r.name === name && r.date > afterDate)
            .sort((a, b) => a.date.getTime() - b.date.getTime())
        if (limit) results = results.slice(0, limit)
        return results
    }

    async getLatestBefore(name: string, beforeDate: Date): Promise<DataRecord | undefined> {
        return Array.from(this.records.values())
            .filter(r => r.name === name && r.date < beforeDate)
            .sort((a, b) => b.date.getTime() - a.date.getTime())[0]
    }

    async getLatestRecordsBefore(name: string, beforeDate: Date, limit: number): Promise<DataRecord[]> {
        return Array.from(this.records.values())
            .filter(r => r.name === name && r.date < beforeDate)
            .sort((a, b) => b.date.getTime() - a.date.getTime())
            .slice(0, limit)
    }

    async hasRecordsAfterDate(name: string, afterDate: Date): Promise<boolean> {
        return Array.from(this.records.values()).some(r => r.name === name && r.date > afterDate)
    }

    async countByDateRange(name: string, startDate: Date, endDate?: Date): Promise<number> {
        return Array.from(this.records.values())
            .filter(r => r.name === name && r.date >= startDate && (!endDate || r.date < endDate))
            .length
    }

    async getAllByName(name: string): Promise<DataRecord[]> {
        return Array.from(this.records.values())
            .filter(r => r.name === name)
            .sort((a, b) => b.date.getTime() - a.date.getTime())
    }

    async updateAssetMetadata(tableName: string, id: number, data: Partial<{ description: string; source: string; is_public: boolean }>): Promise<DataRecord> {
        const record = this.records.get(id.toString())
        if (!record || record.name !== tableName) throw new Error(`Record ${id} not found`)
        Object.assign(record, data)
        return record
    }

    async createTableWithColumns(name: string, columns: Record<string, string>): Promise<void> {}

    async findByConditions(tableName: string, conditions: Record<string, any>): Promise<DataRecord[]> {
        return Array.from(this.records.values()).filter(r => {
            if (r.name !== tableName) return false
            for (const [k, v] of Object.entries(conditions)) {
                if ((r as any)[k] !== v) return false
            }
            return true
        })
    }

    async updateById(tableName: string, id: number, data: Record<string, any>): Promise<void> {
        const record = this.records.get(id.toString())
        if (record && record.name === tableName) Object.assign(record, data)
    }

    async close(): Promise<void> {}

    async migrateTableSchema(name: string): Promise<string[]> { return [] }

    async findCustomTableRecords(tableName: string, conditions?: Record<string, any>): Promise<any[]> {
        return Array.from(this.records.values()).filter(r => {
            if (r.name !== tableName) return false
            if (!conditions) return true
            for (const [k, v] of Object.entries(conditions)) {
                if ((r as any)[k] !== v) return false
            }
            return true
        })
    }

    async getCustomTableRecordById(tableName: string, id: number): Promise<any | null> {
        const record = this.records.get(id.toString())
        return (record && record.name === tableName) ? record : null
    }

    async insertCustomTableRecord(tableName: string, data: Record<string, any>): Promise<number> {
        const id = Math.floor(Date.now() + this.idCounter++)
        const now = new Date()
        this.records.set(id.toString(), { id, name: tableName, ...data, date: now, data: async () => Buffer.from('{}') } as any)
        return id
    }

    getUserRepository(): UserRepository {
        return {
            async initializeTables() {},
            async findOrCreateUser(authUser) {
                const now = new Date()
                return { id: 1, keycloak_id: authUser.id, roles: authUser.roles, created_at: now, updated_at: now }
            },
            async getUserById(id: number) { return undefined },
            async getUserByKeycloakId(keycloakId: string) { return undefined }
        }
    }

    getKnex(): any { return {} }
}
