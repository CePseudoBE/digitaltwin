import { DatabaseAdapter, type MetadataRow, mapToDataRecord } from '@digitaltwin/database'
import type { DataRecord, DataResolver, UserRepository } from '@digitaltwin/shared'
import type { StorageService } from '@digitaltwin/storage'
import { MockStorageService } from './mock_storage_service.js'

export interface MockDatabaseOptions {
    /** Pre-stored data in the mock */
    initialData?: DataRecord[]
    /** Data resolver callback for DataRecord lazy loading */
    dataResolver?: DataResolver
    /** Storage service for DataRecord (converted to DataResolver) */
    storage?: StorageService
    /** Error behavior configuration */
    shouldThrow?: {
        save?: boolean
        delete?: boolean
        getById?: boolean
        getLatestByName?: boolean
        doesTableExists?: boolean
        getFirstByName?: boolean
        getByDateRange?: boolean
        getAfterDate?: boolean
        getLatestBefore?: boolean
        getLatestRecordsBefore?: boolean
        hasRecordsAfterDate?: boolean
        countByDateRange?: boolean
    }
}

export class MockDatabaseAdapter extends DatabaseAdapter {
    private records: Map<string, DataRecord> = new Map()
    private dataResolver: DataResolver
    private shouldThrow: Required<NonNullable<MockDatabaseOptions['shouldThrow']>>
    private users: Map<number, { id: number; keycloak_id: string; created_at: Date; updated_at: Date }> = new Map()
    private roles: Map<number, { id: number; name: string; created_at: Date }> = new Map()
    private userRoles: Array<{ user_id: number; role_id: number; created_at: Date }> = []
    private userIdCounter = 1
    private roleIdCounter = 1
    private idCounter = 0
    private tables: Set<string> = new Set()

    constructor(options: MockDatabaseOptions = {}) {
        super()

        if (options.initialData) {
            options.initialData.forEach(record => {
                this.records.set(record.id.toString(), record)
            })
        }

        if (options.dataResolver) {
            this.dataResolver = options.dataResolver
        } else {
            const storage = options.storage || new MockStorageService()
            this.dataResolver = (url) => storage.retrieve(url)
        }

        this.shouldThrow = {
            save: options.shouldThrow?.save ?? false,
            delete: options.shouldThrow?.delete ?? false,
            getById: options.shouldThrow?.getById ?? false,
            getLatestByName: options.shouldThrow?.getLatestByName ?? false,
            doesTableExists: options.shouldThrow?.doesTableExists ?? false,
            getFirstByName: options.shouldThrow?.getFirstByName ?? false,
            getByDateRange: options.shouldThrow?.getByDateRange ?? false,
            getAfterDate: options.shouldThrow?.getAfterDate ?? false,
            getLatestBefore: options.shouldThrow?.getLatestBefore ?? false,
            getLatestRecordsBefore: options.shouldThrow?.getLatestRecordsBefore ?? false,
            hasRecordsAfterDate: options.shouldThrow?.hasRecordsAfterDate ?? false,
            countByDateRange: options.shouldThrow?.countByDateRange ?? false,
        }

    }

    resetMockState(): void {
        this.users.clear()
        this.roles.clear()
        this.userRoles = []
        this.userIdCounter = 1
        this.roleIdCounter = 1
        this.records.clear()
        this.idCounter = 0
        this.tables.clear()
    }

    async save(meta: MetadataRow): Promise<DataRecord> {
        if (this.shouldThrow.save) throw new Error('Mock save error')
        const id = meta.id ?? (Date.now() + this.idCounter++)
        const record = mapToDataRecord({ ...meta, id }, this.dataResolver)
        this.records.set(id.toString(), record)
        return record
    }

    async delete(id: string, _name?: string): Promise<void> {
        if (this.shouldThrow.delete) throw new Error('Mock delete error')
        this.records.delete(id)
    }

    async getById(id: string, name?: string): Promise<DataRecord | undefined> {
        if (this.shouldThrow.getById) throw new Error('Mock getById error')
        const record = this.records.get(id)
        if (name && record && record.name !== name) return undefined
        return record
    }

    async getLatestByName(name: string): Promise<DataRecord | undefined> {
        if (this.shouldThrow.getLatestByName) throw new Error('Mock getLatestByName error')
        const matchingRecords = Array.from(this.records.values())
            .filter(record => record.name === name)
            .sort((a, b) => b.date.getTime() - a.date.getTime())
        return matchingRecords[0]
    }

