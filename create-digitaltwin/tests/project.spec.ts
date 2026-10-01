import { test } from '@japa/runner'
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import fs from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { FRAMEWORK_VERSION, generateProject, projectFiles } from '../src/generators/project.js'
import type { ProjectAnswers } from '../src/types/project-config.js'

const run = promisify(execFile)
const tsc = createRequire(import.meta.url).resolve('typescript/bin/tsc')
// Inside the package, so the generated code resolves @cepseudo/* from its node_modules
const outDir = path.resolve('tests/generated')

function answers(overrides: Partial<ProjectAnswers> = {}): ProjectAnswers {
  const projectName = overrides.projectName ?? 'demo'
  return {
    projectName,
    projectPath: path.join(outDir, projectName),
    database: 'sqlite',
    storage: 'local',
    auth: 'none',
    ngsiLd: false,
    includeDocker: true,
    includeExamples: true,
    ...overrides,
  }
}

const fullStack = answers({ projectName: 'full-stack', database: 'postgresql', storage: 's3', auth: 'oidc', ngsiLd: true })

function composeServices(compose: string): string[] {
  const [services] = compose.split('\nvolumes:')
  return [...services.matchAll(/^ {2}([\w-]+):$/gm)].map(match => match[1])
}

function dependencies(files: Record<string, string>): Record<string, string> {
  return (JSON.parse(files['package.json']) as { dependencies: Record<string, string> }).dependencies
}

test.group('generateProject', group => {
  group.teardown(() => fs.rm(outDir, { recursive: true, force: true }))

  test('a generated project type-checks against the @cepseudo packages ({projectName})', async ({ assert }, project: ProjectAnswers) => {
    await generateProject(project)
    await run(process.execPath, [tsc, '--noEmit', '-p', path.join(project.projectPath, 'tsconfig.json')]).catch(error => {
      assert.fail(`tsc failed:\n${(error as { stdout?: string }).stdout ?? String(error)}`)
    })
  })
    .with([answers({ projectName: 'defaults' }), fullStack, answers({ projectName: 'bare', includeExamples: false, includeDocker: false })])
    .timeout(60000)

  test('refuses a directory that is not empty and leaves its files alone', async ({ assert }) => {
    const project = answers({ projectName: 'existing' })
    await fs.mkdir(project.projectPath, { recursive: true })
    await fs.writeFile(path.join(project.projectPath, 'package.json'), '{"name":"mine"}')

    await assert.rejects(() => generateProject(project), /already exists and is not empty/)
    assert.equal(await fs.readFile(path.join(project.projectPath, 'package.json'), 'utf8'), '{"name":"mine"}')
  })
})

test.group('projectFiles', () => {
  test('depends on the @cepseudo packages of the 2.x line and never on digitaltwin-core', ({ assert }) => {
    const deps = dependencies(projectFiles(fullStack, 'secret'))

    for (const name of ['engine', 'database', 'storage', 'shared', 'components', 'assets', 'ngsi-ld']) {
      assert.equal(deps[`@cepseudo/${name}`], FRAMEWORK_VERSION)
    }
    assert.notProperty(deps, 'digitaltwin-core')
    assert.notProperty(deps, 'ioredis')
  })

  test('adds the driver of the chosen database and NGSI-LD only when asked', ({ assert }) => {
    const sqlite = dependencies(projectFiles(answers(), 'secret'))
    const postgres = dependencies(projectFiles(fullStack, 'secret'))

    assert.properties(sqlite, ['better-sqlite3', 'kysely'])
    assert.notAnyProperties(sqlite, ['pg', '@cepseudo/ngsi-ld'])
    assert.properties(postgres, ['pg', '@cepseudo/ngsi-ld'])
    assert.notProperty(postgres, 'better-sqlite3')
  })

  test('docker-compose.yml runs Redis and the services the choices need', ({ assert }) => {
    assert.deepEqual(composeServices(projectFiles(answers(), 'secret')['docker-compose.yml']), ['redis'])
    assert.deepEqual(composeServices(projectFiles(fullStack, 'secret')['docker-compose.yml']), [
      'redis',
      'postgres',
      'minio',
      'minio-bucket',
      'oidc',
    ])
    assert.notProperty(projectFiles(answers({ includeDocker: false }), 'secret'), 'docker-compose.yml')
  })

  test('.env points at the compose services and the mock OIDC issuer', ({ assert }) => {
    const files = projectFiles(fullStack, 'secret')

    assert.include(files['.env'], 'AUTH_MODE=oidc')
    assert.include(files['.env'], 'OIDC_ISSUER=http://localhost:8080/default')
    assert.include(files['docker-compose.yml'], '"8080:8080"')
    assert.include(files['.env'], 'S3_ENDPOINT=http://localhost:9000')
    assert.include(files['.env'], 'DB_NAME=full-stack')
    assert.include(files['docker-compose.yml'], 'POSTGRES_DB: full-stack')
  })

  test('the trusted-headers secret goes to .env only, .env.example gets a placeholder', ({ assert }) => {
    const files = projectFiles(answers({ auth: 'trusted-headers' }), 'a1b2c3')

    assert.include(files['.env'], 'AUTH_HEADER_SECRET=a1b2c3')
    assert.include(files['.env.example'], 'AUTH_HEADER_SECRET=change-me')
    assert.notInclude(files['.env.example'], 'a1b2c3')
    assert.include(files['.gitignore'], '.env\n')
  })
})

test.group('create-digitaltwin command', group => {
  const entry = path.resolve('src/index.ts')
  const cli = (...args: string[]) => run(process.execPath, ['--import', 'tsx', entry, ...args], { cwd: outDir })

  group.setup(() => fs.mkdir(outDir, { recursive: true }))
  group.teardown(() => fs.rm(outDir, { recursive: true, force: true }))

  test('--yes builds the project from the flags', async ({ assert }) => {
    await cli('from-flags', '--yes', '--database', 'postgresql', '--storage', 's3', '--auth', 'oidc', '--ngsi-ld', '--no-examples')
    const project = path.join(outDir, 'from-flags')

    assert.isTrue(existsSync(path.join(project, 'docker-compose.yml')))
    assert.isFalse(existsSync(path.join(project, 'src', 'components')))
    assert.include(await fs.readFile(path.join(project, '.env'), 'utf8'), 'AUTH_MODE=oidc')
    assert.property(JSON.parse(await fs.readFile(path.join(project, 'package.json'), 'utf8')).dependencies, '@cepseudo/ngsi-ld')
  }).timeout(30000)

  test('rejects an unknown database', async ({ assert }) => {
    const error = await cli('bad-db', '--yes', '--database', 'mysql').then(
      () => undefined,
      (failure: { stderr: string }) => failure
    )

    assert.match(error?.stderr ?? '', /Allowed choices are sqlite, postgresql/)
    assert.isFalse(existsSync(path.join(outDir, 'bad-db')))
  }).timeout(30000)
})
