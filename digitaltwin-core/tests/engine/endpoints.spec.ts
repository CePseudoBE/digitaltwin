import { test } from '@japa/runner'
import { exposeEndpoints, HttpMethod } from '../../src/engine/endpoints.js'
import { Collector } from '../../src/components/collector.js'
import { Harvester } from '../../src/components/harvester.js'
import { Handler } from '../../src/components/handler.js'
import { CollectorConfiguration, HarvesterConfiguration, ComponentConfiguration } from '../../src/components/types.js'
import { DataRecord } from '../../src/types/data_record.js'

// Mock router for testing
class MockRouter {
  public routes: Array<{
    method: string
    path: string
    handler: Function
  }> = []

  get(path: string, handler: Function) {
    this.routes.push({ method: 'get', path, handler })
  }

  post(path: string, handler: Function) {
    this.routes.push({ method: 'post', path, handler })
  }

  put(path: string, handler: Function) {
    this.routes.push({ method: 'put', path, handler })
  }

  delete(path: string, handler: Function) {
    this.routes.push({ method: 'delete', path, handler })
  }

  patch(path: string, handler: Function) {
    this.routes.push({ method: 'patch', path, handler })
  }

  // Mock an unsupported method - we intentionally don't implement this
}

// Mock request and response
class MockRequest {
  constructor(public params: any = {}, public body: any = {}) {}
}

class MockResponse {
  private _status: number = 200
  private _headers: Record<string, string> = {}
  public sentContent: any = null

  status(code: number) {
    this._status = code
    return this
  }

  header(headers: Record<string, string>) {
    this._headers = { ...this._headers, ...headers }
    return this
  }

  send(content: any) {
    this.sentContent = content
    return this
  }

  getStatus() { return this._status }
  getHeaders() { return this._headers }
}

class MockCollector extends Collector {
  constructor(private name: string, private endpoints: any[] = []) {
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

  getEndpoints() {
    return this.endpoints
  }
}

class MockHarvester extends Harvester {
  constructor(private name: string, private endpoints: any[] = []) {
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

  getEndpoints() {
    return this.endpoints
  }
}

class MockHandler extends Handler {
  constructor(private name: string, private endpoints: any[] = []) {
    super()
  }

  getConfiguration(): ComponentConfiguration {
    return {
      name: this.name,
      description: 'Test handler',
      contentType: 'application/json',
    }
  }

