import { test } from '@japa/runner'
import { sanitizeFilename } from '../../src/utils/sanitize_filename.js'

test.group('sanitizeFilename', () => {
    test('keeps ordinary filenames', ({ assert }) => {
        assert.equal(sanitizeFilename('model.glb'), 'model.glb')
        assert.equal(sanitizeFilename('tile_0-v2.b3dm'), 'tile_0-v2.b3dm')
    })

    test('drops directory parts in both slash styles', ({ assert }) => {
        assert.equal(sanitizeFilename('../../../../etc/passwd'), 'passwd')
        assert.equal(sanitizeFilename('..\\..\\windows\\system32\\evil.dll'), 'evil.dll')
        assert.equal(sanitizeFilename('/absolute/path/file.json'), 'file.json')
    })

    test('replaces unsafe characters and strips leading dots', ({ assert }) => {
        assert.equal(sanitizeFilename('my model (v2).glb'), 'my_model__v2_.glb')
        assert.equal(sanitizeFilename('.hidden'), 'hidden')
        assert.equal(sanitizeFilename('..'), 'file')
        assert.equal(sanitizeFilename('', 'layer'), 'layer')
    })
})
