import { test } from '@japa/runner'
import { AssetsManager } from '../../src/components/assets_manager.js'
import { MockDatabaseAdapter } from '../mocks/mock_database_adapter.js'
import { LocalStorageService } from '../../src/storage/adapters/local_storage_service.js'
import { AuthConfig, ApisixAuthParser } from '../../src/auth/index.js'
import type { AssetsConfiguration, DataResponse } from '../../src/components/types.js'
import path from 'path'
import os from 'os'

class TestAssetsManager extends AssetsManager {
  getConfiguration(): AssetsConfiguration {
    return {
      name: 'test-assets',
      description: 'Test assets manager',
      contentType: 'application/octet-stream',
      extension: '.bin',
      endpoint: 'test-assets'
    }
  }
}

// Mock storage for testing - use temp directory
const tempDir = path.join(os.tmpdir(), 'digitaltwin-test-auth')
const mockStorage = new LocalStorageService(tempDir)

// Helper function to ensure auth is enabled for tests
function ensureAuthEnabled() {
    delete process.env.DIGITALTWIN_DISABLE_AUTH
    delete process.env.DIGITALTWIN_ANONYMOUS_USER_ID
    AuthConfig._resetConfig()
    ApisixAuthParser._resetProvider()
}

// Helper function to restore test environment (auth disabled)
function restoreTestEnv() {
    process.env.DIGITALTWIN_DISABLE_AUTH = 'true'
    AuthConfig._resetConfig()
    ApisixAuthParser._resetProvider()
}

