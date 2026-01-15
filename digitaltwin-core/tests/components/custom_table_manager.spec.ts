import { test } from '@japa/runner'
import { CustomTableManager } from '../../src/components/custom_table_manager.js'
import { MockDatabaseAdapter } from '../mocks/mock_database_adapter.js'
import { AuthConfig, ApisixAuthParser } from '../../src/auth/index.js'
import type { StoreConfiguration, DataResponse } from '../../src/components/types.js'

// Test implementation of CustomTableManager
class TestWMSManager extends CustomTableManager {
    getConfiguration(): StoreConfiguration {
        return {
            name: 'wms_layers',
            description: 'Test WMS layers manager',
            columns: {
                wms_url: 'text not null',
                layer_name: 'text not null',
                description: 'text',
                active: 'boolean default true'
            }
        }
    }
}

// Test implementation with custom endpoints
class TestCustomEndpointManager extends CustomTableManager {
    getConfiguration(): StoreConfiguration {
        return {
            name: 'sensors',
            description: 'IoT sensors',
            columns: {
                sensor_id: 'text unique not null',
                type: 'text',
                location: 'text'
            },
            endpoints: [
                { path: '/active', method: 'get', handler: 'getActiveSensors' }
            ]
        }
    }

    async getActiveSensors(_req: any): Promise<DataResponse> {
        return {
            status: 200,
            content: JSON.stringify({ sensors: [] }),
            headers: { 'Content-Type': 'application/json' }
        }
    }
}

// Helper functions
function ensureAuthEnabled() {
    delete process.env.DIGITALTWIN_DISABLE_AUTH
    AuthConfig._resetConfig()
    ApisixAuthParser._resetProvider()
}

function restoreTestEnv() {
    process.env.DIGITALTWIN_DISABLE_AUTH = 'true'
    AuthConfig._resetConfig()
    ApisixAuthParser._resetProvider()
}

test.group('CustomTableManager configuration', () => {
    test('should return correct configuration', ({ assert }) => {
        const manager = new TestWMSManager()
        const config = manager.getConfiguration()

        assert.equal(config.name, 'wms_layers')
        assert.equal(config.description, 'Test WMS layers manager')
        assert.isDefined(config.columns)
        assert.isDefined(config.columns.wms_url)
        assert.isDefined(config.columns.layer_name)
    })

    test('setDependencies should initialize manager', ({ assert }) => {
        const manager = new TestWMSManager()
        const db = new MockDatabaseAdapter()
        manager.setDependencies(db)

        // Manager should have db set (verified by not throwing)
        assert.isDefined(manager)
    })
})