    async doesTableExists(name: string): Promise<boolean> {
        if (this.shouldThrow.doesTableExists) throw new Error('Mock doesTableExists error')
        return this.tables.has(name)
    }

    async createTable(name: string): Promise<void> {
        this.tables.add(name)
    }

    async getFirstByName(name: string): Promise<DataRecord | undefined> {
        if (this.shouldThrow.getFirstByName) throw new Error('Mock getFirstByName error')
        const matchingRecords = Array.from(this.records.values())
            .filter(record => record.name === name)
            .sort((a, b) => a.date.getTime() - b.date.getTime())
        return matchingRecords[0]
    }

    async getByDateRange(
        name: string, startDate: Date, endDate?: Date, limit?: number, order: 'asc' | 'desc' = 'asc'
    ): Promise<DataRecord[]> {
        if (this.shouldThrow.getByDateRange) throw new Error('Mock getByDateRange error')
        let matchingRecords = Array.from(this.records.values())
            .filter(record => {
                if (record.name !== name) return false
                const recordTime = record.date.getTime()
                if (recordTime < startDate.getTime()) return false
                if (endDate && recordTime >= endDate.getTime()) return false
                return true
            })
            .sort((a, b) => order === 'asc'
                ? a.date.getTime() - b.date.getTime()
                : b.date.getTime() - a.date.getTime()
            )
        if (limit) matchingRecords = matchingRecords.slice(0, limit)
        return matchingRecords
    }

    async getAfterDate(name: string, afterDate: Date, limit?: number): Promise<DataRecord[]> {
        if (this.shouldThrow.getAfterDate) throw new Error('Mock getAfterDate error')
        let matchingRecords = Array.from(this.records.values())
            .filter(record => record.name === name && record.date.getTime() > afterDate.getTime())
            .sort((a, b) => a.date.getTime() - b.date.getTime())
        if (limit) matchingRecords = matchingRecords.slice(0, limit)
        return matchingRecords
    }

    async getLatestBefore(name: string, beforeDate: Date): Promise<DataRecord | undefined> {
        if (this.shouldThrow.getLatestBefore) throw new Error('Mock getLatestBefore error')
        const matchingRecords = Array.from(this.records.values())
            .filter(record => record.name === name && record.date.getTime() < beforeDate.getTime())
            .sort((a, b) => b.date.getTime() - a.date.getTime())
        return matchingRecords[0]
    }

    async getLatestRecordsBefore(name: string, beforeDate: Date, limit: number): Promise<DataRecord[]> {
        if (this.shouldThrow.getLatestRecordsBefore) throw new Error('Mock getLatestRecordsBefore error')
        return Array.from(this.records.values())
            .filter(record => record.name === name && record.date.getTime() < beforeDate.getTime())
            .sort((a, b) => b.date.getTime() - a.date.getTime())
            .slice(0, limit)
    }

    async hasRecordsAfterDate(name: string, afterDate: Date): Promise<boolean> {
        if (this.shouldThrow.hasRecordsAfterDate) throw new Error('Mock hasRecordsAfterDate error')
        return Array.from(this.records.values()).some(
            record => record.name === name && record.date.getTime() > afterDate.getTime()
        )
    }

    async countByDateRange(name: string, startDate: Date, endDate?: Date): Promise<number> {
        if (this.shouldThrow.countByDateRange) throw new Error('Mock countByDateRange error')
        return Array.from(this.records.values()).filter(record => {
            if (record.name !== name) return false
            if (record.date.getTime() < startDate.getTime()) return false
            if (endDate && record.date.getTime() >= endDate.getTime()) return false
            return true
        }).length
    }

    // Utility methods for tests
    getAllRecords(): DataRecord[] { return Array.from(this.records.values()) }
    getRecordCount(): number { return this.records.size }
    getRecordsByName(name: string): DataRecord[] {
        return Array.from(this.records.values())
            .filter(record => record.name === name)
            .sort((a, b) => a.date.getTime() - b.date.getTime())
    }
    clear(): void { this.records.clear() }
    hasRecord(id: string): boolean { return this.records.has(id) }

    addTestRecord(name: string, date: Date): DataRecord {
        const id = Date.now() + Math.random()
        const record = mapToDataRecord({
            id, name, type: 'application/json', url: `${name}/${id}.json`, date
        }, this.dataResolver)
        this.records.set(id.toString(), record)
        return record
    }

