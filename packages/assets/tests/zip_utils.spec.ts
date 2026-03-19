import { test } from '@japa/runner'
import JSZip from 'jszip'
import {
    extractZipContentStream,
    zipToDict,
    detectTilesetRootFile,
    normalizeArchivePaths,
    extractAndStoreArchive
} from '../src/utils/zip_utils.js'
import { MockStorageService } from './mocks/mock_storage_service.js'

async function createTestZip(files: Record<string, string | Buffer>): Promise<Buffer> {
    const zip = new JSZip()
    for (const [name, content] of Object.entries(files)) {
        zip.file(name, content)
    }
    return await zip.generateAsync({ type: 'nodebuffer' })
}

test.group('extractZipContentStream', () => {
    test('yields all files with their content', async ({ assert }) => {
        const zipBuffer = await createTestZip({
            'file1.txt': 'Hello World',
            'file2.txt': 'Another file'
        })

        const results: [string, string | Buffer][] = []
        for await (const entry of extractZipContentStream(zipBuffer)) {
            results.push(entry)
        }

        assert.equal(results.length, 2)
        const file1 = results.find(([name]) => name === 'file1.txt')
        assert.equal(file1![1], 'Hello World')
        const file2 = results.find(([name]) => name === 'file2.txt')
        assert.equal(file2![1], 'Another file')
    })

    test('skips directory entries', async ({ assert }) => {
        const zip = new JSZip()
        zip.folder('mydir')
        zip.file('mydir/file.txt', 'content')
        const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' })

        const results: [string, string | Buffer][] = []
        for await (const entry of extractZipContentStream(zipBuffer)) {
            results.push(entry)
        }

        assert.equal(results.length, 1)
        assert.equal(results[0][0], 'mydir/file.txt')
    })

    test('preserves binary content as Buffer', async ({ assert }) => {
        const binaryContent = Buffer.from([0x00, 0x01, 0x02, 0xFF, 0xFE])
        const zipBuffer = await createTestZip({ 'binary.bin': binaryContent })

        const results: [string, string | Buffer][] = []
        for await (const entry of extractZipContentStream(zipBuffer)) {
            results.push(entry)
        }

        assert.equal(results.length, 1)
        // Content should be retrievable and non-empty
        const content = results[0][1]
        assert.isTrue(content.length > 0)
    })

    test('yields nothing for empty zip', async ({ assert }) => {
        const zip = new JSZip()
        const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' })

        const results: [string, string | Buffer][] = []
        for await (const entry of extractZipContentStream(zipBuffer)) {
            results.push(entry)
        }

        assert.equal(results.length, 0)
    })

    test('preserves nested directory paths', async ({ assert }) => {
        const zip = new JSZip()
        zip.file('root.txt', 'root content')
        zip.file('level1/file.txt', 'level 1')
        zip.file('level1/level2/file.txt', 'level 2')
        const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' })

        const results: [string, string | Buffer][] = []
        for await (const entry of extractZipContentStream(zipBuffer)) {
            results.push(entry)
        }

        assert.equal(results.length, 3)
        const paths = results.map(([name]) => name)
        assert.include(paths, 'root.txt')
        assert.include(paths, 'level1/file.txt')
        assert.include(paths, 'level1/level2/file.txt')
    })

    test('throws on corrupt/invalid buffer', async ({ assert }) => {
        const corruptBuffer = Buffer.from('this is not a zip file at all')

        await assert.rejects(async () => {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            for await (const _entry of extractZipContentStream(corruptBuffer)) {
                // should not reach here
            }
        })
    })
})

test.group('zipToDict', () => {
    test('returns all files as key-value pairs', async ({ assert }) => {
        const zipBuffer = await createTestZip({
            'config.json': '{"name": "test"}',
            'readme.txt': 'Documentation'
        })

        const result = await zipToDict(zipBuffer)

        assert.equal(Object.keys(result).length, 2)
        assert.equal(result['config.json'], '{"name": "test"}')
        assert.equal(result['readme.txt'], 'Documentation')
    })

    test('returns empty object for empty zip', async ({ assert }) => {
        const zip = new JSZip()
        const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' })

        const result = await zipToDict(zipBuffer)

        assert.equal(Object.keys(result).length, 0)
    })

    test('uses full file path as key', async ({ assert }) => {
        const zip = new JSZip()
        zip.file('dir/subdir/file.txt', 'content')
        const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' })

        const result = await zipToDict(zipBuffer)

        assert.equal(result['dir/subdir/file.txt'], 'content')
    })
})