  getEndpoints() {
    return this.endpoints
  }
}

test.group('exposeEndpoints', () => {
  test('should expose GET endpoints correctly', async ({ assert }) => {
    const router = new MockRouter()
    const collector = new MockCollector('test-collector', [
      {
        method: 'get',
        path: '/test',
        handler: async (params: any, body: any) => ({
          status: 200,
          content: 'Hello World'
        })
      }
    ])

    await exposeEndpoints(router as any, [collector])

    assert.lengthOf(router.routes, 1)
    assert.equal(router.routes[0].method, 'get')
    assert.equal(router.routes[0].path, '/test')
  })

  test('should expose POST endpoints correctly', async ({ assert }) => {
    const router = new MockRouter()
    const harvester = new MockHarvester('test-harvester', [
      {
        method: 'post',
        path: '/harvest',
        handler: async (params: any, body: any) => ({
          status: 201,
          content: { success: true }
        })
      }
    ])

    await exposeEndpoints(router as any, [harvester])

    assert.lengthOf(router.routes, 1)
    assert.equal(router.routes[0].method, 'post')
    assert.equal(router.routes[0].path, '/harvest')
  })

  test('should expose multiple endpoints from single component', async ({ assert }) => {
    const router = new MockRouter()
    const handler = new MockHandler('multi-endpoint', [
      {
        method: 'get',
        path: '/info',
        handler: async () => ({ status: 200, content: 'info' })
      },
      {
        method: 'post',
        path: '/action',
        handler: async () => ({ status: 201, content: 'created' })
      }
    ])

    await exposeEndpoints(router as any, [handler])

    assert.lengthOf(router.routes, 2)
    assert.equal(router.routes[0].method, 'get')
    assert.equal(router.routes[0].path, '/info')
    assert.equal(router.routes[1].method, 'post')
    assert.equal(router.routes[1].path, '/action')
  })

  test('should expose endpoints from multiple components', async ({ assert }) => {
    const router = new MockRouter()
    const collector = new MockCollector('collector', [
      {
        method: 'get',
        path: '/collect',
        handler: async () => ({ status: 200, content: 'collected' })
      }
    ])
    const harvester = new MockHarvester('harvester', [
      {
        method: 'post',
        path: '/process',
        handler: async () => ({ status: 200, content: 'processed' })
      }
    ])

    await exposeEndpoints(router as any, [collector, harvester])

    assert.lengthOf(router.routes, 2)
    assert.equal(router.routes[0].method, 'get')
    assert.equal(router.routes[0].path, '/collect')
    assert.equal(router.routes[1].method, 'post')
    assert.equal(router.routes[1].path, '/process')
  })

  test('should handle case-insensitive HTTP methods', async ({ assert }) => {
    const router = new MockRouter()
    const collector = new MockCollector('case-test', [
      {
        method: 'GET' as HttpMethod,
        path: '/uppercase',
        handler: async () => ({ status: 200, content: 'ok' })
      }
    ])

    await exposeEndpoints(router as any, [collector])

    assert.lengthOf(router.routes, 1)
    assert.equal(router.routes[0].method, 'get')
  })

  test('should handle all supported HTTP methods', async ({ assert }) => {
    const router = new MockRouter()
    const handler = new MockHandler('all-methods', [
      {
        method: 'get',
        path: '/get',
        handler: async () => ({ status: 200, content: 'get' })
      },
      {
        method: 'post',
        path: '/post',
        handler: async () => ({ status: 201, content: 'post' })
      },
      {
        method: 'put',
        path: '/put',
        handler: async () => ({ status: 200, content: 'put' })
      },
      {
        method: 'delete',
        path: '/delete',
        handler: async () => ({ status: 204, content: '' })
      },
      {
        method: 'patch',
        path: '/patch',
        handler: async () => ({ status: 200, content: 'patch' })
      }
    ])

    await exposeEndpoints(router as any, [handler])

    assert.lengthOf(router.routes, 5)
    const methods = router.routes.map(r => r.method)
    assert.includeMembers(methods, ['get', 'post', 'put', 'delete', 'patch'])
  })

  test('should throw error for unsupported HTTP method', async ({ assert }) => {
    const router = new MockRouter()
    const handler = new MockHandler('unsupported', [
      {
        method: 'unsupported' as HttpMethod,
        path: '/test',
        handler: async () => ({ status: 200, content: 'test' })
      }
    ])

    await assert.rejects(
      async () => {
        await exposeEndpoints(router as any, [handler])
      },
      'Unsupported HTTP method: unsupported'
    )
  })

  test('should handle empty servables array', async ({ assert }) => {
    const router = new MockRouter()

    await exposeEndpoints(router as any, [])

    assert.lengthOf(router.routes, 0)
  })

  test('should handle component with no endpoints', async ({ assert }) => {
    const router = new MockRouter()
    const collector = new MockCollector('no-endpoints', [])

    await exposeEndpoints(router as any, [collector])

    assert.lengthOf(router.routes, 0)
  })

  test('should pass request params and body to handler', async ({ assert }) => {
    const router = new MockRouter()
    let receivedReq: any = null

    const handler = new MockHandler('param-test', [
      {
        method: 'post',
        path: '/test/:id',
        handler: async (req: any) => {
          receivedReq = req
          return { status: 200, content: 'ok' }
        }
      }
    ])

    await exposeEndpoints(router as any, [handler])

    // Simulate request
    const req = new MockRequest({ id: '123' }, { name: 'test' })
    const res = new MockResponse()

    await router.routes[0].handler(req, res)

    // Handler receives full request object with params and body
    assert.deepEqual(receivedReq.params, { id: '123' })
    assert.deepEqual(receivedReq.body, { name: 'test' })
  })

  test('should set response status, headers, and content', async ({ assert }) => {
    const router = new MockRouter()
    const handler = new MockHandler('response-test', [
      {
        method: 'get',
        path: '/test',
        handler: async () => ({
          status: 201,
          headers: { 'X-Custom': 'value', 'Content-Type': 'application/json' },
          content: { success: true }
        })
      }
    ])

    await exposeEndpoints(router as any, [handler])

    // Simulate request
    const req = new MockRequest()
    const res = new MockResponse()
    
    await router.routes[0].handler(req, res)

    assert.equal(res.getStatus(), 201)
    assert.deepEqual(res.getHeaders(), { 'X-Custom': 'value', 'Content-Type': 'application/json' })
    assert.deepEqual(res.sentContent, { success: true })
  })

  test('should handle response without headers', async ({ assert }) => {
    const router = new MockRouter()
    const handler = new MockHandler('no-headers', [
      {
        method: 'get',
        path: '/test',
        handler: async () => ({
          status: 200,
          content: 'no headers'
        })
      }
    ])

    await exposeEndpoints(router as any, [handler])

    // Simulate request
    const req = new MockRequest()
    const res = new MockResponse()
    
    await router.routes[0].handler(req, res)

    assert.equal(res.getStatus(), 200)
    assert.deepEqual(res.getHeaders(), {})
    assert.equal(res.sentContent, 'no headers')
  })
})