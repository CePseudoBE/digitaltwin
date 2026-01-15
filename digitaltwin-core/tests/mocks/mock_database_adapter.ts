import {DatabaseAdapter, MetadataRow} from '../../src/database/database_adapter.js'
import {DataRecord} from '../../src/types/data_record.js'
import {StorageService} from '../../src/storage/storage_service.js'
import {mapToDataRecord} from '../../src/utils/map_to_data_record.js'
import {MockStorageService} from "./mock_storage_service.js";

export interface MockDatabaseOptions {
    /** Données pré-stockées dans le mock */
    initialData?: DataRecord[]
    /** Service de stockage à utiliser pour les DataRecord */
    storage?: StorageService
    /** Comportement des méthodes (pour tester les erreurs) */
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
    private storage: StorageService
    private shouldThrow: Required<NonNullable<MockDatabaseOptions['shouldThrow']>>
    private mockKnex: any

    constructor(options: MockDatabaseOptions = {}) {
        super()

        // Initialiser les données pré-stockées
        if (options.initialData) {
            options.initialData.forEach(record => {
                this.records.set(record.id.toString(), record)
            })
        }

        // Service de stockage par défaut (mock simple)
        this.storage = options.storage || new MockStorageService()

        // Configuration des erreurs (toutes les nouvelles méthodes)
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

        // Initialize mock Knex instance for UserService compatibility
        this.mockKnex = this.createMockKnex()
    }

    // ========== Mock Knex for UserService ==========

    private users: Map<number, { id: number; keycloak_id: string; created_at: Date; updated_at: Date }> = new Map()
    private roles: Map<number, { id: number; name: string; created_at: Date }> = new Map()
    private userRoles: Array<{ user_id: number; role_id: number; created_at: Date }> = []
    private userIdCounter = 1
    private roleIdCounter = 1
    private idCounter = 0
    private tables: Set<string> = new Set() // Track created tables