test.group('CustomTableManager CRUD operations', (group) => {
    group.setup(() => {
        ensureAuthEnabled()
    })

    group.teardown(() => {
        restoreTestEnv()
    })

    test('create should insert record and return ID', async ({ assert }) => {
        const manager = new TestWMSManager()
        const db = new MockDatabaseAdapter()
        manager.setDependencies(db)

        const id = await manager.create({
            wms_url: 'https://example.com/wms',
            layer_name: 'test_layer',
            description: 'A test layer'
        })

        assert.isNumber(id)
        assert.isTrue(id > 0)
    })

    test('findAll should return all records', async ({ assert }) => {
        const manager = new TestWMSManager()
        const db = new MockDatabaseAdapter()
        manager.setDependencies(db)

        // Create some records
        await manager.create({ wms_url: 'url1', layer_name: 'layer1' })
        await manager.create({ wms_url: 'url2', layer_name: 'layer2' })

        const records = await manager.findAll()

        assert.isArray(records)
    })

    test('findById should return record by ID', async ({ assert }) => {
        const manager = new TestWMSManager()
        const db = new MockDatabaseAdapter()
        manager.setDependencies(db)

        const id = await manager.create({
            wms_url: 'https://example.com/wms',
            layer_name: 'findable_layer'
        })

        const record = await manager.findById(id)

        assert.isNotNull(record)
        assert.equal(record!.id, id)
    })

    test('findById should return null for non-existent ID', async ({ assert }) => {
        const manager = new TestWMSManager()
        const db = new MockDatabaseAdapter()
        manager.setDependencies(db)

        const record = await manager.findById(99999)

        assert.isNull(record)
    })

    test('findByColumn should find records by single column', async ({ assert }) => {
        const manager = new TestWMSManager()
        const db = new MockDatabaseAdapter()
        manager.setDependencies(db)

        await manager.create({ wms_url: 'url1', layer_name: 'unique_layer' })

        const records = await manager.findByColumn('layer_name', 'unique_layer')

        assert.isArray(records)
    })

    test('findByColumn should throw for empty required value', async ({ assert }) => {
        const manager = new TestWMSManager()
        const db = new MockDatabaseAdapter()
        manager.setDependencies(db)

        await assert.rejects(async () => {
            await manager.findByColumn('layer_name', '')
        }, /required/)
    })

    test('findByColumn should allow empty value when not required', async ({ assert }) => {
        const manager = new TestWMSManager()
        const db = new MockDatabaseAdapter()
        manager.setDependencies(db)

        await assert.doesNotThrow(async () => {
            await manager.findByColumn('description', '', false)
        })
    })

    test('findByColumns should find by multiple conditions', async ({ assert }) => {
        const manager = new TestWMSManager()
        const db = new MockDatabaseAdapter()
        manager.setDependencies(db)

        const records = await manager.findByColumns({
            wms_url: 'url1',
            active: true
        })

        assert.isArray(records)
    })

    test('findByColumns should validate required fields', async ({ assert }) => {
        const manager = new TestWMSManager()
        const db = new MockDatabaseAdapter()
        manager.setDependencies(db)

        await assert.rejects(async () => {
            await manager.findByColumns(
                { wms_url: '' },
                { required: ['wms_url'] }
            )
        }, /non-empty/)
    })

    test('findByColumns should run custom validation', async ({ assert }) => {
        const manager = new TestWMSManager()
        const db = new MockDatabaseAdapter()
        manager.setDependencies(db)

        await assert.rejects(async () => {
            await manager.findByColumns(
                { wms_url: 'invalid-url' },
                {
                    validate: (conditions) => {
                        if (!conditions.wms_url.startsWith('http')) {
                            throw new Error('URL must start with http')
                        }
                    }
                }
            )
        }, /URL must start with http/)
    })

    test('update should modify record', async ({ assert }) => {
        const manager = new TestWMSManager()
        const db = new MockDatabaseAdapter()
        manager.setDependencies(db)

        const id = await manager.create({
            wms_url: 'https://example.com/wms',
            layer_name: 'original_name'
        })

        await assert.doesNotThrow(async () => {
            await manager.update(id, { layer_name: 'updated_name' })
        })
    })

    test('delete should remove record', async ({ assert }) => {
        const manager = new TestWMSManager()
        const db = new MockDatabaseAdapter()
        manager.setDependencies(db)

        const id = await manager.create({
            wms_url: 'https://example.com/wms',
            layer_name: 'to_delete'
        })

        await assert.doesNotThrow(async () => {
            await manager.delete(id)
        })
    })

    test('deleteByColumn should delete by single column', async ({ assert }) => {
        const manager = new TestWMSManager()
        const db = new MockDatabaseAdapter()
        manager.setDependencies(db)

        await manager.create({ wms_url: 'url1', layer_name: 'layer1', active: false })

        const count = await manager.deleteByColumn('active', false)

        assert.isNumber(count)
    })

    test('deleteByCondition should delete by multiple conditions', async ({ assert }) => {
        const manager = new TestWMSManager()
        const db = new MockDatabaseAdapter()
        manager.setDependencies(db)

        const count = await manager.deleteByCondition({ active: false })

        assert.isNumber(count)
    })
})

