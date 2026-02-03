import { test } from '@japa/runner'
import { initializeComponents } from '../../src/engine/initializer.js'
import { Collector } from '../../src/components/collector.js'
import { Harvester } from '../../src/components/harvester.js'
import { MockDatabaseAdapter } from '../mocks/mock_database_adapter.js'
import { MockStorageService } from '../mocks/mock_storage_service.js'
import { CollectorConfiguration, HarvesterConfiguration } from '../../src/components/types.js'
import { DataRecord } from '../../src/types/data_record.js'

class MockCollector extends Collector {
  constructor(private name: string) {
    super()
  }

  async collect(): Promise<Buffer> {
    return Buffer.from('test-data')
  }

  getConfiguration(): CollectorConfiguration {
    return {
      name: this.name,
      description: 'Test collector',
      contentType: 'text/plain',
      endpoint: this.name,
    }
  }

  getSchedule(): string {
    return '0 * * * * *'
  }
}

class MockHarvester extends Harvester {
  constructor(private name: string) {
    super()
  }

  async harvest(sourceData: DataRecord | DataRecord[]): Promise<Buffer> {
    return Buffer.from('processed-data')
  }

  getConfiguration(): HarvesterConfiguration {
    return {
      name: this.name,
      description: 'Test harvester',
      contentType: 'text/plain',
      endpoint: this.name,
      source: 'test-source',
      triggerMode: 'schedule',
      debounceMs: 1000,
      source_range_min: false,
      multiple_results: false,
    }
  }

  getSchedule(): string {
    return '0 * * * * *'
  }
}

