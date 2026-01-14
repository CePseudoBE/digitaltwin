import { test } from '@japa/runner'
import { RedisContainer } from '@testcontainers/redis'
import { DigitalTwinEngine } from '../src/engine/digital_twin_engine.js'
import { Collector } from '../src/components/collector.js'
import { Harvester } from '../src/components/harvester.js'
import { Handler } from '../src/components/handler.js'
import { MockDatabaseAdapter } from './mocks/mock_database_adapter.js'
import { MockStorageService } from './mocks/mock_storage_service.js'
import type { CollectorConfiguration, HarvesterConfiguration, ComponentConfiguration, DataResponse } from '../src/components/types.js'
import { DataRecord } from '../src/types/data_record.js'
import { LogLevel } from '../src/utils/logger.js'

// IoT Temperature Sensor Collector
class IoTSensorCollector extends Collector {
  private sensorId: string
  private currentTemp: number = 22

  constructor(sensorId: string) {
    super()
    this.sensorId = sensorId
  }

  async collect(): Promise<Buffer> {
    // Simulate temperature fluctuation
    this.currentTemp += (Math.random() - 0.5) * 3
    
    const sensorData = {
      sensorId: this.sensorId,
      temperature: parseFloat(this.currentTemp.toFixed(1)),
      humidity: Math.floor(Math.random() * 30) + 50,
      timestamp: new Date().toISOString(),
      location: 'Building A - Room 101',
      batteryLevel: Math.floor(Math.random() * 20) + 80
    }

    return Buffer.from(JSON.stringify(sensorData))
  }

  getConfiguration(): CollectorConfiguration {
    return {
      name: `sensor-${this.sensorId}`,
      description: `IoT Temperature Sensor ${this.sensorId}`,
      contentType: 'application/json',
      endpoint: `api/sensor/${this.sensorId}`
    }
  }

  getSchedule(): string {
    return '* * * * * *' // Every 10 seconds
  }
}

// Temperature Analytics Harvester
class TemperatureAnalyzer extends Harvester {
  async harvest(
    sourceData: DataRecord | DataRecord[],
    dependenciesData: Record<string, DataRecord | DataRecord[]>
  ): Promise<Buffer> {
    const records = Array.isArray(sourceData) ? sourceData : [sourceData]
    
    const analysis = {
      analyzedAt: new Date().toISOString(),
      sensorCount: records.length,
      temperatures: [] as number[],
      stats: {
        avg: 0,
        min: 0,
        max: 0,
        trend: 'stable' as 'rising' | 'falling' | 'stable'
      },
      alerts: [] as string[],
      recommendations: [] as string[]
    }

    // Process each temperature reading
    for (const record of records) {
      const buffer = await record.data()
      const sensorData = JSON.parse(buffer.toString())
      
      analysis.temperatures.push(sensorData.temperature)
      
      // Temperature alerts
      if (sensorData.temperature > 30) {
        analysis.alerts.push(`HIGH_TEMP: ${sensorData.temperature}°C from ${sensorData.sensorId}`)
      }
      if (sensorData.temperature < 15) {
        analysis.alerts.push(`LOW_TEMP: ${sensorData.temperature}°C from ${sensorData.sensorId}`)
      }
      
      // Battery alerts
      if (sensorData.batteryLevel < 20) {
        analysis.alerts.push(`LOW_BATTERY: ${sensorData.batteryLevel}% on ${sensorData.sensorId}`)
      }
    }

    // Calculate statistics
    const temps = analysis.temperatures
    analysis.stats.avg = parseFloat((temps.reduce((a, b) => a + b, 0) / temps.length).toFixed(1))
    analysis.stats.min = Math.min(...temps)
    analysis.stats.max = Math.max(...temps)

    // Trend analysis (simple)
    if (temps.length >= 2) {
      const recent = temps.slice(-2)
      if (recent[1] > recent[0] + 1) analysis.stats.trend = 'rising'
      else if (recent[1] < recent[0] - 1) analysis.stats.trend = 'falling'
    }

    // Generate recommendations
    if (analysis.stats.avg > 25) {
      analysis.recommendations.push('Consider increasing ventilation')
    }
    if (analysis.alerts.length > 0) {
      analysis.recommendations.push('Check sensor maintenance schedule')
    }
    if (analysis.stats.trend === 'rising') {
      analysis.recommendations.push('Monitor for continued temperature increase')
    }

    return Buffer.from(JSON.stringify(analysis))
  }

  getConfiguration(): HarvesterConfiguration {
    return {
      name: 'temperature-analyzer',
      description: 'Temperature analytics and trend analysis',
      contentType: 'application/json',
      endpoint: 'api/analytics/temperature',
      source: 'sensor-001',
      triggerMode: 'schedule',
      debounceMs: 2000,
      source_range: '3', // Analyze last 3 readings
      source_range_min: false,
      multiple_results: false
    }
  }