test.group('AssetsManager Authentication', (group) => {
  // Restore auth disabled state after all tests in this group
  group.teardown(() => {
    restoreTestEnv()
  })

  test('handleUpload() should reject requests without authentication', async ({ assert }) => {
    // Ensure auth is enabled for this test
    delete process.env.DIGITALTWIN_DISABLE_AUTH
    delete process.env.DIGITALTWIN_ANONYMOUS_USER_ID
    AuthConfig._resetConfig()
    
    const db = new MockDatabaseAdapter()
    const assetsManager = new TestAssetsManager()
    assetsManager.setDependencies(db, mockStorage)

    const mockRequest = {
      headers: {}, // No authentication headers
      body: {
        description: 'Test file',
        source: 'https://example.com'
      },
      file: {
        path: '/tmp/test.bin',
        originalname: 'test.bin'
      }
    }

    const response: DataResponse = await assetsManager.handleUpload(mockRequest)

    assert.equal(response.status, 401)
    assert.include(JSON.parse(response.content.toString()).error, 'Authentication required')
  })

  test('handleUpload() should reject requests with invalid authentication', async ({ assert }) => {
    ensureAuthEnabled()
    
    const db = new MockDatabaseAdapter()
    const assetsManager = new TestAssetsManager()
    assetsManager.setDependencies(db, mockStorage)

    const mockRequest = {
      headers: {
        'x-user-roles': 'user' // Missing x-user-id
      },
      body: {
        description: 'Test file',
        source: 'https://example.com'
      },
      file: {
        path: '/tmp/test.bin',
        originalname: 'test.bin'
      }
    }

    const response: DataResponse = await assetsManager.handleUpload(mockRequest)

    assert.equal(response.status, 401)
    assert.include(JSON.parse(response.content.toString()).error, 'Authentication required')
  })

  test('handleUpdate() should reject requests without authentication', async ({ assert }) => {
    ensureAuthEnabled()
    
    const db = new MockDatabaseAdapter()
    const assetsManager = new TestAssetsManager()
    assetsManager.setDependencies(db, mockStorage)

    const mockRequest = {
      headers: {}, // No authentication headers
      params: { id: '1' },
      body: {
        description: 'Updated description'
      }
    }

    const response: DataResponse = await assetsManager.handleUpdate(mockRequest)

    assert.equal(response.status, 401)
    assert.include(JSON.parse(response.content.toString()).error, 'Authentication required')
  })

  test('handleUpdate() should reject when user tries to modify others assets', async ({ assert }) => {
    ensureAuthEnabled()

    const db = new MockDatabaseAdapter()

    // Mock an existing asset owned by user ID 999 (different from test user)
    const existingAsset = {
      id: 1,
      name: 'test-assets',
      contentType: 'application/octet-stream',
      url: 'test/asset.bin',
      date: new Date(),
      owner_id: 999, // Owned by a different user ID
      description: 'Original description',
      source: 'https://example.com',
      filename: 'asset.bin',
      data: async () => Buffer.from('test')
    }

    // Mock database to return the asset
    db.getById = async () => existingAsset

    const assetsManager = new TestAssetsManager()
    assetsManager.setDependencies(db, mockStorage)

    // Override getAssetById to return our mock asset
    assetsManager.getAssetById = async () => existingAsset

    const mockRequest = {
      headers: {
        'x-user-id': '12345-67890', // Different user (will get id=1 from UserService)
        'x-user-roles': 'user'
      },
      params: { id: '1' },
      body: {
        description: 'Trying to update someone elses asset'
      }
    }

    const response: DataResponse = await assetsManager.handleUpdate(mockRequest)

    assert.equal(response.status, 403)
    assert.include(JSON.parse(response.content.toString()).error, 'You can only modify your own assets')
  })

  test('handleDelete() should reject requests without authentication', async ({ assert }) => {
    ensureAuthEnabled()
    
    const db = new MockDatabaseAdapter()
    const assetsManager = new TestAssetsManager()
    assetsManager.setDependencies(db, mockStorage)

    const mockRequest = {
      headers: {}, // No authentication headers
      params: { id: '1' }
    }

    const response: DataResponse = await assetsManager.handleDelete(mockRequest)

    assert.equal(response.status, 401)
    assert.include(JSON.parse(response.content.toString()).error, 'Authentication required')
  })

  test('handleDelete() should reject when user tries to delete others assets', async ({ assert }) => {
    ensureAuthEnabled()

    const db = new MockDatabaseAdapter()

    // Mock an existing asset owned by user ID 999 (different from test user)
    const existingAsset = {
      id: 1,
      name: 'test-assets',
      contentType: 'application/octet-stream',
      url: 'test/asset.bin',
      date: new Date(),
      owner_id: 999, // Owned by a different user ID
      description: 'Test asset',
      source: 'https://example.com',
      filename: 'asset.bin',
      data: async () => Buffer.from('test')
    }

    const assetsManager = new TestAssetsManager()
    assetsManager.setDependencies(db, mockStorage)

    // Override getAssetById to return our mock asset
    assetsManager.getAssetById = async () => existingAsset

    const mockRequest = {
      headers: {
        'x-user-id': '12345-67890', // Different user (will get id=1 from UserService)
        'x-user-roles': 'user'
      },
      params: { id: '1' }
    }

    const response: DataResponse = await assetsManager.handleDelete(mockRequest)

    assert.equal(response.status, 403)
    assert.include(JSON.parse(response.content.toString()).error, 'You can only modify your own assets')
  })

  test('handleUpload() should validate required fields even with auth', async ({ assert }) => {
    ensureAuthEnabled()
    
    const db = new MockDatabaseAdapter()
    const assetsManager = new TestAssetsManager()
    assetsManager.setDependencies(db, mockStorage)

    const mockRequest = {
      headers: {
        'x-user-id': '12345-67890',
        'x-user-roles': 'user'
      },
      body: {
        // Missing required fields: description, source
      },
      file: {
        path: '/tmp/test.bin',
        originalname: 'test.bin'
      }
    }

    const response: DataResponse = await assetsManager.handleUpload(mockRequest)

    assert.equal(response.status, 400)
    assert.include(JSON.parse(response.content.toString()).error, 'Missing required fields')
  })

  test('handleUpdate() should return 404 for non-existent assets', async ({ assert }) => {
    ensureAuthEnabled()
    
    const db = new MockDatabaseAdapter()
    const assetsManager = new TestAssetsManager()
    assetsManager.setDependencies(db, mockStorage)

    // Override getAssetById to return undefined (asset not found)
    assetsManager.getAssetById = async () => undefined

    const mockRequest = {
      headers: {
        'x-user-id': '12345-67890',
        'x-user-roles': 'user'
      },
      params: { id: '999' },
      body: {
        description: 'Updated description'
      }
    }

    const response: DataResponse = await assetsManager.handleUpdate(mockRequest)

    assert.equal(response.status, 404)
    assert.include(JSON.parse(response.content.toString()).error, 'Asset not found')
  })

  // Note: GET endpoints test removed as handleGetAll doesn't exist in current AssetsManager implementation

  test('handleDelete() should allow admin to delete any asset', async ({ assert }) => {
    ensureAuthEnabled()

    const db = new MockDatabaseAdapter()

    // Mock an existing asset owned by user ID 999 (different from admin)
    const existingAsset = {
      id: 1,
      name: 'test-assets',
      contentType: 'application/octet-stream',
      url: 'test/asset.bin',
      date: new Date(),
      owner_id: 999, // Owned by a different user ID
      description: 'Test asset',
      source: 'https://example.com',
      filename: 'asset.bin',
      data: async () => Buffer.from('test')
    }

    const assetsManager = new TestAssetsManager()
    assetsManager.setDependencies(db, mockStorage)

    // Override getAssetById to return our mock asset
    assetsManager.getAssetById = async () => existingAsset

    // Mock deleteAssetById to track if it was called
    let deleteWasCalled = false
    assetsManager.deleteAssetById = async () => {
      deleteWasCalled = true
    }

    const mockRequest = {
      headers: {
        'x-user-id': 'admin-user-id',
        'x-user-roles': 'admin' // Admin role
      },
      params: { id: '1' }
    }

    const response: DataResponse = await assetsManager.handleDelete(mockRequest)

    assert.equal(response.status, 200)
    assert.isTrue(deleteWasCalled, 'Admin should be able to delete any asset')
  })

  test('handleUpdate() should allow admin to modify any asset', async ({ assert }) => {
    ensureAuthEnabled()

    const db = new MockDatabaseAdapter()

    // Mock an existing asset owned by user ID 999 (different from admin)
    const existingAsset = {
      id: 1,
      name: 'test-assets',
      contentType: 'application/octet-stream',
      url: 'test/asset.bin',
      date: new Date(),
      owner_id: 999, // Owned by a different user ID
      description: 'Original description',
      source: 'https://example.com',
      filename: 'asset.bin',
      data: async () => Buffer.from('test')
    }

    const assetsManager = new TestAssetsManager()
    assetsManager.setDependencies(db, mockStorage)

    // Override getAssetById to return our mock asset
    assetsManager.getAssetById = async () => existingAsset

    // Mock updateAssetMetadata to track if it was called
    let updateWasCalled = false
    assetsManager.updateAssetMetadata = async () => {
      updateWasCalled = true
    }

    const mockRequest = {
      headers: {
        'x-user-id': 'admin-user-id',
        'x-user-roles': 'admin' // Admin role
      },
      params: { id: '1' },
      body: {
        description: 'Admin updated description'
      }
    }

    const response: DataResponse = await assetsManager.handleUpdate(mockRequest)

    assert.equal(response.status, 200)
    assert.isTrue(updateWasCalled, 'Admin should be able to modify any asset')
  })

  test('handleDeleteBatch() should allow admin to delete any assets', async ({ assert }) => {
    ensureAuthEnabled()

    const db = new MockDatabaseAdapter()

    // Mock assets owned by different users
    const assets = new Map([
      ['1', { id: 1, name: 'test-assets', owner_id: 100, url: 'test/1.bin', date: new Date(), contentType: 'application/octet-stream', data: async () => Buffer.from('') }],
      ['2', { id: 2, name: 'test-assets', owner_id: 200, url: 'test/2.bin', date: new Date(), contentType: 'application/octet-stream', data: async () => Buffer.from('') }],
      ['3', { id: 3, name: 'test-assets', owner_id: 300, url: 'test/3.bin', date: new Date(), contentType: 'application/octet-stream', data: async () => Buffer.from('') }]
    ])

    const assetsManager = new TestAssetsManager()
    assetsManager.setDependencies(db, mockStorage)

    // Override getAssetById to return assets from our map
    assetsManager.getAssetById = async (id: string) => assets.get(id)

    // Track deleted IDs
    const deletedIds: string[] = []
    assetsManager.deleteAssetById = async (id: string) => {
      deletedIds.push(id)
    }

    const mockRequest = {
      headers: {
        'x-user-id': 'admin-user-id',
        'x-user-roles': 'admin' // Admin role
      },
      body: {
        ids: ['1', '2', '3']
      }
    }

    const response: DataResponse = await assetsManager.handleDeleteBatch(mockRequest)

    assert.equal(response.status, 200)
    const result = JSON.parse(response.content.toString())
    assert.equal(result.results.filter((r: any) => r.success).length, 3)
    assert.deepEqual(deletedIds.sort(), ['1', '2', '3'])
  })
})