    private createMockKnex(): any {
        const self = this

        const createQueryBuilder = (tableName: string) => {
            let whereConditions: Record<string, any> = {}
            let whereInConditions: Array<{ column: string; values: any[] }> = []
            let insertData: any = null
            let updateData: any = null
            let selectedColumns: string[] = ['*']
            let joins: Array<{ type: string; table: string; col1: string; col2: string }> = []

            const queryBuilder: any = {
                select: (...cols: string[]) => {
                    selectedColumns = cols.length > 0 ? cols : ['*']
                    return queryBuilder
                },
                where: (conditions: Record<string, any> | string, value?: any) => {
                    if (typeof conditions === 'string') {
                        whereConditions[conditions] = value
                    } else {
                        whereConditions = { ...whereConditions, ...conditions }
                    }
                    return queryBuilder
                },
                whereIn: (column: string, values: any[]) => {
                    whereInConditions.push({ column, values })
                    return queryBuilder
                },
                leftJoin: (table: string, col1: string, col2: string) => {
                    joins.push({ type: 'left', table, col1, col2 })
                    return queryBuilder
                },
                join: (table: string, col1: string, col2: string) => {
                    joins.push({ type: 'inner', table, col1, col2 })
                    return queryBuilder
                },
                first: async () => {
                    if (tableName === 'users') {
                        for (const user of self.users.values()) {
                            let match = true
                            for (const [key, val] of Object.entries(whereConditions)) {
                                if ((user as any)[key] !== val) match = false
                            }
                            if (match) return user
                        }
                        return undefined
                    }
                    if (tableName === 'roles') {
                        for (const role of self.roles.values()) {
                            let match = true
                            for (const [key, val] of Object.entries(whereConditions)) {
                                if ((role as any)[key] !== val) match = false
                            }
                            if (match) return role
                        }
                        return undefined
                    }
                    return undefined
                },
                insert: (data: any) => {
                    insertData = data
                    return {
                        ...queryBuilder,
                        onConflict: (columns: string | string[]) => ({
                            ignore: () => queryBuilder,
                            merge: (cols?: string[]) => queryBuilder
                        })
                    }
                },
                update: (data: any) => {
                    updateData = data
                    return queryBuilder
                },
                del: async () => {
                    if (tableName === 'user_roles') {
                        self.userRoles = self.userRoles.filter(ur => {
                            for (const [key, val] of Object.entries(whereConditions)) {
                                if ((ur as any)[key] !== val) return true
                            }
                            return false
                        })
                    }
                    return 1
                },
                delete: async function() {
                    return queryBuilder.del()
                },
                returning: (col: string) => {
                    return queryBuilder
                },
                then: async (resolve: any, reject?: any) => {
                    try {
                        if (insertData) {
                            if (tableName === 'users') {
                                const id = self.userIdCounter++
                                const user = { id, ...insertData, created_at: new Date(), updated_at: new Date() }
                                self.users.set(id, user)
                                resolve([{ id }])
                            } else if (tableName === 'roles') {
                                const id = self.roleIdCounter++
                                const role = { id, ...insertData, created_at: new Date() }
                                self.roles.set(id, role)
                                resolve([{ id }])
                            } else if (tableName === 'user_roles') {
                                self.userRoles.push({ ...insertData, created_at: new Date() })
                                resolve([])
                            } else {
                                resolve([])
                            }
                        } else if (updateData) {
                            if (tableName === 'users') {
                                for (const user of self.users.values()) {
                                    let match = true
                                    for (const [key, val] of Object.entries(whereConditions)) {
                                        if ((user as any)[key] !== val) match = false
                                    }
                                    if (match) {
                                        Object.assign(user, updateData)
                                    }
                                }
                            }
                            resolve(1)
                        } else {
                            // Select query - helper to check whereIn conditions
                            const matchesWhereIn = (item: any): boolean => {
                                for (const { column, values } of whereInConditions) {
                                    if (!values.includes((item as any)[column])) {
                                        return false
                                    }
                                }
                                return true
                            }

                            // Helper to check where conditions (handles table.column format)
                            const matchesWhere = (item: any, conditions: Record<string, any>): boolean => {
                                for (const [key, val] of Object.entries(conditions)) {
                                    // Handle "table.column" format by extracting just the column
                                    const actualKey = key.includes('.') ? key.split('.').pop()! : key
                                    if ((item as any)[actualKey] !== val) return false
                                }
                                return true
                            }

                            // Handle JOIN queries for users table
                            if (tableName === 'users' && joins.length > 0) {
                                const results: any[] = []
                                for (const user of self.users.values()) {
                                    if (!matchesWhere(user, whereConditions)) continue

                                    // Find user_roles for this user
                                    const userRoleLinks = self.userRoles.filter(ur => ur.user_id === user.id)

                                    if (userRoleLinks.length === 0) {
                                        // LEFT JOIN returns user even without roles
                                        results.push({
                                            id: user.id,
                                            keycloak_id: user.keycloak_id,
                                            created_at: user.created_at,
                                            updated_at: user.updated_at,
                                            role_name: null
                                        })
                                    } else {
                                        // Add a row for each role
                                        for (const ur of userRoleLinks) {
                                            const role = self.roles.get(ur.role_id)
                                            results.push({
                                                id: user.id,
                                                keycloak_id: user.keycloak_id,
                                                created_at: user.created_at,
                                                updated_at: user.updated_at,
                                                role_name: role?.name || null
                                            })
                                        }
                                    }
                                }
                                resolve(results)
                            } else if (tableName === 'users') {
                                const results: any[] = []
                                for (const user of self.users.values()) {
                                    if (matchesWhere(user, whereConditions) && matchesWhereIn(user)) {
                                        results.push(user)
                                    }
                                }
                                resolve(results)
                            } else if (tableName === 'roles') {
                                const results: any[] = []
                                for (const role of self.roles.values()) {
                                    if (matchesWhere(role, whereConditions) && matchesWhereIn(role)) {
                                        results.push(role)
                                    }
                                }
                                resolve(results)
                            } else if (tableName === 'user_roles') {
                                const results = self.userRoles.filter(ur => {
                                    return matchesWhere(ur, whereConditions) && matchesWhereIn(ur)
                                })
                                resolve(results)
                            } else {
                                resolve([])
                            }
                        }
                    } catch (e) {
                        if (reject) reject(e)
                        else throw e
                    }
                }
            }
            return queryBuilder
        }

        const knex: any = (tableName: string) => createQueryBuilder(tableName)

        knex.schema = {
            hasTable: async (tableName: string) => {
                return tableName === 'users' || tableName === 'roles' || tableName === 'user_roles'
            },
            createTable: async (tableName: string, callback: any) => {
                // Mock table creation - just succeed
                return true
            }
        }

        knex.raw = async (sql: string) => {
            // Mock raw queries - return empty result
            return { rows: [] }
        }

        // Mock fn.now() for timestamp defaults
        knex.fn = {
            now: () => new Date()
        }

        // Mock transaction - just execute the callback with the knex instance
        knex.transaction = async (callback: (trx: any) => Promise<any>) => {
            return callback(knex)
        }

        return knex
    }

