import { test } from '@japa/runner'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { importOptional } from '../src/optional_import.js'

test.group('importOptional', group => {
    let dir: string

    group.each.setup(async () => {
        dir = await mkdtemp(join(tmpdir(), 'optional-import-'))
        return () => rm(dir, { recursive: true, force: true })
    })

    async function moduleWith(source: string): Promise<string> {
        const file = join(dir, 'module.mjs')
        await writeFile(file, source)
        return pathToFileURL(file).href
    }

    test('returns undefined when the package is not installed', async ({ assert }) => {
        assert.isUndefined(await importOptional('@cepseudo/not-a-real-package'))
    })

    test('returns the module when it is installed', async ({ assert }) => {
        const url = await moduleWith('export const answer = 42\n')
        assert.equal((await importOptional<{ answer: number }>(url))?.answer, 42)
    })

    test('throws when an installed module cannot find one of its own dependencies', async ({ assert }) => {
        const url = await moduleWith("import 'definitely-not-installed-package'\n")
        await assert.rejects(() => importOptional(url), /definitely-not-installed-package/)
    })

    test('throws when an installed module fails while loading', async ({ assert }) => {
        const url = await moduleWith("throw new Error('NGSI_LD_PUBLIC_READ: expected a boolean')\n")
        await assert.rejects(() => importOptional(url), /NGSI_LD_PUBLIC_READ/)
    })
})
