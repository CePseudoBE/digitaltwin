import { test } from '@japa/runner'
import { AssetsManager } from '../../src/components/assets_manager.js'
import { MockDatabaseAdapter } from '../mocks/mock_database_adapter.js'
import { LocalStorageService } from '../../src/storage/adapters/local_storage_service.js'
import { AuthConfig, ApisixAuthParser } from '../../src/auth/index.js'
import type { AssetsManagerConfiguration } from '../../src/components/types.js'

class HeaderTestAssetsManager extends AssetsManager {
  getConfiguration(): AssetsManagerConfiguration {
    return {
      name: 'header-test',
      description: 'Header transmission test',
      contentType: 'application/json',
      extension: '.json',
      endpoint: 'header-test'
    }
  }

  // Expose a method to test header access
  async testHeaderAccess(req: any) {
    return {
      hasHeaders: !!req.headers,
      hasUserId: !!(req.headers && req.headers['x-user-id']),
      hasUserRoles: !!(req.headers && req.headers['x-user-roles']),
      userId: req.headers ? req.headers['x-user-id'] : undefined,
      userRoles: req.headers ? req.headers['x-user-roles'] : undefined,
      allHeaders: req.headers
    }
  }
}

test.group('Headers Transmission via ultimate-express', group => {
    // Some tests in this group require auth to be enabled
    group.setup(() => {
        delete process.env.DIGITALTWIN_DISABLE_AUTH
        AuthConfig._resetConfig()
        ApisixAuthParser._resetProvider()
    })

    group.teardown(() => {
        process.env.DIGITALTWIN_DISABLE_AUTH = 'true'
        AuthConfig._resetConfig()
        ApisixAuthParser._resetProvider()
    })

  test('AssetsManager should receive all headers from request object', async ({ assert }) => {
    const db = new MockDatabaseAdapter()
    const storage = new LocalStorageService('.test-headers')
    const assetsManager = new HeaderTestAssetsManager()
    assetsManager.setDependencies(db, storage)

    // Simulate request object as received by ultimate-express
    const mockRequest = {
      headers: {
        'host': 'apisix:9080',
        'x-real-ip': '172.18.0.2',
        'x-forwarded-for': '172.18.0.2',
        'x-user-id': '6e06a527-a89d-4390-95cd-10ae63cfc939',
        'x-user-roles': 'default-roles-master,offline_access,uma_authorization',
        'authorization': 'Bearer eyJhbGci...',
        'content-type': 'application/json'
      },
      body: {},
      params: {}
    }

    const result = await assetsManager.testHeaderAccess(mockRequest)

    assert.isTrue(result.hasHeaders, 'Request should have headers object')
    assert.isTrue(result.hasUserId, 'Should have x-user-id header')
    assert.isTrue(result.hasUserRoles, 'Should have x-user-roles header')
    assert.equal(result.userId, '6e06a527-a89d-4390-95cd-10ae63cfc939')
    assert.equal(result.userRoles, 'default-roles-master,offline_access,uma_authorization')
    assert.isDefined(result.allHeaders['authorization'])
  })

  test('AssetsManager should handle missing headers gracefully', async ({ assert }) => {
    const db = new MockDatabaseAdapter()
    const storage = new LocalStorageService('.test-headers-missing')
    const assetsManager = new HeaderTestAssetsManager()
    assetsManager.setDependencies(db, storage)

    // Request without APISIX headers (direct access, bypassing gateway)
    const mockRequest = {
      headers: {
        'host': 'localhost:3000',
        'content-type': 'application/json'
        // No x-user-id or x-user-roles
      },
      body: {},
      params: {}
    }

    const result = await assetsManager.testHeaderAccess(mockRequest)

    assert.isTrue(result.hasHeaders, 'Request should have headers object')
    assert.isFalse(result.hasUserId, 'Should not have x-user-id header')
    assert.isFalse(result.hasUserRoles, 'Should not have x-user-roles header')
    assert.isUndefined(result.userId)
    assert.isUndefined(result.userRoles)
  })

  test('AssetsManager should handle request without headers property', async ({ assert }) => {
    const db = new MockDatabaseAdapter()
    const storage = new LocalStorageService('.test-headers-none')
    const assetsManager = new HeaderTestAssetsManager()
    assetsManager.setDependencies(db, storage)

    // Malformed request object
    const mockRequest = {
      body: {},
      params: {}
      // No headers property at all
    }

    const result = await assetsManager.testHeaderAccess(mockRequest)

    assert.isFalse(result.hasHeaders, 'Request should not have headers object')
    assert.isFalse(result.hasUserId, 'Should not have x-user-id header')
    assert.isFalse(result.hasUserRoles, 'Should not have x-user-roles header')
  })

  test('Real AssetsManager handleUpload should access headers correctly', async ({ assert }) => {
    const db = new MockDatabaseAdapter()
    const storage = new LocalStorageService('.test-headers-real')
    const assetsManager = new HeaderTestAssetsManager()
    assetsManager.setDependencies(db, storage)

    // Test with proper APISIX headers
    const requestWithAuth = {
      headers: {
        'x-user-id': '12345-67890',
        'x-user-roles': 'user'
      },
      body: {
        description: 'Test file',
        source: 'https://example.com'
      },
      file: {
        path: '/tmp/test.json',
        originalname: 'test.json'
      }
    }

    // This should NOT return 401 (authentication required)
    const responseWithAuth = await assetsManager.handleUpload(requestWithAuth)
    assert.notEqual(responseWithAuth.status, 401, 'Should not fail authentication when headers are present')

    // Test without headers
    const requestWithoutAuth = {
      headers: {}, // No authentication headers
      body: {
        description: 'Test file',
        source: 'https://example.com'
      },
      file: {
        path: '/tmp/test.json',
        originalname: 'test.json'
      }
    }

    const responseWithoutAuth = await assetsManager.handleUpload(requestWithoutAuth)
    assert.equal(responseWithoutAuth.status, 401, 'Should fail authentication when headers are missing')
  })
})