test.group('detectTilesetRootFile', () => {
    test('finds tileset.json at root', ({ assert }) => {
        const files = ['tileset.json', 'tiles/tile_0.b3dm']
        assert.equal(detectTilesetRootFile(files), 'tileset.json')
    })

    test('finds tileset.json in subdirectory', ({ assert }) => {
        const files = ['my_tileset/tileset.json', 'my_tileset/tiles/tile_0.b3dm']
        assert.equal(detectTilesetRootFile(files), 'my_tileset/tileset.json')
    })

    test('finds tileset.json case-insensitively', ({ assert }) => {
        const files = ['Tileset.JSON', 'tiles/tile_0.b3dm']
        assert.equal(detectTilesetRootFile(files), 'Tileset.JSON')
    })

    test('returns undefined when no tileset.json exists', ({ assert }) => {
        const files = ['model.glb', 'texture.png']
        assert.isUndefined(detectTilesetRootFile(files))
    })

    test('prefers root-level tileset.json over nested one', ({ assert }) => {
        const files = ['tileset.json', 'nested/tileset.json']
        assert.equal(detectTilesetRootFile(files), 'tileset.json')
    })
})

test.group('normalizeArchivePaths', () => {
    test('strips common root directory when all files share one', ({ assert }) => {
        const files = ['my_tileset/tileset.json', 'my_tileset/tiles/tile_0.b3dm']
        const normalized = normalizeArchivePaths(files)

        assert.equal(normalized.get('my_tileset/tileset.json'), 'tileset.json')
        assert.equal(normalized.get('my_tileset/tiles/tile_0.b3dm'), 'tiles/tile_0.b3dm')
    })

    test('preserves paths when files have different roots', ({ assert }) => {
        const files = ['dir1/file1.txt', 'dir2/file2.txt']
        const normalized = normalizeArchivePaths(files)

        assert.equal(normalized.get('dir1/file1.txt'), 'dir1/file1.txt')
        assert.equal(normalized.get('dir2/file2.txt'), 'dir2/file2.txt')
    })

    test('preserves paths when no common root exists', ({ assert }) => {
        const files = ['file1.txt', 'file2.txt']
        const normalized = normalizeArchivePaths(files)

        assert.equal(normalized.get('file1.txt'), 'file1.txt')
        assert.equal(normalized.get('file2.txt'), 'file2.txt')
    })
})

test.group('extractAndStoreArchive', () => {
    test('extracts all files and stores them under basePath', async ({ assert }) => {
        const storage = new MockStorageService()

        const zipBuffer = await createTestZip({
            'tileset.json': '{"asset":{"version":"1.0"}}',
            'tiles/tile_0.b3dm': 'binary tile data'
        })

        const result = await extractAndStoreArchive(zipBuffer, storage, 'tilesets/123')

        assert.equal(result.file_count, 2)
        assert.equal(result.root_file, 'tileset.json')
        assert.isTrue(storage.has('tilesets/123/tileset.json'))
        assert.isTrue(storage.has('tilesets/123/tiles/tile_0.b3dm'))
    })

    test('normalizes paths when files share a common root directory', async ({ assert }) => {
        const storage = new MockStorageService()

        const zipBuffer = await createTestZip({
            'my_tileset/tileset.json': '{"asset":{}}',
            'my_tileset/tiles/tile_0.b3dm': 'data'
        })

        const result = await extractAndStoreArchive(zipBuffer, storage, 'tilesets/456')

        assert.equal(result.root_file, 'tileset.json')
        assert.isTrue(storage.has('tilesets/456/tileset.json'))
        assert.isTrue(storage.has('tilesets/456/tiles/tile_0.b3dm'))
    })

    test('returns undefined root_file when no tileset.json exists', async ({ assert }) => {
        const storage = new MockStorageService()

        const zipBuffer = await createTestZip({
            'model.glb': 'binary',
            'texture.png': 'image'
        })

        const result = await extractAndStoreArchive(zipBuffer, storage, 'assets/789')

        assert.equal(result.file_count, 2)
        assert.isUndefined(result.root_file)
    })
})