    getKnex(): any {
        return this.mockKnex
    }

    // Reset mock state (useful between tests)
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

    // ========== Basic methods ==========

    async save(meta: MetadataRow): Promise<DataRecord> {
        if (this.shouldThrow.save) {
            throw new Error('Mock save error')
        }

        // Use counter to ensure unique IDs in rapid succession
        const id = meta.id ?? (Date.now() + this.idCounter++)
        const record = mapToDataRecord({ ...meta, id }, this.storage)
        this.records.set(id.toString(), record)
        return record
    }

    async delete(id: string, name?: string): Promise<void> {
        if (this.shouldThrow.delete) {
            throw new Error('Mock delete error')
        }

        this.records.delete(id)
    }

    async getById(id: string, name?: string): Promise<DataRecord | undefined> {
        if (this.shouldThrow.getById) {
            throw new Error('Mock getById error')
        }

        const record = this.records.get(id)
        
        // Si name est fourni, vérifier que le record appartient à cette table
        if (name && record && record.name !== name) {
            return undefined
        }
        
        return record
    }

    async getLatestByName(name: string): Promise<DataRecord | undefined> {
        if (this.shouldThrow.getLatestByName) {
            throw new Error('Mock getLatestByName error')
        }

        // Filtrer par nom et prendre le plus récent
        const matchingRecords = Array.from(this.records.values())
            .filter(record => record.name === name)
            .sort((a, b) => b.date.getTime() - a.date.getTime())

        return matchingRecords[0]
    }

    async doesTableExists(name: string): Promise<boolean> {
        if (this.shouldThrow.doesTableExists) {
            throw new Error('Mock doesTableExists error')
        }

        // Check if table was created
        return this.tables.has(name)
    }

    async createTable(name: string): Promise<void> {
        // Track created tables
        this.tables.add(name)
    }

    // ========== Extended methods ==========

    async getFirstByName(name: string): Promise<DataRecord | undefined> {
        if (this.shouldThrow.getFirstByName) {
            throw new Error('Mock getFirstByName error')
        }

        // Filtrer par nom et prendre le plus ancien
        const matchingRecords = Array.from(this.records.values())
            .filter(record => record.name === name)
            .sort((a, b) => a.date.getTime() - b.date.getTime())

        return matchingRecords[0]
    }