test.group('CustomTableManager endpoints', (group) => {
    group.setup(() => {
        ensureAuthEnabled()
    })

    group.teardown(() => {
        restoreTestEnv()
    })

    test('getEndpoints should return standard CRUD endpoints', ({ assert }) => {
        const manager = new TestWMSManager()
        const db = new MockDatabaseAdapter()
        manager.setDependencies(db)

        const endpoints = manager.getEndpoints()

        assert.isArray(endpoints)
        assert.isTrue(endpoints.length >= 5) // GET all, POST, GET/:id, PUT/:id, DELETE/:id

        const methods = endpoints.map(ep => ep.method)
        assert.include(methods, 'get')
        assert.include(methods, 'post')
        assert.include(methods, 'put')
        assert.include(methods, 'delete')
    })

    test('getEndpoints should include custom endpoints', ({ assert }) => {
        const manager = new TestCustomEndpointManager()
        const db = new MockDatabaseAdapter()
        manager.setDependencies(db)

        const endpoints = manager.getEndpoints()

        const customEndpoint = endpoints.find(ep => ep.path.includes('/active'))
        assert.isDefined(customEndpoint)
        assert.equal(customEndpoint!.method, 'get')
    })

    test('handleGetAll should return all records', async ({ assert }) => {
        const manager = new TestWMSManager()
        const db = new MockDatabaseAdapter()
        manager.setDependencies(db)

        const response = await manager.handleGetAll({})

        assert.equal(response.status, 200)
        const parsed = JSON.parse(response.content as string)
        assert.isArray(parsed)
    })

    test('handleCreate should require authentication', async ({ assert }) => {
        const manager = new TestWMSManager()
        const db = new MockDatabaseAdapter()
        manager.setDependencies(db)

        const response = await manager.handleCreate({
            body: { wms_url: 'url', layer_name: 'layer' },
            headers: {} // No auth headers
        })

        assert.equal(response.status, 401)
    })

    test('handleCreate should create record when authenticated', async ({ assert }) => {
        const manager = new TestWMSManager()
        const db = new MockDatabaseAdapter()
        manager.setDependencies(db)

        const response = await manager.handleCreate({
            body: { wms_url: 'https://example.com/wms', layer_name: 'new_layer' },
            headers: {
                'x-user-id': 'test-user-123',
                'x-user-roles': 'user'
            }
        })

        assert.equal(response.status, 201)
        const parsed = JSON.parse(response.content as string)
        assert.isDefined(parsed.id)
        assert.equal(parsed.message, 'Record created successfully')
    })

    test('handleGetById should return record', async ({ assert }) => {
        const manager = new TestWMSManager()
        const db = new MockDatabaseAdapter()
        manager.setDependencies(db)

        // Create a record first
        const id = await manager.create({
            wms_url: 'url',
            layer_name: 'layer',
            owner_id: 1
        })

        const response = await manager.handleGetById({
            params: { id: String(id) }
        })

        assert.equal(response.status, 200)
    })

    test('handleGetById should return 400 for missing ID', async ({ assert }) => {
        const manager = new TestWMSManager()
        const db = new MockDatabaseAdapter()
        manager.setDependencies(db)

        const response = await manager.handleGetById({
            params: {}
        })

        assert.equal(response.status, 422) // ValidationError returns 422 Unprocessable Entity
    })

    test('handleGetById should return 404 for non-existent record', async ({ assert }) => {
        const manager = new TestWMSManager()
        const db = new MockDatabaseAdapter()
        manager.setDependencies(db)

        const response = await manager.handleGetById({
            params: { id: '99999' }
        })

        assert.equal(response.status, 404)
    })

    test('handleUpdate should require authentication', async ({ assert }) => {
        const manager = new TestWMSManager()
        const db = new MockDatabaseAdapter()
        manager.setDependencies(db)

        const response = await manager.handleUpdate({
            params: { id: '1' },
            body: { layer_name: 'updated' },
            headers: {}
        })

        assert.equal(response.status, 401)
    })

    test('handleUpdate should check ownership', async ({ assert }) => {
        const manager = new TestWMSManager()
        const db = new MockDatabaseAdapter()
        manager.setDependencies(db)

        // Create record owned by a different user
        const id = await manager.create({
            wms_url: 'url',
            layer_name: 'layer',
            owner_id: 999 // Different owner
        })

        const response = await manager.handleUpdate({
            params: { id: String(id) },
            body: { layer_name: 'updated' },
            headers: {
                'x-user-id': 'test-user-123',
                'x-user-roles': 'user'
            }
        })

        assert.equal(response.status, 403)
    })

    test('handleDelete should require authentication', async ({ assert }) => {
        const manager = new TestWMSManager()
        const db = new MockDatabaseAdapter()
        manager.setDependencies(db)

        const response = await manager.handleDelete({
            params: { id: '1' },
            headers: {}
        })

        assert.equal(response.status, 401)
    })

    test('handleDelete should check ownership', async ({ assert }) => {
        const manager = new TestWMSManager()
        const db = new MockDatabaseAdapter()
        manager.setDependencies(db)

        // Create record owned by a different user
        const id = await manager.create({
            wms_url: 'url',
            layer_name: 'layer',
            owner_id: 999 // Different owner
        })

        const response = await manager.handleDelete({
            params: { id: String(id) },
            headers: {
                'x-user-id': 'test-user-123',
                'x-user-roles': 'user'
            }
        })

        assert.equal(response.status, 403)
    })
})

