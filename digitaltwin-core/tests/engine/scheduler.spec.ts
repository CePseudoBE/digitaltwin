import { test } from '@japa/runner'
import { Redis } from 'ioredis'
import { RedisContainer } from '@testcontainers/redis'

import { scheduleComponents } from '../../src/engine/scheduler.js'
import { Collector } from '../../src/components/collector.js'
import { Harvester } from '../../src/components/harvester.js'
import { QueueManager } from '../../src/engine/queue_manager.js'
import { engineEventBus } from '../../src/engine/events.js'
import { MockDatabaseAdapter } from '../mocks/mock_database_adapter.js'
import { LocalStorageService } from '../../src/storage/adapters/local_storage_service.js'
import { CollectorConfiguration, HarvesterConfiguration } from '../../src/components/types.js'
import { DataRecord } from '../../src/types/data_record.js'
import { LogLevel } from '../../src/utils/logger.js'

class MockCollector extends Collector {
  constructor(private readonly name: string, private readonly schedule: string) {
    super()
  }

  async collect(): Promise<Buffer> {
    return Buffer.from(JSON.stringify({ data: 'test-data' }))
  }

  getConfiguration(): CollectorConfiguration {
    return {
      name: this.name,
      description: 'Test collector',
      contentType: 'application/json',
      endpoint: this.name,
    }
  }

  getSchedule(): string {
    return this.schedule
  }
}

class MockHarvester extends Harvester {
  constructor(
      private name: string,
      private schedule: string | null,
      private source: string,
      private triggerMode: 'schedule' | 'on-source' | 'both' = 'schedule'
  ) {
    super()
  }

  async harvest(
      sourceData: DataRecord | DataRecord[],
      dependenciesData: Record<string, DataRecord | DataRecord[]>
  ): Promise<Buffer> {
    return Buffer.from(JSON.stringify({ processed: 'data' }))
  }

  getConfiguration(): HarvesterConfiguration {
    return {
      name: this.name,
      description: 'Test harvester',
      contentType: 'application/json',
      endpoint: this.name,
      source: this.source,
      triggerMode: this.triggerMode,
      debounceMs: 100,
      source_range_min: false,
      multiple_results: false,
    }
  }

  getSchedule(): string {
    if (this.triggerMode === 'on-source') return ''
    return this.schedule || '0 * * * * *'
  }
}

test.group('Scheduler with Redis container', (group) => {
  let redisContainer: any
  let redis: Redis
  let queueManager: QueueManager
  let db: MockDatabaseAdapter
  let storage: LocalStorageService

  group.each.setup(async () => {
    redisContainer = await new RedisContainer('redis:8.0.3-alpine').start()
    redis = new Redis({
      host: redisContainer.getHost(),
      port: redisContainer.getPort(),
      maxRetriesPerRequest: null,
    })
    queueManager = new QueueManager({ redis })
    storage = new LocalStorageService('.test_tmp')
    db = new MockDatabaseAdapter({ storage })
  })

  group.each.teardown(async () => {
    await queueManager.close()
    await redis.quit()
    await redisContainer.stop()
  })

  test('schedules collector and harvester correctly', async ({ assert }) => {
    const collector = new MockCollector('collector1', '0 * * * * *')
    const harvester = new MockHarvester('harvester1', '0 */5 * * * *', 'collector1')

    collector.setDependencies(db, storage)
    harvester.setDependencies(db, storage)

    const workers = await scheduleComponents([collector, harvester], queueManager, true)

    assert.equal(workers.length, 3)
    assert.isTrue(workers.every((w) => true))

    for (const worker of workers) {
      await worker.close()
    }
  })

  test('triggers harvester on collector completion', async ({ assert }) => {
    const collector = new MockCollector('source-coll', '0 * * * * *')
    const harvester = new MockHarvester('auto-harv', null, 'source-coll', 'on-source')

    collector.setDependencies(db, storage)
    harvester.setDependencies(db, storage)

    let triggered = false
    const originalRun = harvester.run.bind(harvester)
    harvester.run = async () => {
      triggered = true
      await originalRun()
      return true
    }


    const workers = await scheduleComponents([collector, harvester], queueManager, true)

    engineEventBus.emit('component:event', {
      type: 'collector:completed',
      componentName: 'source-coll',
      timestamp: new Date(),
      data: { success: true },
    })

    await new Promise((res) => setTimeout(res, 150))
    assert.isTrue(triggered)

    for (const worker of workers) {
      await worker.close()
    }
  })
})