test.group('AssetsManager Authentication - Error Handling', () => {
  test('should handle user service errors gracefully', async ({ assert }) => {
    ensureAuthEnabled()
    
    const db = new MockDatabaseAdapter()
    const assetsManager = new TestAssetsManager()
    assetsManager.setDependencies(db, mockStorage)

    // Mock UserService to throw an error
    const originalUserService = (assetsManager as any).userService
    ;(assetsManager as any).userService = {
      findOrCreateUser: async () => {
        throw new Error('Database connection failed')
      }
    }

    const mockRequest = {
      headers: {
        'x-user-id': '12345-67890',
        'x-user-roles': 'user'
      },
      body: {
        description: 'Test file',
        source: 'https://example.com'
      },
      file: {
        path: '/tmp/test.bin',
        originalname: 'test.bin'
      }
    }

    const response: DataResponse = await assetsManager.handleUpload(mockRequest)

    assert.equal(response.status, 500)
    assert.include(JSON.parse(response.content.toString()).error, 'Database connection failed')
  })

  test('should handle malformed authentication headers', async ({ assert }) => {
    ensureAuthEnabled()
    
    const db = new MockDatabaseAdapter()
    const assetsManager = new TestAssetsManager()
    assetsManager.setDependencies(db, mockStorage)

    const mockRequest = {
      headers: {
        'x-user-id': null as any, // Malformed header
        'x-user-roles': 'user'
      },
      body: {
        description: 'Test file',
        source: 'https://example.com'
      },
      file: {
        path: '/tmp/test.bin',
        originalname: 'test.bin'
      }
    }

    const response: DataResponse = await assetsManager.handleUpload(mockRequest)

    assert.equal(response.status, 401)
    assert.include(JSON.parse(response.content.toString()).error, 'Authentication required')
  })
})