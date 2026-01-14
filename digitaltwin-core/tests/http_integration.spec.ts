import { test } from '@japa/runner'
import { RedisContainer } from '@testcontainers/redis'
import { DigitalTwinEngine } from '../src/engine/digital_twin_engine.js'
import { Collector } from '../src/components/collector.js'
import { Handler } from '../src/components/handler.js'
import { MockDatabaseAdapter } from './mocks/mock_database_adapter.js'
import { MockStorageService } from './mocks/mock_storage_service.js'
import type { CollectorConfiguration, ComponentConfiguration, DataResponse } from '../src/components/types.js'
import { LogLevel } from '../src/utils/logger.js'

// Test collector qui simule des données de température
class WeatherCollector extends Collector {
  private currentTemp: number = 25

  async collect(): Promise<Buffer> {
    // Simuler une fluctuation de température
    this.currentTemp += (Math.random() - 0.5) * 2
    
    const weatherData = {
      temperature: parseFloat(this.currentTemp.toFixed(1)),
      humidity: Math.floor(Math.random() * 40) + 40,
      pressure: Math.floor(Math.random() * 50) + 1000,
      location: 'Paris',
      timestamp: new Date().toISOString(),
      status: 'active'
    }

    return Buffer.from(JSON.stringify(weatherData))
  }

  getConfiguration(): CollectorConfiguration {
    return {
      name: 'weather-collector',
      description: 'Weather data collector',
      contentType: 'application/json',
      endpoint: 'weather/current'
    }
  }

  getSchedule(): string {
    return '*/5 * * * * *' // Toutes les 5 secondes
  }
}

// Test handler qui expose des infos système
class SystemHandler extends Handler {
  async getSystemInfo(): Promise<DataResponse> {
    const systemInfo = {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      timestamp: new Date().toISOString(),
      status: 'healthy',
      version: '1.0.0'
    }

    return {
      status: 200,
      content: Buffer.from(JSON.stringify(systemInfo)),
      headers: { 'Content-Type': 'application/json' }
    }
  }

  getConfiguration(): ComponentConfiguration {
    return {
      name: 'system-handler',
      description: 'System information handler',
      contentType: 'application/json'
    }
  }

  getEndpoints() {
    return [{
      method: 'get' as const,
      path: '/system/info',
      handler: this.getSystemInfo.bind(this)
    }]
  }
}

test('HTTP Integration - Real endpoints via GET requests', async ({ assert }) => {
  const redisContainer = await new RedisContainer('redis:7-alpine').start()
  
  try {
    const redisHost = redisContainer.getHost()
    const redisPort = redisContainer.getMappedPort(6379)
    
    const storage = new MockStorageService()
    const database = new MockDatabaseAdapter({ storage })
    const weatherCollector = new WeatherCollector()
    const systemHandler = new SystemHandler()

    // Créer l'engine avec les composants et Redis
    const engine = new DigitalTwinEngine({
      collectors: [weatherCollector],
      handlers: [systemHandler],
      database,
      storage,
      redis: {
        host: redisHost,
        port: redisPort
      },
      logging: { level: LogLevel.SILENT },
      server: { port: 3001 }, // Port fixe pour le test
      queues: {
        multiQueue: true
      }
    })

    await engine.start()
    
    // Attendre que le serveur soit complètement démarré
    await new Promise(resolve => setTimeout(resolve, 1000))
    
    try {
      // Utiliser le port fixe configuré
      const serverPort = 3001
      
      // Attendre que le collector collecte des données (au moins une fois)
      await new Promise(resolve => setTimeout(resolve, 6000))
      
      // Utiliser le fetch natif de Node.js 18+
      
      // Test 1: Endpoint du collector - Weather data
      const weatherResponse = await fetch(`http://localhost:${serverPort}/weather/current`)
      
      assert.equal(weatherResponse.status, 200, 'Weather endpoint should return 200')
      assert.equal(weatherResponse.headers.get('content-type'), 'application/json', 'Should return JSON')
      
      const weatherData = await weatherResponse.json() as any
      assert.property(weatherData, 'temperature', 'Should have temperature')
      assert.property(weatherData, 'humidity', 'Should have humidity')
      assert.property(weatherData, 'pressure', 'Should have pressure')
      assert.property(weatherData, 'location', 'Should have location')
      assert.property(weatherData, 'timestamp', 'Should have timestamp')
      assert.property(weatherData, 'status', 'Should have status')
      assert.equal(weatherData.location, 'Paris', 'Location should be Paris')
      assert.equal(weatherData.status, 'active', 'Status should be active')
      assert.isNumber(weatherData.temperature, 'Temperature should be a number')
      assert.isNumber(weatherData.humidity, 'Humidity should be a number')
      assert.isNumber(weatherData.pressure, 'Pressure should be a number')
      assert.isString(weatherData.timestamp, 'Timestamp should be a string')
      
      // Test 2: Endpoint du handler - System info
      const systemResponse = await fetch(`http://localhost:${serverPort}/system/info`)
      
      assert.equal(systemResponse.status, 200, 'System endpoint should return 200')
      
      const systemData = await systemResponse.json() as any
      assert.property(systemData, 'uptime', 'Should have uptime')
      assert.property(systemData, 'memory', 'Should have memory info')
      assert.property(systemData, 'status', 'Should have status')
      assert.equal(systemData.status, 'healthy', 'Status should be healthy')
      
      // Test 3: Endpoint des stats de queues
      const queueStatsResponse = await fetch(`http://localhost:${serverPort}/api/queues/stats`)
      
      assert.equal(queueStatsResponse.status, 200, 'Queue stats should return 200')
      
      const queueStats = await queueStatsResponse.json()
      assert.property(queueStats, 'collectors', 'Should have collectors stats')
      
      // Test 4: Endpoint inexistant - 404
      const notFoundResponse = await fetch(`http://localhost:${serverPort}/nonexistent`)
      
      assert.equal(notFoundResponse.status, 404, 'Non-existent endpoint should return 404')
      
    } catch (error) {
      throw error
    } finally {
      // Graceful stop with proper timeout
      try {
        await Promise.race([
          engine.stop(),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Engine stop timeout')), 5000)
          )
        ])
      } catch (error) {
        // Ignore shutdown errors
      }
      
      // Wait for all Redis connections to properly close
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
    
  } finally {
    await redisContainer.stop()
  }
}).timeout(60000)