    async getByDateRange(
        name: string,
        startDate: Date,
        endDate?: Date,
        limit?: number
    ): Promise<DataRecord[]> {
        if (this.shouldThrow.getByDateRange) {
            throw new Error('Mock getByDateRange error')
        }


        // DEBUG: Log de tous les records disponibles
        const allRecordsForName = Array.from(this.records.values()).filter(r => r.name === name)

        let matchingRecords = Array.from(this.records.values())
            .filter(record => {
                if (record.name !== name) return false

                const recordTime = record.date.getTime()
                const startTime = startDate.getTime()

                // CONDITION 1: Record >= startDate
                const afterStart = recordTime >= startTime

                // CONDITION 2: Record < endDate (si endDate définie)
                let beforeEnd = true
                if (endDate) {
                    const endTime = endDate.getTime()
                    beforeEnd = recordTime < endTime
                }

                return afterStart && beforeEnd
            })
            .sort((a, b) => a.date.getTime() - b.date.getTime())

        if (limit) {
            matchingRecords = matchingRecords.slice(0, limit)
        }

        return matchingRecords
    }

    async getAfterDate(
        name: string,
        afterDate: Date,
        limit?: number
    ): Promise<DataRecord[]> {
        if (this.shouldThrow.getAfterDate) {
            throw new Error('Mock getAfterDate error')
        }

        let matchingRecords = Array.from(this.records.values())
            .filter(record => {
                return record.name === name && record.date.getTime() > afterDate.getTime()
            })
            .sort((a, b) => a.date.getTime() - b.date.getTime())

        if (limit) {
            matchingRecords = matchingRecords.slice(0, limit)
        }

        return matchingRecords
    }

    async getLatestBefore(
        name: string,
        beforeDate: Date
    ): Promise<DataRecord | undefined> {
        if (this.shouldThrow.getLatestBefore) {
            throw new Error('Mock getLatestBefore error')
        }

        const matchingRecords = Array.from(this.records.values())
            .filter(record => {
                return record.name === name && record.date.getTime() < beforeDate.getTime()
            })
            .sort((a, b) => b.date.getTime() - a.date.getTime())

        return matchingRecords[0]
    }

    async getLatestRecordsBefore(
        name: string,
        beforeDate: Date,
        limit: number
    ): Promise<DataRecord[]> {
        if (this.shouldThrow.getLatestRecordsBefore) {
            throw new Error('Mock getLatestRecordsBefore error')
        }

        const matchingRecords = Array.from(this.records.values())
            .filter(record => {
                return record.name === name && record.date.getTime() < beforeDate.getTime()
            })
            .sort((a, b) => b.date.getTime() - a.date.getTime())
            .slice(0, limit)

        return matchingRecords
    }

    async hasRecordsAfterDate(
        name: string,
        afterDate: Date
    ): Promise<boolean> {
        if (this.shouldThrow.hasRecordsAfterDate) {
            throw new Error('Mock hasRecordsAfterDate error')
        }

        return Array.from(this.records.values()).some(record => {
            return record.name === name && record.date.getTime() > afterDate.getTime()
        })
    }

    async countByDateRange(
        name: string,
        startDate: Date,
        endDate?: Date
    ): Promise<number> {
        if (this.shouldThrow.countByDateRange) {
            throw new Error('Mock countByDateRange error')
        }

        return Array.from(this.records.values()).filter(record => {
            if (record.name !== name) return false

            const recordTime = record.date.getTime()
            const startTime = startDate.getTime()

            if (recordTime < startTime) return false

            if (endDate && recordTime >= endDate.getTime()) return false

            return true
        }).length
    }

    // ========== Utility methods for tests ==========

    getAllRecords(): DataRecord[] {
        return Array.from(this.records.values())
    }

    getRecordCount(): number {
        return this.records.size
    }

    getRecordsByName(name: string): DataRecord[] {
        return Array.from(this.records.values())
            .filter(record => record.name === name)
            .sort((a, b) => a.date.getTime() - b.date.getTime())
    }

    clear(): void {
        this.records.clear()
    }

    hasRecord(id: string): boolean {
        return this.records.has(id)
    }

