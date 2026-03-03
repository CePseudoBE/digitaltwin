import { test } from '@japa/runner'
import fs from 'fs-extra'
import path from 'path'
import os from 'os'
import { generateProject } from '../src/generators/project.js'
import type { ProjectAnswers } from '../src/types/index.js'

test.group('generateProject', (group) => {
  let testDir: string

  group.setup(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'create-dt-test-'))
  })

  group.teardown(async () => {
    await fs.rm(testDir, { recursive: true, force: true })
  })

  test('should create project with default options', async ({ assert }) => {
    const projectName = 'test-project'
    const projectPath = path.join(testDir, projectName)

    const answers: ProjectAnswers = {
      projectName,
      projectPath,
      database: 'sqlite',
      storage: 'local',
      localStoragePath: './uploads',
      useRedis: false,
      includeDocker: false,
      includeExamples: false,
    }

    await generateProject(answers)

    // Verify files created
    assert.isTrue(await fs.pathExists(path.join(projectPath, 'package.json')))
    assert.isTrue(await fs.pathExists(path.join(projectPath, 'tsconfig.json')))
    assert.isTrue(await fs.pathExists(path.join(projectPath, 'src', 'index.ts')))
    assert.isTrue(await fs.pathExists(path.join(projectPath, '.env')))
    assert.isTrue(await fs.pathExists(path.join(projectPath, '.env.example')))
    assert.isTrue(await fs.pathExists(path.join(projectPath, '.gitignore')))
    assert.isTrue(await fs.pathExists(path.join(projectPath, 'README.md')))
    assert.isTrue(await fs.pathExists(path.join(projectPath, 'dt.js')))
  })

  test('should create project with examples', async ({ assert }) => {
    const projectName = 'test-with-examples'
    const projectPath = path.join(testDir, projectName)

    const answers: ProjectAnswers = {
      projectName,
      projectPath,
      database: 'sqlite',
      storage: 'local',
      useRedis: false,
      includeDocker: false,
      includeExamples: true,
    }

    await generateProject(answers)

    // Verify example component created
    assert.isTrue(await fs.pathExists(path.join(projectPath, 'src', 'components', 'jsonplaceholder_collector.ts')))
    assert.isTrue(await fs.pathExists(path.join(projectPath, 'src', 'components', 'index.ts')))
  })

  test('should create project with Docker files', async ({ assert }) => {
    const projectName = 'test-with-docker'
    const projectPath = path.join(testDir, projectName)

    const answers: ProjectAnswers = {
      projectName,
      projectPath,
      database: 'sqlite',
      storage: 'local',
      useRedis: false,
      includeDocker: true,
      includeExamples: false,
    }

    await generateProject(answers)

    // Verify Docker files created
    assert.isTrue(await fs.pathExists(path.join(projectPath, 'Dockerfile')))
    assert.isTrue(await fs.pathExists(path.join(projectPath, 'docker-compose.yml')))
  })

  test('should include PostgreSQL dependencies when selected', async ({ assert }) => {
    const projectName = 'test-postgresql'
    const projectPath = path.join(testDir, projectName)

    const answers: ProjectAnswers = {
      projectName,
      projectPath,
      database: 'postgresql',
      storage: 'local',
      useRedis: false,
      includeDocker: false,
      includeExamples: false,
    }

    await generateProject(answers)

    const packageJson = await fs.readJson(path.join(projectPath, 'package.json'))

    assert.property(packageJson.dependencies, 'pg')
    assert.property(packageJson.devDependencies, '@types/pg')
    assert.notProperty(packageJson.dependencies, 'better-sqlite3')
  })

  test('should include SQLite dependencies when selected', async ({ assert }) => {
    const projectName = 'test-sqlite'
    const projectPath = path.join(testDir, projectName)

    const answers: ProjectAnswers = {
      projectName,
      projectPath,
      database: 'sqlite',
      storage: 'local',
      useRedis: false,
      includeDocker: false,
      includeExamples: false,
    }

    await generateProject(answers)

    const packageJson = await fs.readJson(path.join(projectPath, 'package.json'))

    assert.property(packageJson.dependencies, 'better-sqlite3')
    assert.notProperty(packageJson.dependencies, 'pg')
  })

  test('should include Redis dependencies when enabled', async ({ assert }) => {
    const projectName = 'test-redis'
    const projectPath = path.join(testDir, projectName)

    const answers: ProjectAnswers = {
      projectName,
      projectPath,
      database: 'sqlite',
      storage: 'local',
      useRedis: true,
      includeDocker: false,
      includeExamples: false,
    }

    await generateProject(answers)

    const packageJson = await fs.readJson(path.join(projectPath, 'package.json'))

    assert.property(packageJson.dependencies, 'ioredis')
  })

  test('should include AWS SDK for OVH storage', async ({ assert }) => {
    const projectName = 'test-ovh'
    const projectPath = path.join(testDir, projectName)

    const answers: ProjectAnswers = {
      projectName,
      projectPath,
      database: 'sqlite',
      storage: 'ovh',
      useRedis: false,
      includeDocker: false,
      includeExamples: false,
    }

    await generateProject(answers)

    const packageJson = await fs.readJson(path.join(projectPath, 'package.json'))

    assert.property(packageJson.dependencies, '@aws-sdk/client-s3')
  })
})