test.group('Ultimate-Express Integration Simulation', (group) => {
  // This test requires auth to be enabled to properly test header parsing
  group.setup(() => {
    delete process.env.DIGITALTWIN_DISABLE_AUTH
    AuthConfig._resetConfig()
  })

  group.teardown(() => {
    process.env.DIGITALTWIN_DISABLE_AUTH = 'true'
    AuthConfig._resetConfig()
  })

  test('simulate complete flow from HTTP request to AssetsManager', async ({ assert }) => {
    // This simulates what ultimate-express does
    const incomingHttpHeaders = {
      'host': 'apisix:9080',
      'x-real-ip': '172.18.0.2',
      'x-forwarded-for': '172.18.0.2',
      'x-forwarded-proto': 'http',
      'authorization': 'Bearer eyJ...',
      'x-user-id': '6e06a527-a89d-4390-95cd-10ae63cfc939',
      'x-user-roles': 'default-roles-master,offline_access',
      'content-type': 'application/json'
    }

    // Ultimate-express creates request object like this
    const expressRequestObject = {
      headers: incomingHttpHeaders,
      body: { description: 'Test', source: 'https://example.com' },
      params: {},
      file: { path: '/tmp/test.json', originalname: 'test.json' }
    }

    // endpoints.ts passes this to handler: ep.handler(req)
    const db = new MockDatabaseAdapter()
    const storage = new LocalStorageService('.test-flow')
    const assetsManager = new HeaderTestAssetsManager()
    assetsManager.setDependencies(db, storage)

    // This is what happens inside the handler
    const result = await assetsManager.testHeaderAccess(expressRequestObject)

    // Verify all APISIX headers are available
    assert.equal(result.userId, '6e06a527-a89d-4390-95cd-10ae63cfc939')
    assert.equal(result.userRoles, 'default-roles-master,offline_access')
    assert.isDefined(result.allHeaders['x-real-ip'])
    assert.isDefined(result.allHeaders['authorization'])
    
    // Verify ApisixAuthParser can parse them
    const { ApisixAuthParser } = await import('../../src/auth/apisix_parser.js')
    const authUser = ApisixAuthParser.parseAuthHeaders(expressRequestObject.headers)
    
    assert.isNotNull(authUser)
    assert.equal(authUser!.id, '6e06a527-a89d-4390-95cd-10ae63cfc939')
    assert.deepEqual(authUser!.roles, ['default-roles-master', 'offline_access'])
  })
})