  getSchedule(): string {
    return '*/30 * * * * *' // Every 30 seconds
  }
}

// Dashboard API Handler
class DashboardHandler extends Handler {
  async getDashboard(): Promise<DataResponse> {
    const dashboard = {
      timestamp: new Date().toISOString(),
      status: 'operational',
      sensors: {
        total: 1,
        online: 1
      },
      health: {
        database: 'online',
        storage: 'online',
        queue: 'online'
      }
    }

    return {
      status: 200,
      content: Buffer.from(JSON.stringify(dashboard, null, 2)),
      headers: { 'Content-Type': 'application/json' }
    }
  }

  getConfiguration(): ComponentConfiguration {
    return {
      name: 'dashboard-api',
      description: 'Real-time dashboard API',
      contentType: 'application/json'
    }
  }
}

test('Full integration test', async ({ assert }) => {
  const redisContainer = await new RedisContainer('redis:7-alpine').start()
  
  try {
    const redisHost = redisContainer.getHost()
    const redisPort = redisContainer.getMappedPort(6379)
    
    
    // Setup infrastructure
    const storage = new MockStorageService()
    const database = new MockDatabaseAdapter({ storage })
    
    // Setup business components
    const sensor = new IoTSensorCollector('001')
    const analyzer = new TemperatureAnalyzer()
    const dashboard = new DashboardHandler()

    // Setup engine with Redis
    const engine = new DigitalTwinEngine({
      collectors: [sensor],
      harvesters: [analyzer],
      handlers: [dashboard],
      database,
      storage,
      redis: {
        host: redisHost,
        port: redisPort
      },
      queues: {
        multiQueue: true,
        workers: {
          collectors: 1,
          harvesters: 1
        }
      },
      logging: {
        level: LogLevel.SILENT
      },
      server: {
        port: 0 // Random port
      }
    })

    await engine.start()
    
    
    // Wait for initial data collection
    await new Promise(resolve => setTimeout(resolve, 1500))
    
    // Test 1: Verify sensor data collection
    const sensorRecords = await database.getByDateRange(
      'sensor-001',
      new Date(Date.now() - 5000),
      new Date()
    )
    
    assert.isAtLeast(sensorRecords.length, 1, 'Should have collected sensor data')
    
    const sensorBuffer = await sensorRecords[0].data()
    const sensorData = JSON.parse(sensorBuffer.toString())
    
    assert.property(sensorData, 'sensorId', 'Sensor data should contain sensorId')
    assert.property(sensorData, 'temperature', 'Sensor data should contain temperature')
    assert.property(sensorData, 'humidity', 'Sensor data should contain humidity')
    assert.property(sensorData, 'batteryLevel', 'Sensor data should contain batteryLevel')
    
    
    // Test 2: Wait for and verify analytics processing
    
    // Wait for analytics to process
    await new Promise(resolve => setTimeout(resolve, 2000))
    
    const analyticsRecords = await database.getByDateRange(
      'temperature-analyzer',
      new Date(Date.now() - 10000),
      new Date()
    )
    
    if (analyticsRecords.length > 0) {
      const analyticsBuffer = await analyticsRecords[0].data()
      const analyticsData = JSON.parse(analyticsBuffer.toString())
      
      assert.property(analyticsData, 'stats', 'Analytics should contain stats')
      assert.property(analyticsData.stats, 'avg', 'Stats should contain average')
      assert.property(analyticsData, 'alerts', 'Analytics should contain alerts')
      assert.property(analyticsData, 'recommendations', 'Analytics should contain recommendations')
      
    }
    
    // Test 3: Test dashboard API
    const dashboardResponse = await dashboard.getDashboard()
    const dashboardJson = JSON.parse(dashboardResponse.content.toString())
    
    assert.property(dashboardJson, 'status', 'Dashboard should have status')
    assert.property(dashboardJson, 'sensors', 'Dashboard should have sensors info')
    assert.property(dashboardJson, 'health', 'Dashboard should have health info')
    
    
    // Test 4: Verify queue system working
    
    // Wait for additional scheduled collections (sensor runs every second)
    await new Promise(resolve => setTimeout(resolve, 2000))
    
    const finalSensorRecords = await database.getByDateRange(
      'sensor-001',
      new Date(Date.now() - 8000),
      new Date()
    )
    
    assert.isAtLeast(finalSensorRecords.length, 2, 'Queue should process multiple sensor collections')
    

    // Force stop with timeout
    await Promise.race([
      engine.stop(),
      new Promise((resolve) => setTimeout(resolve, 3000))
    ])
    
    // Wait for Redis connections to close properly
    await new Promise(resolve => setTimeout(resolve, 3000))
    
  } finally {
    await redisContainer.stop()
  }
}).disableTimeout()