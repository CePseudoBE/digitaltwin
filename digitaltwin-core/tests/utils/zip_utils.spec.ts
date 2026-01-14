import { test } from '@japa/runner'
import JSZip from 'jszip'
import { extractZipContentStream, zipToDict } from '../../src/utils/zip_utils.js'

// Helper to create a test zip buffer
async function createTestZip(files: Record<string, string | Buffer>): Promise<Buffer> {
    const zip = new JSZip()
    for (const [name, content] of Object.entries(files)) {
        zip.file(name, content)
    }
    return await zip.generateAsync({ type: 'nodebuffer' })
}

test.group('extractZipContentStream', () => {
    test('should extract text files from zip', async ({ assert }) => {
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
        const file2 = results.find(([name]) => name === 'file2.txt')

        assert.isDefined(file1)
        assert.isDefined(file2)
        assert.equal(file1![1], 'Hello World')
        assert.equal(file2![1], 'Another file')
    })

    test('should skip directories', async ({ assert }) => {
        const zip = new JSZip()
        zip.folder('mydir')
        zip.file('mydir/file.txt', 'content')
        const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' })

        const results: [string, string | Buffer][] = []
        for await (const entry of extractZipContentStream(zipBuffer)) {
            results.push(entry)
        }

        // Should only have the file, not the directory
        assert.equal(results.length, 1)
        assert.equal(results[0][0], 'mydir/file.txt')
    })

    test('should handle binary content', async ({ assert }) => {
        const binaryContent = Buffer.from([0x00, 0x01, 0x02, 0xFF, 0xFE])
        const zipBuffer = await createTestZip({
            'binary.bin': binaryContent
        })

        const results: [string, string | Buffer][] = []
        for await (const entry of extractZipContentStream(zipBuffer)) {
            results.push(entry)
        }

        assert.equal(results.length, 1)
        assert.isDefined(results[0][1])
    })

    test('should handle empty zip', async ({ assert }) => {
        const zip = new JSZip()
        const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' })

        const results: [string, string | Buffer][] = []
        for await (const entry of extractZipContentStream(zipBuffer)) {
            results.push(entry)
        }

        assert.equal(results.length, 0)
    })

    test('should handle nested directory structure', async ({ assert }) => {
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
})

test.group('zipToDict', () => {
    test('should return dictionary of files', async ({ assert }) => {
        const zipBuffer = await createTestZip({
            'config.json': '{"name": "test"}',
            'readme.txt': 'Documentation'
        })

        const result = await zipToDict(zipBuffer)

        assert.isObject(result)
        assert.equal(Object.keys(result).length, 2)
        assert.equal(result['config.json'], '{"name": "test"}')
        assert.equal(result['readme.txt'], 'Documentation')
    })

    test('should handle empty zip', async ({ assert }) => {
        const zip = new JSZip()
        const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' })

        const result = await zipToDict(zipBuffer)

        assert.isObject(result)
        assert.equal(Object.keys(result).length, 0)
    })

    test('should preserve file paths as keys', async ({ assert }) => {
        const zip = new JSZip()
        zip.file('dir/subdir/file.txt', 'content')
        const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' })

        const result = await zipToDict(zipBuffer)

        assert.isDefined(result['dir/subdir/file.txt'])
        assert.equal(result['dir/subdir/file.txt'], 'content')
    })
})
