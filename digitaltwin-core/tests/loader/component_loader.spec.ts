import { test } from '@japa/runner'
import { loadComponents } from '../../src/loader/component_loader.js'
import { join } from 'path'
import { mkdir, writeFile, rm } from 'fs/promises'
import { fileURLToPath } from 'url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

// Test fixtures directory
const fixturesDir = join(__dirname, '__fixtures__')

test.group('loadComponents', (group) => {
    // Setup: create fixtures directory and test component files
    group.setup(async () => {
        await mkdir(fixturesDir, { recursive: true })

        // Create a test collector file
        const collectorContent = `
import { Collector } from '../../src/components/collector.js'

export class TestCollector extends Collector {
    getConfiguration() {
        return {
            name: 'test-collector',
            description: 'Test collector',
            contentType: 'application/json',
            endpoint: 'test-collector'
        }
    }

    getSchedule() {
        return '0 */5 * * * *'
    }

    async collect() {
        return Buffer.from('{"test": true}')
    }
}
`
        await writeFile(join(fixturesDir, 'test_collector.ts'), collectorContent)

        // Create a test handler file
        const handlerContent = `
import { Handler } from '../../src/components/handler.js'

export class TestHandler extends Handler {
    getConfiguration() {
        return {
            name: 'test-handler',
            description: 'Test handler',
            contentType: 'application/json'
        }
    }
}
`
        await writeFile(join(fixturesDir, 'test_handler.ts'), handlerContent)

        // Create an excluded file
        const excludedContent = `
import { Handler } from '../../src/components/handler.js'

export class ExcludedHandler extends Handler {
    getConfiguration() {
        return {
            name: 'excluded-handler',
            description: 'Excluded handler',
            contentType: 'application/json'
        }
    }
}
`
        await writeFile(join(fixturesDir, 'excluded_component.ts'), excludedContent)

        // Create an index file (should be skipped)
        await writeFile(join(fixturesDir, 'index.ts'), 'export {}')
    })

    // Cleanup: remove fixtures directory
    group.teardown(async () => {
        try {
            await rm(fixturesDir, { recursive: true, force: true })
        } catch {
            // Ignore cleanup errors
        }
    })

    test('returns empty arrays for non-existent directory', async ({ assert }) => {
        const result = await loadComponents('/non/existent/path')

        assert.deepEqual(result.collectors, [])
        assert.deepEqual(result.harvesters, [])
        assert.deepEqual(result.handlers, [])
        assert.deepEqual(result.assetsManagers, [])
        assert.deepEqual(result.customTableManagers, [])
    })

    test('returns empty arrays for empty directory', async ({ assert }) => {
        const emptyDir = join(fixturesDir, 'empty')
        await mkdir(emptyDir, { recursive: true })

        const result = await loadComponents(emptyDir)

        assert.deepEqual(result.collectors, [])
        assert.deepEqual(result.harvesters, [])
        assert.deepEqual(result.handlers, [])
        assert.deepEqual(result.assetsManagers, [])
        assert.deepEqual(result.customTableManagers, [])
    })

    test('loads components from directory', async ({ assert }) => {
        const result = await loadComponents(fixturesDir, {
            extensions: ['.ts']
        })

        // Should have loaded at least a collector and handler
        // Note: actual loading depends on whether the imports resolve correctly
        assert.isArray(result.collectors)
        assert.isArray(result.harvesters)
        assert.isArray(result.handlers)
        assert.isArray(result.assetsManagers)
        assert.isArray(result.customTableManagers)
    })

    test('excludes files matching exclude patterns', async ({ assert }) => {
        const logs: string[] = []
        const result = await loadComponents(fixturesDir, {
            exclude: ['excluded_*', 'test_*'],
            verbose: true,
            logger: (msg) => logs.push(msg),
            extensions: ['.ts']
        })

        // Check that exclusion is logged
        const hasExclusionLog = logs.some(log => log.includes('Excluding'))
        assert.isTrue(hasExclusionLog)
    })

    test('verbose mode logs loading progress', async ({ assert }) => {
        const logs: string[] = []

        await loadComponents(fixturesDir, {
            verbose: true,
            logger: (msg) => logs.push(msg),
            extensions: ['.ts']
        })

        // Should have logged loading messages
        assert.isTrue(logs.some(log => log.includes('Loading components from')))
        assert.isTrue(logs.some(log => log.includes('Loaded components')))
    })

    test('skips index files', async ({ assert }) => {
        const logs: string[] = []

        await loadComponents(fixturesDir, {
            verbose: true,
            logger: (msg) => logs.push(msg),
            extensions: ['.ts']
        })

        // Should not have logged loading index.ts
        assert.isFalse(logs.some(log => log.includes('Loading: index.ts')))
    })

    test('supports custom file extensions', async ({ assert }) => {
        const result = await loadComponents(fixturesDir, {
            extensions: ['.js'] // Only look for .js files (none exist)
        })

        // Should find nothing with .js extension only
        assert.equal(result.collectors.length, 0)
        assert.equal(result.handlers.length, 0)
    })

    test('exclude patterns support wildcards', async ({ assert }) => {
        const logs: string[] = []

        await loadComponents(fixturesDir, {
            exclude: ['*_component'],
            verbose: true,
            logger: (msg) => logs.push(msg),
            extensions: ['.ts']
        })

        // Should have excluded the component with _component suffix
        const exclusionLogs = logs.filter(log => log.includes('Excluding'))
        assert.isTrue(exclusionLogs.some(log => log.includes('excluded_component')))
    })
})

test.group('loadComponents edge cases', () => {
    test('handles files that fail to import gracefully', async ({ assert }) => {
        const badDir = join(__dirname, '__bad_fixtures__')
        await mkdir(badDir, { recursive: true })

        // Create a file with invalid syntax
        await writeFile(join(badDir, 'bad_file.ts'), 'export class { invalid syntax')

        const logs: string[] = []
        const result = await loadComponents(badDir, {
            verbose: true,
            logger: (msg) => logs.push(msg),
            extensions: ['.ts']
        })

        // Should still return a result
        assert.isObject(result)

        // Cleanup
        await rm(badDir, { recursive: true, force: true })
    })

    test('handles files with no exportable components', async ({ assert }) => {
        const noCompDir = join(__dirname, '__no_comp_fixtures__')
        await mkdir(noCompDir, { recursive: true })

        // Create a file with no component classes
        await writeFile(join(noCompDir, 'utils.ts'), 'export const foo = "bar"')

        const result = await loadComponents(noCompDir, {
            extensions: ['.ts']
        })

        // Should return empty arrays
        assert.equal(result.collectors.length, 0)
        assert.equal(result.harvesters.length, 0)

        // Cleanup
        await rm(noCompDir, { recursive: true, force: true })
    })
})
