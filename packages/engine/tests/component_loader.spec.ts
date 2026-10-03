import { mkdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from '@japa/runner'
import { Collector, Handler } from '@cepseudo/components'
import { loadComponents } from '../src/loader/component_loader.js'
import type { LoadComponentsResult } from '../src/loader/component_loader.js'

// Inside the package so the fixtures resolve @cepseudo/components through its node_modules
const root = fileURLToPath(new URL('./tmp/', import.meta.url))
const componentsDir = join(root, 'components')

const fixtures: Record<string, string> = {
    'components/weather_collector.ts': `import { Collector } from '@cepseudo/components'

export class WeatherCollector extends Collector {
    getConfiguration() {
        return { name: 'weather', description: 'Weather', contentType: 'application/json', endpoint: 'weather' }
    }

    getSchedule() {
        return '0 * * * * *'
    }

    async collect() {
        return Buffer.from('{}')
    }
}
`,
    'components/status_handler.ts': `import { Handler } from '@cepseudo/components'

export default class StatusHandler extends Handler {
    getConfiguration() {
        return { name: 'status', description: 'Status', contentType: 'application/json' }
    }
}
`,
    'components/index.ts': 'export {}\n',
    'broken/bad_collector.ts': 'export class { invalid syntax\n',
    'no_class/constants_handler.ts': 'export const timeoutMs = 5000\n'
}

function allLoaded(result: LoadComponentsResult): unknown[] {
    return [...result.collectors, ...result.harvesters, ...result.handlers, ...result.assetsManagers, ...result.customTableManagers]
}

async function loadLogged(directory: string, exclude?: string[]): Promise<{ result: LoadComponentsResult; logs: string[] }> {
    const logs: string[] = []
    const result = await loadComponents(directory, { extensions: ['.ts'], exclude, verbose: true, logger: message => logs.push(message) })
    return { result, logs }
}

test.group('loadComponents', group => {
    group.setup(async () => {
        await mkdir(join(root, 'empty'), { recursive: true })
        for (const [file, source] of Object.entries(fixtures)) {
            await mkdir(dirname(join(root, file)), { recursive: true })
            await writeFile(join(root, file), source)
        }
    })

    group.teardown(async () => {
        await rm(root, { recursive: true, force: true })
    })

    test('a missing directory gives empty results', async ({ assert }) => {
        const result = await loadComponents(join(root, 'missing'))

        assert.deepEqual(allLoaded(result), [])
        assert.deepEqual(result.scannedFiles, [])
        assert.deepEqual(result.errors, [])
    })

    test('an empty directory gives empty results', async ({ assert }) => {
        const result = await loadComponents(join(root, 'empty'), { extensions: ['.ts'] })

        assert.deepEqual(allLoaded(result), [])
        assert.deepEqual(result.scannedFiles, [])
        assert.deepEqual(result.errors, [])
    })

    test('loads exactly one collector and one handler from their files', async ({ assert }) => {
        const result = await loadComponents(componentsDir, { extensions: ['.ts'] })

        assert.deepEqual(result.errors, [])
        assert.lengthOf(allLoaded(result), 2)
        assert.equal(result.summary.total, 2)

        assert.lengthOf(result.collectors, 1)
        assert.instanceOf(result.collectors[0], Collector)
        assert.equal(result.collectors[0].getConfiguration().name, 'weather')

        assert.lengthOf(result.handlers, 1)
        assert.instanceOf(result.handlers[0], Handler)
        assert.equal(result.handlers[0].getConfiguration().name, 'status')
    })

    test('a file named in exclude is not loaded', async ({ assert }) => {
        const { result, logs } = await loadLogged(componentsDir, ['status_handler.ts'])

        assert.lengthOf(result.handlers, 0)
        assert.lengthOf(result.collectors, 1)
        assert.include(logs, '[loadComponents] Excluding status_handler.ts')
    })

    test('a wildcard exclude pattern matches the file name without its extension', async ({ assert }) => {
        const { result, logs } = await loadLogged(componentsDir, ['*_handler'])

        assert.lengthOf(result.handlers, 0)
        assert.lengthOf(result.collectors, 1)
        assert.include(logs, '[loadComponents] Excluding status_handler.ts')
    })

    test('index files are excluded by default', async ({ assert }) => {
        const { logs } = await loadLogged(componentsDir)

        assert.include(logs, '[loadComponents] Excluding index.ts')
    })

    test('verbose mode reports each step through the logger', async ({ assert }) => {
        const { logs } = await loadLogged(componentsDir)

        assert.includeMembers(logs, [
            `[loadComponents] Loading components from ${componentsDir}`,
            '[loadComponents] Found 2 potential component files',
            '[loadComponents] Loaded: weather (collectors)',
            '[loadComponents] Loaded: status (handlers)',
            '[loadComponents] Loaded components: 2 total'
        ])
    })

    test('nothing is logged without verbose', async ({ assert }) => {
        const logs: string[] = []
        await loadComponents(componentsDir, { extensions: ['.ts'], logger: message => logs.push(message) })

        assert.deepEqual(logs, [])
    })

    test('only the configured extensions are scanned, .js and .mjs by default', async ({ assert }) => {
        const byDefault = await loadComponents(componentsDir)
        assert.deepEqual(byDefault.scannedFiles, [])
        assert.equal(byDefault.summary.total, 0)

        const withTs = await loadComponents(componentsDir, { extensions: ['.ts'] })
        assert.sameMembers(withTs.scannedFiles, [join(componentsDir, 'weather_collector.ts'), join(componentsDir, 'status_handler.ts')])
    })

    test('a component file that fails to import is reported in errors', async ({ assert }) => {
        const result = await loadComponents(join(root, 'broken'), { extensions: ['.ts'] })

        assert.deepEqual(allLoaded(result), [])
        assert.lengthOf(result.errors, 1)
        assert.equal(result.errors[0].file, join(root, 'broken', 'bad_collector.ts'))
        assert.match(result.errors[0].error, /^Failed to import: /)
        assert.equal(result.summary.errors, 1)
    })

    test('a component file without a component class is reported in errors', async ({ assert }) => {
        const result = await loadComponents(join(root, 'no_class'), { extensions: ['.ts'] })

        assert.deepEqual(allLoaded(result), [])
        assert.deepEqual(result.errors, [{
            file: join(root, 'no_class', 'constants_handler.ts'),
            error: 'No valid component class found in module exports'
        }])
    })
})
