import { test } from '@japa/runner'
import { execFile } from 'node:child_process'
import { createRequire } from 'node:module'
import fs from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import Fastify from 'fastify'
import { exposeEndpoints, registerOpenApi } from '@cepseudo/engine'
import type { Handler } from '@cepseudo/components'
import { StubGenerator } from '../src/generators/stub_generator.js'
import type { TemplateData, TemplateName } from '../src/generators/templates.js'

const run = promisify(execFile)
const tsc = createRequire(import.meta.url).resolve('typescript/bin/tsc')
// A dot-directory would fall outside tsconfig's include globs and lose experimentalDecorators under tsx
const outDir = path.resolve('tests/generated')

interface OpenApiDocument {
  paths: Record<string, Record<string, { requestBody?: { content: Record<string, { schema: { properties?: Record<string, unknown> } }> } }>>
}

async function generateHandler(): Promise<string> {
  const content = await new StubGenerator().generate('handler', {
    name: 'AirQualityHandler',
    description: 'Air quality readings',
    method: 'post',
    tags: [],
    endpoint: 'air-quality',
    schemaKey: 'body',
    inputField: 'body'
  })
  await fs.mkdir(outDir, { recursive: true })
  const file = path.join(outDir, 'air_quality_handler.ts')
  await fs.writeFile(file, content)
  return file
}

// A quote and a comment terminator in user input must not break the generated code
const description = "Reads the city's sensors */ every hour"

const templates: Array<[TemplateName, TemplateData]> = [
  ['collector', { name: 'AirQualityCollector', endpoint: 'air-quality', description, tags: ['air', "o'clock"], schedule: '0 * * * * *' }],
  ['harvester', { name: 'DailyAverage', endpoint: 'daily-average', description, tags: [], sourceCollector: 'air-quality' }],
  ['handler', { name: 'AirQualityHandler', endpoint: 'air-quality', description, tags: [], method: 'post', schemaKey: 'body', inputField: 'body' }],
  ['assets_manager', { name: 'Models', endpoint: 'models', description, tags: [], contentType: 'model/gltf-binary' }],
  ['tileset_manager', { name: 'Buildings', endpoint: 'buildings', description }],
  ['map_manager', { name: 'CityMaps', endpoint: 'city-maps', description }]
]

test.group('make:* templates', group => {
  group.teardown(() => fs.rm(outDir, { recursive: true, force: true }))

  test('every generated component type-checks against the @cepseudo packages', async ({ assert }) => {
    const generator = new StubGenerator()
    await fs.mkdir(outDir, { recursive: true })
    const files = await Promise.all(
      templates.map(async ([name, data]) => {
        const file = path.join(outDir, `generated_${name}.ts`)
        await fs.writeFile(file, await generator.generate(name, data))
        return file
      })
    )
    // Flags rather than a tsconfig in outDir: tsx would pick that file up for the import in the next test
    const flags = ['--noEmit', '--strict', '--experimentalDecorators', '--esModuleInterop', '--skipLibCheck', '--module', 'NodeNext', '--moduleResolution', 'NodeNext', '--target', 'ES2022', '--types', 'node']

    const { stdout } = await run(process.execPath, [tsc, ...flags, ...files]).catch(error => {
      assert.fail(`tsc failed:\n${(error as { stdout?: string }).stdout ?? String(error)}`)
      return { stdout: '' }
    })
    assert.equal(stdout.trim(), '')
  }).timeout(60000)
})

test.group('make:handler template', group => {
  group.teardown(() => fs.rm(outDir, { recursive: true, force: true }))

  test('the generated handler appears in the OpenAPI document and its schema is enforced', async ({ assert }) => {
    const file = await generateHandler()
    const module = (await import(pathToFileURL(file).href)) as { AirQualityHandler: new () => Handler }
    const handler = new module.AirQualityHandler()

    const fastify = Fastify({ logger: false })
    await registerOpenApi(fastify, [handler])
    await exposeEndpoints(fastify, [handler])
    await fastify.ready()
    try {
      const document = (await fastify.inject('/api/openapi.json')).json() as OpenApiDocument
      const operation = document.paths['/api/air-quality'].post
      assert.isDefined(operation)
      assert.property(operation.requestBody?.content['application/json'].schema.properties ?? {}, 'example')

      const accepted = await fastify.inject({ method: 'POST', url: '/api/air-quality', payload: { example: 'ok' } })
      assert.equal(accepted.statusCode, 200)
      assert.deepEqual(accepted.json(), { received: { example: 'ok' } })

      // An object cannot be coerced to a string, unlike a number
      const rejected = await fastify.inject({ method: 'POST', url: '/api/air-quality', payload: { example: { nested: true } } })
      assert.equal(rejected.statusCode, 400)
    } finally {
      await fastify.close()
    }
  })
})