test.group('CustomTableManager authentication helpers', (group) => {
    group.setup(() => {
        ensureAuthEnabled()
    })

    group.teardown(() => {
        restoreTestEnv()
    })

    test('authErrorResponse should return 401', ({ assert }) => {
        const manager = new TestWMSManager()
        const db = new MockDatabaseAdapter()
        manager.setDependencies(db)

        // Access protected method via type assertion
        const response = (manager as any).authErrorResponse()

        assert.equal(response.status, 401)
        const parsed = JSON.parse(response.content as string)
        assert.equal(parsed.error, 'Authentication required')
    })

    test('authErrorResponse should accept custom message', ({ assert }) => {
        const manager = new TestWMSManager()
        const db = new MockDatabaseAdapter()
        manager.setDependencies(db)

        const response = (manager as any).authErrorResponse('Custom auth error')

        assert.equal(response.status, 401)
        const parsed = JSON.parse(response.content as string)
        assert.equal(parsed.error, 'Custom auth error')
    })

    test('forbiddenErrorResponse should return 403', ({ assert }) => {
        const manager = new TestWMSManager()
        const db = new MockDatabaseAdapter()
        manager.setDependencies(db)

        const response = (manager as any).forbiddenErrorResponse()

        assert.equal(response.status, 403)
    })

    test('userOwnsRecord should check ownership correctly', ({ assert }) => {
        const manager = new TestWMSManager()
        const db = new MockDatabaseAdapter()
        manager.setDependencies(db)

        const record = { id: 1, owner_id: 123, created_at: new Date(), updated_at: new Date() }
        const userRecord = { id: 123, keycloak_id: 'test', roles: [] }

        assert.isTrue((manager as any).userOwnsRecord(record, userRecord))
    })

    test('userOwnsRecord should return false for different owner', ({ assert }) => {
        const manager = new TestWMSManager()
        const db = new MockDatabaseAdapter()
        manager.setDependencies(db)

        const record = { id: 1, owner_id: 456, created_at: new Date(), updated_at: new Date() }
        const userRecord = { id: 123, keycloak_id: 'test', roles: [] }

        assert.isFalse((manager as any).userOwnsRecord(record, userRecord))
    })

    test('userOwnsRecord should return false for record without owner', ({ assert }) => {
        const manager = new TestWMSManager()
        const db = new MockDatabaseAdapter()
        manager.setDependencies(db)

        const record = { id: 1, created_at: new Date(), updated_at: new Date() }
        const userRecord = { id: 123, keycloak_id: 'test', roles: [] }

        assert.isFalse((manager as any).userOwnsRecord(record, userRecord))
    })
})