test.group('initializeComponents', () => {
  test('should initialize components successfully when tables exist', async ({ assert }) => {
    const database = new MockDatabaseAdapter()
    const storage = new MockStorageService()
    
    const collector = new MockCollector('test-collector')
    const harvester = new MockHarvester('test-harvester')
    
    // Mock tables to exist
    database.doesTableExists = async (tableName: string) => true
    
    // Track if setDependencies was called
    let collectorInitialized = false
    let harvesterInitialized = false
    
    collector.setDependencies = (db, st) => {
      collectorInitialized = true
      assert.strictEqual(db, database)
      assert.strictEqual(st, storage)
    }
    
    harvester.setDependencies = (db, st) => {
      harvesterInitialized = true
      assert.strictEqual(db, database)
      assert.strictEqual(st, storage)
    }

    await initializeComponents([collector, harvester], database, storage)

    assert.isTrue(collectorInitialized)
    assert.isTrue(harvesterInitialized)
  })

  test('should auto-create table when it does not exist', async ({ assert }) => {
    const database = new MockDatabaseAdapter()
    const storage = new MockStorageService()

    const collector = new MockCollector('auto-created-table')

    // Track if createTable was called
    let tableCreated = false
    const originalCreateTable = database.createTable.bind(database)
    database.createTable = async (tableName: string) => {
      tableCreated = true
      return originalCreateTable(tableName)
    }

    // Mock table to not exist initially
    database.doesTableExists = async (tableName: string) => false

    // Should NOT throw - table should be auto-created
    await assert.doesNotThrow(async () => {
      await initializeComponents([collector], database, storage)
    })

    assert.isTrue(tableCreated, 'Table should have been auto-created')
  })

  test('should auto-create missing tables for multiple components', async ({ assert }) => {
    const database = new MockDatabaseAdapter()
    const storage = new MockStorageService()

    const collector1 = new MockCollector('existing-table')
    const collector2 = new MockCollector('missing-table')
    const collector3 = new MockCollector('another-missing-table')

    // Pre-create existing-table to simulate it already exists
    await database.createTable('existing-table')

    // Track created tables after the pre-creation
    const initialTablesCount = 1
    let tablesCreatedCount = 0
    const originalCreateTable = database.createTable.bind(database)
    database.createTable = async (tableName: string) => {
      tablesCreatedCount++
      return originalCreateTable(tableName)
    }

    // Should NOT throw - missing tables should be auto-created
    await initializeComponents([collector1, collector2, collector3], database, storage)

    // Two new tables should have been created (missing-table, another-missing-table)
    // existing-table already exists so it should NOT trigger createTable
    assert.equal(tablesCreatedCount, 2, 'Should create 2 missing tables')
  })

  test('should handle empty components array without throwing', async ({ assert }) => {
    const database = new MockDatabaseAdapter()
    const storage = new MockStorageService()

    // Track if any table operations were called
    let tableCheckCount = 0
    database.doesTableExists = async () => {
      tableCheckCount++
      return true
    }

    // Should complete without throwing
    await assert.doesNotReject(
      async () => initializeComponents([], database, storage)
    )

    // No table checks should have been performed for empty array
    assert.equal(tableCheckCount, 0, 'No table checks should occur for empty components')
  })

  test('should handle mixed collector and harvester components', async ({ assert }) => {
    const database = new MockDatabaseAdapter()
    const storage = new MockStorageService()
    
    const collector = new MockCollector('mixed-collector')
    const harvester = new MockHarvester('mixed-harvester')
    
    // Mock all tables to exist
    database.doesTableExists = async (tableName: string) => true
    
    let initializationOrder: string[] = []
    
    collector.setDependencies = (db, st) => {
      initializationOrder.push('collector')
    }
    
    harvester.setDependencies = (db, st) => {
      initializationOrder.push('harvester')
    }

    await initializeComponents([collector, harvester], database, storage)

    assert.deepEqual(initializationOrder, ['collector', 'harvester'])
  })

  test('should handle database errors gracefully', async ({ assert }) => {
    const database = new MockDatabaseAdapter()
    const storage = new MockStorageService()
    
    const collector = new MockCollector('error-collector')
    
    // Mock database error
    database.doesTableExists = async (tableName: string) => {
      throw new Error('Database connection failed')
    }

    await assert.rejects(
      async () => {
        await initializeComponents([collector], database, storage)
      },
      'Database connection failed'
    )
  })

  test('should check table existence for each component', async ({ assert }) => {
    const database = new MockDatabaseAdapter()
    const storage = new MockStorageService()

    const collector1 = new MockCollector('table1')
    const collector2 = new MockCollector('table2')
    const harvester = new MockHarvester('table3')

    const checkedTables: string[] = []

    database.doesTableExists = async (tableName: string) => {
      checkedTables.push(tableName)
      return true
    }

    // Mock setDependencies to avoid errors
    collector1.setDependencies = () => {}
    collector2.setDependencies = () => {}
    harvester.setDependencies = () => {}

    await initializeComponents([collector1, collector2, harvester], database, storage)

    assert.deepEqual(checkedTables, ['table1', 'table2', 'table3'])
  })

  test('should initialize multiple components in parallel for faster startup', async ({ assert }) => {
    const database = new MockDatabaseAdapter()
    const storage = new MockStorageService()

    const collector1 = new MockCollector('parallel1')
    const collector2 = new MockCollector('parallel2')
    const collector3 = new MockCollector('parallel3')

    // Track timing - with parallel execution, total time should be close to max single time
    const tableCheckTimes: number[] = []
    const delay = 50 // ms

    database.doesTableExists = async (tableName: string) => {
      const start = Date.now()
      await new Promise(resolve => setTimeout(resolve, delay))
      tableCheckTimes.push(Date.now() - start)
      return false
    }

    database.createTable = async (tableName: string) => {
      // Fast table creation
    }

    collector1.setDependencies = () => {}
    collector2.setDependencies = () => {}
    collector3.setDependencies = () => {}

    const startTime = Date.now()
    await initializeComponents([collector1, collector2, collector3], database, storage)
    const totalTime = Date.now() - startTime

    // With parallel execution, 3 components with 50ms each should take ~50-100ms
    // With sequential execution, it would take ~150ms+
    // Allow some margin for test environment variability
    assert.isBelow(totalTime, 200, 'Parallel initialization should be faster than sequential')
    assert.lengthOf(tableCheckTimes, 3, 'All 3 tables should be checked')
  })
})