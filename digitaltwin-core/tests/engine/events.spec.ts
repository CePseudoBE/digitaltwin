import { test } from '@japa/runner'
import { EngineEventBus, ComponentEvent, engineEventBus } from '../../src/engine/events.js'

test.group('EngineEventBus', () => {
  test('should create a new instance', ({ assert }) => {
    const eventBus = new EngineEventBus()
    assert.instanceOf(eventBus, EngineEventBus)
  })

  test('should emit and receive collector:completed events', ({ assert }) => {
    const eventBus = new EngineEventBus()
    let receivedEvent: ComponentEvent | null = null

    eventBus.on('component:event', (event) => {
      receivedEvent = event
    })

    const testEvent: ComponentEvent = {
      type: 'collector:completed',
      componentName: 'test-collector',
      timestamp: new Date(),
      data: { success: true }
    }

    const result = eventBus.emit('component:event', testEvent)

    assert.isTrue(result)
    assert.deepEqual(receivedEvent, testEvent)
  })

  test('should emit and receive harvester:completed events', ({ assert }) => {
    const eventBus = new EngineEventBus()
    let receivedEvent: ComponentEvent | null = null

    eventBus.on('component:event', (event) => {
      receivedEvent = event
    })

    const testEvent: ComponentEvent = {
      type: 'harvester:completed',
      componentName: 'test-harvester',
      timestamp: new Date(),
      data: { processed: 10 }
    }

    const result = eventBus.emit('component:event', testEvent)

    assert.isTrue(result)
    assert.deepEqual(receivedEvent, testEvent)
  })

  test('should handle multiple listeners', ({ assert }) => {
    const eventBus = new EngineEventBus()
    const receivedEvents: ComponentEvent[] = []

    eventBus.on('component:event', (event) => {
      receivedEvents.push(event)
    })

    eventBus.on('component:event', (event) => {
      receivedEvents.push(event)
    })

    const testEvent: ComponentEvent = {
      type: 'collector:completed',
      componentName: 'multi-listener-test',
      timestamp: new Date()
    }

    eventBus.emit('component:event', testEvent)

    assert.lengthOf(receivedEvents, 2)
    assert.deepEqual(receivedEvents[0], testEvent)
    assert.deepEqual(receivedEvents[1], testEvent)
  })

  test('should handle events without data', ({ assert }) => {
    const eventBus = new EngineEventBus()
    let receivedEvent: ComponentEvent | null = null

    eventBus.on('component:event', (event) => {
      receivedEvent = event
    })

    const testEvent: ComponentEvent = {
      type: 'collector:completed',
      componentName: 'no-data-test',
      timestamp: new Date()
    }

    eventBus.emit('component:event', testEvent)

    assert.deepEqual(receivedEvent, testEvent)
    assert.isUndefined(receivedEvent!.data)
  })

  test('should return false when no listeners', ({ assert }) => {
    const eventBus = new EngineEventBus()
    
    const testEvent: ComponentEvent = {
      type: 'collector:completed',
      componentName: 'no-listeners',
      timestamp: new Date()
    }

    const result = eventBus.emit('component:event', testEvent)

    assert.isFalse(result)
  })
})

test.group('Global engineEventBus', () => {
  test('should provide a singleton instance', ({ assert }) => {
    assert.instanceOf(engineEventBus, EngineEventBus)
  })

  test('should be the same instance across imports', async ({ assert }) => {
    const { engineEventBus: secondImport } = await import('../../src/engine/events.js')
    assert.strictEqual(engineEventBus, secondImport)
  })

  test('should work with global event bus', ({ assert }) => {
    let receivedEvent: ComponentEvent | null = null

    const listener = (event: ComponentEvent) => {
      receivedEvent = event
    }

    engineEventBus.on('test:event', listener)

    const testEvent: ComponentEvent = {
      type: 'harvester:completed',
      componentName: 'global-bus-test',
      timestamp: new Date(),
      data: { global: true }
    }

    engineEventBus.emit('test:event', testEvent)

    assert.deepEqual(receivedEvent, testEvent)

    // Clean up
    engineEventBus.removeListener('test:event', listener)
  })
})