    addTestRecords(name: string, count: number, startDate: Date, intervalMs: number = 1000): DataRecord[] {
        const records: DataRecord[] = []
        for (let i = 0; i < count; i++) {
            const date = new Date(startDate.getTime() + (i * intervalMs))
            const record = this.addTestRecord(name, date)
            records.push(record)
        }
        return records
    }

    async updateAssetMetadata(
        tableName: string, id: number,
        data: Partial<{ description: string; source: string; is_public: boolean }>
    ): Promise<DataRecord> {
        const record = this.records.get(id.toString())
        if (!record || record.name !== tableName) {
            throw new Error(`Record with ID ${id} not found in table ${tableName}`)
        }
        if (data.description !== undefined) (record as Record<string, unknown>).description = data.description
        if (data.source !== undefined) (record as Record<string, unknown>).source = data.source
        if (data.is_public !== undefined) (record as Record<string, unknown>).is_public = data.is_public
        return record
    }

    async createTableWithColumns(_name: string, _columns: Record<string, string>): Promise<void> {}

    async ensureColumns(_tableName: string, _columns: Record<string, string>): Promise<void> {}

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async findByConditions(tableName: string, conditions: Record<string, any>): Promise<DataRecord[]> {
        return Array.from(this.records.values())
            .filter(record => {
                if (record.name !== tableName) return false
                for (const [key, value] of Object.entries(conditions)) {
                    if (value === null) {
                        if ((record as Record<string, unknown>)[key] !== null) return false
                    } else if (value !== undefined) {
                        if ((record as Record<string, unknown>)[key] !== value) return false
                    }
                }
                return true
            })
            .sort((a, b) => b.date.getTime() - a.date.getTime())
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async updateById(tableName: string, id: number, data: Record<string, any>): Promise<void> {
        const record = this.records.get(id.toString())
        if (record && record.name === tableName) {
            Object.assign(record, data)
        }
    }

    async close(): Promise<void> {}

    async migrateTableSchema(_name: string): Promise<string[]> { return [] }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async findCustomTableRecords(tableName: string, conditions?: Record<string, any>): Promise<any[]> {
        return Array.from(this.records.values())
            .filter(record => {
                if (record.name !== tableName) return false
                if (!conditions) return true
                for (const [key, value] of Object.entries(conditions)) {
                    if ((record as Record<string, unknown>)[key] !== value) return false
                }
                return true
            })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async getCustomTableRecordById(tableName: string, id: number): Promise<any | null> {
        const record = this.records.get(id.toString())
        if (record && record.name === tableName) return record
        return null
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async insertCustomTableRecord(tableName: string, data: Record<string, any>): Promise<number> {
        const id = Math.floor(Date.now() + this.idCounter++)
        const now = new Date()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const record = {
            id, name: tableName, ...data,
            created_at: now, updated_at: now, date: now,
            data: async () => Buffer.from('{}')
        } as unknown as DataRecord
        this.records.set(id.toString(), record)
        return id
    }

    async getAllByName(name: string): Promise<DataRecord[]> {
        return Array.from(this.records.values())
            .filter(record => record.name === name)
            .sort((a, b) => b.date.getTime() - a.date.getTime())
    }

    getUserRepository(): UserRepository {
        const users = this.users
        const self = this

        return {
            async initializeTables(): Promise<void> {},
            async findOrCreateUser(authUser) {
                for (const user of users.values()) {
                    if (user.keycloak_id === authUser.id) {
                        return {
                            id: user.id, keycloak_id: user.keycloak_id,
                            roles: authUser.roles, created_at: user.created_at, updated_at: user.updated_at
                        }
                    }
                }
                const id = self.userIdCounter++
                const now = new Date()
                users.set(id, { id, keycloak_id: authUser.id, created_at: now, updated_at: now })
                return { id, keycloak_id: authUser.id, roles: authUser.roles, created_at: now, updated_at: now }
            },
            async getUserById(id: number) {
                const user = users.get(id)
                if (!user) return undefined
                return { id: user.id, keycloak_id: user.keycloak_id, roles: [], created_at: user.created_at, updated_at: user.updated_at }
            },
            async getUserByKeycloakId(keycloakId: string) {
                for (const user of users.values()) {
                    if (user.keycloak_id === keycloakId) {
                        return { id: user.id, keycloak_id: user.keycloak_id, roles: [], created_at: user.created_at, updated_at: user.updated_at }
                    }
                }
                return undefined
            }
        }
    }
}
