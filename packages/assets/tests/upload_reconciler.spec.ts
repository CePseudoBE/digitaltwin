import { test } from '@japa/runner'
import { UploadReconciler } from '../src/upload_reconciler.js'
import { MockDatabaseAdapter } from './mocks/mock_database_adapter.js'
import { MockStorageService } from './mocks/mock_storage_service.js'

function createReconciler() {
    const storage = new MockStorageService()
    storage.setPresignedUrlSupport(true)
    const db = new MockDatabaseAdapter({ storage })
    const reconciler = new UploadReconciler(db, storage)
    return { reconciler, db, storage }
}

async function createPendingRecord(
    db: MockDatabaseAdapter,
    options: {
        presignedKey: string
        expired?: boolean
    }
) {
    const expiresAt = options.expired
        ? new Date(Date.now() - 60_000) // 1 minute ago
        : new Date(Date.now() + 300_000) // 5 minutes from now

    const record = await db.save({
        name: 'test_reconcile',
        type: 'application/octet-stream',
        url: '',
        date: new Date(),
        description: 'test',
        owner_id: 1,
        filename: 'test.bin',
        presigned_key: options.presignedKey,
        presigned_expires_at: expiresAt
    })

    await db.updateById('test_reconcile', record.id, {
        upload_status: 'pending',
        presigned_key: options.presignedKey,
        presigned_expires_at: expiresAt
    })

    return record
}

test.group('UploadReconciler', () => {
    test('marks as completed when expired but file exists', async ({ assert }) => {
        const { reconciler, db, storage } = createReconciler()

        const record = await createPendingRecord(db, {
            presignedKey: 'test_reconcile/expired-exists.bin',
            expired: true
        })
        storage.setObjectExists('test_reconcile/expired-exists.bin', true)

        const result = await reconciler.reconcileTable('test_reconcile')
        assert.equal(result.checked, 1)
        assert.equal(result.completed, 1)

        const updated = await db.getById(String(record.id))
        assert.equal(updated!.upload_status, 'completed')
        assert.equal(updated!.url, 'test_reconcile/expired-exists.bin')
    })

    test('marks as expired when URL expired and no file', async ({ assert }) => {
        const { reconciler, db, storage } = createReconciler()

        const record = await createPendingRecord(db, {
            presignedKey: 'test_reconcile/expired-missing.bin',
            expired: true
        })
        storage.setObjectExists('test_reconcile/expired-missing.bin', false)

        const result = await reconciler.reconcileTable('test_reconcile')
        assert.equal(result.checked, 1)
        assert.equal(result.expired, 1)

        const updated = await db.getById(String(record.id))
        assert.equal(updated!.upload_status, 'expired')
    })

    test('marks as completed when not expired and file exists (early upload)', async ({ assert }) => {
        const { reconciler, db, storage } = createReconciler()

        const record = await createPendingRecord(db, {
            presignedKey: 'test_reconcile/not-expired-exists.bin',
            expired: false
        })
        storage.setObjectExists('test_reconcile/not-expired-exists.bin', true)

        const result = await reconciler.reconcileTable('test_reconcile')
        assert.equal(result.checked, 1)
        assert.equal(result.completed, 1)

        const updated = await db.getById(String(record.id))
        assert.equal(updated!.upload_status, 'completed')
    })

    test('skips when not expired and no file (still waiting)', async ({ assert }) => {
        const { reconciler, db, storage } = createReconciler()

        await createPendingRecord(db, {
            presignedKey: 'test_reconcile/not-expired-missing.bin',
            expired: false
        })
        storage.setObjectExists('test_reconcile/not-expired-missing.bin', false)

        const result = await reconciler.reconcileTable('test_reconcile')
        assert.equal(result.checked, 1)
        assert.equal(result.skipped, 1)
    })

    test('returns empty result when presigned not supported', async ({ assert }) => {
        const storage = new MockStorageService()
        // Do NOT enable presigned support
        const db = new MockDatabaseAdapter({ storage })
        const reconciler = new UploadReconciler(db, storage)

        const result = await reconciler.reconcileTable('test_reconcile')
        assert.equal(result.checked, 0)
    })

    test('handles multiple records in same table', async ({ assert }) => {
        const { reconciler, db, storage } = createReconciler()

        // Create 3 pending records with different scenarios
        await createPendingRecord(db, { presignedKey: 'test_reconcile/a.bin', expired: true })
        storage.setObjectExists('test_reconcile/a.bin', true) // completed

        await createPendingRecord(db, { presignedKey: 'test_reconcile/b.bin', expired: true })
        storage.setObjectExists('test_reconcile/b.bin', false) // expired

        await createPendingRecord(db, { presignedKey: 'test_reconcile/c.bin', expired: false })
        storage.setObjectExists('test_reconcile/c.bin', false) // skipped

        const result = await reconciler.reconcileTable('test_reconcile')
        assert.equal(result.checked, 3)
        assert.equal(result.completed, 1)
        assert.equal(result.expired, 1)
        assert.equal(result.skipped, 1)
    })
})