    // Méthodes utilitaires pour créer des données de test
    addTestRecord(name: string, date: Date, data: any = {}): DataRecord {
        const id = Date.now() + Math.random()
        const record = mapToDataRecord({
            id,
            name,
            type: 'application/json',
            url: `${name}/${id}.json`,
            date
        }, this.storage)

        this.records.set(id.toString(), record)
        return record
    }

    addTestRecords(name: string, count: number, startDate: Date, intervalMs: number = 1000): DataRecord[] {
        const records: DataRecord[] = []

        for (let i = 0; i < count; i++) {
            const date = new Date(startDate.getTime() + (i * intervalMs))
            const record = this.addTestRecord(name, date, { index: i })
            records.push(record)
        }

        return records
    }

    // ========== AssetsManager methods ==========

    async updateAssetMetadata(
        tableName: string,
        id: number,
        data: Partial<{ description: string; source: string; is_public: boolean }>
    ): Promise<DataRecord> {
        const record = this.records.get(id.toString())

        if (!record || record.name !== tableName) {
            throw new Error(`Record with ID ${id} not found in table ${tableName}`)
        }

        // Update the fields that are provided
        if (data.description !== undefined) {
            ;(record as any).description = data.description
        }
        if (data.source !== undefined) {
            ;(record as any).source = data.source
        }
        if (data.is_public !== undefined) {
            ;(record as any).is_public = data.is_public
        }

        return record
    }

    // ========== CustomTableManager methods ==========

    async createTableWithColumns(name: string, columns: Record<string, string>): Promise<void> {
        // Mock implementation - tables exist automatically
    }

    async findByConditions(tableName: string, conditions: Record<string, any>): Promise<DataRecord[]> {
        // Filter records by table name and conditions
        return Array.from(this.records.values())
            .filter(record => {
                // Check table name
                if (record.name !== tableName) return false
                
                // Check all conditions
                for (const [key, value] of Object.entries(conditions)) {
                    if (value === null) {
                        if ((record as any)[key] !== null) return false
                    } else if (value !== undefined) {
                        if ((record as any)[key] !== value) return false
                    }
                }
                
                return true
            })
            .sort((a, b) => b.date.getTime() - a.date.getTime())
    }

    async updateById(tableName: string, id: number, data: Record<string, any>): Promise<void> {
        const record = this.records.get(id.toString())
        if (record && record.name === tableName) {
            // Update record properties
            Object.assign(record, data)
        }
    }

    async close(): Promise<void> {
        // Mock implementation - nothing to close
    }

    // ========== Missing abstract method implementations ==========

    async migrateTableSchema(name: string): Promise<string[]> {
        // Mock implementation - no migrations needed
        return []
    }

    async findCustomTableRecords(tableName: string, conditions?: Record<string, any>): Promise<any[]> {
        return Array.from(this.records.values())
            .filter(record => {
                if (record.name !== tableName) return false
                if (!conditions) return true

                for (const [key, value] of Object.entries(conditions)) {
                    if ((record as any)[key] !== value) return false
                }
                return true
            })
    }

    async getCustomTableRecordById(tableName: string, id: number): Promise<any | null> {
        const record = this.records.get(id.toString())
        if (record && record.name === tableName) {
            return record
        }
        return null
    }

    async insertCustomTableRecord(tableName: string, data: Record<string, any>): Promise<number> {
        const id = Math.floor(Date.now() + this.idCounter++)
        const now = new Date()
        const record = {
            id,
            name: tableName,
            ...data,
            created_at: now,
            updated_at: now,
            date: now,
            data: async () => Buffer.from('{}')
        } as any
        this.records.set(id.toString(), record)
        return id
    }

    async getAllByName(name: string): Promise<DataRecord[]> {
        return Array.from(this.records.values())
            .filter(record => record.name === name)
            .sort((a, b) => b.date.getTime() - a.date.getTime())
    }
}
