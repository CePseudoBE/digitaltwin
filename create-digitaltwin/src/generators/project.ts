import { randomBytes } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import type { ProjectAnswers } from '../types/project-config.js'

/** Range of the @cepseudo/* packages and digitaltwin-cli in generated projects; bumped with each framework major */
export const FRAMEWORK_VERSION = '^2.0.0'

const POSTGRES = { user: 'digitaltwin', password: 'digitaltwin' }
const MINIO = { user: 'digitaltwin', password: 'digitaltwin-secret', bucket: 'digitaltwin' }
const MOCK_OIDC = { issuer: 'http://localhost:8080/default', audience: 'digitaltwin' }

/**
 * Writes a new project into `answers.projectPath`.
 *
 * @throws Error when the directory exists and is not empty, so nothing of the user's is overwritten
 */
export async function generateProject(answers: ProjectAnswers): Promise<void> {
  const existing = await fs.readdir(answers.projectPath).catch(() => [])
  if (existing.length > 0) {
    throw new Error(`${answers.projectPath} already exists and is not empty`)
  }
  const files = projectFiles(answers, randomBytes(32).toString('hex'))
  for (const [file, content] of Object.entries(files)) {
    const target = path.join(answers.projectPath, file)
    await fs.mkdir(path.dirname(target), { recursive: true })
    await fs.writeFile(target, content)
  }
}

/**
 * Every file of the project, by path relative to its root.
 *
 * @param secret - `AUTH_HEADER_SECRET` written to `.env` (`.env.example` gets a placeholder)
 */
export function projectFiles(answers: ProjectAnswers, secret: string): Record<string, string> {
  const files: Record<string, string> = {
    'package.json': packageJson(answers),
    'tsconfig.json': tsconfig(),
    'src/index.ts': indexFile(answers),
    '.env': envFile(answers, secret),
    '.env.example': envFile(answers, 'change-me'),
    '.gitignore': gitignore(),
    'README.md': readme(answers),
    'dt.js': "#!/usr/bin/env node\nimport 'digitaltwin-cli/bin/dt.js'\n",
  }
  if (answers.includeExamples) {
    files['src/components/jsonplaceholder_collector.ts'] = exampleCollector()
    files['src/components/index.ts'] = "export { JSONPlaceholderCollector } from './jsonplaceholder_collector.js'\n"
  }
  if (answers.includeDocker) {
    files['docker-compose.yml'] = dockerCompose(answers)
  }
  return files
}

function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`
}

function packageJson({ projectName, database, ngsiLd }: ProjectAnswers): string {
  const framework = ['engine', 'database', 'storage', 'shared', 'components', 'assets', ...(ngsiLd ? ['ngsi-ld'] : [])]
  return json({
    name: projectName,
    version: '0.1.0',
    private: true,
    type: 'module',
    scripts: {
      build: 'tsc',
      dev: 'tsx watch src/index.ts',
      start: 'node dist/index.js',
    },
    dependencies: {
      ...Object.fromEntries(framework.map(name => [`@cepseudo/${name}`, FRAMEWORK_VERSION])),
      // Declared optional by @cepseudo/storage and @cepseudo/database, yet both load them at import time
      '@aws-sdk/client-s3': '^3.1002.0',
      '@aws-sdk/s3-request-presigner': '^3.1002.0',
      kysely: '^0.29.5',
      ...(database === 'postgresql' ? { pg: '^8.20.0' } : { 'better-sqlite3': '^12.6.0' }),
      dotenv: '^17.2.1',
    },
    devDependencies: {
      '@types/node': '^24.1.0',
      'digitaltwin-cli': FRAMEWORK_VERSION,
      tsx: '^4.20.3',
      typescript: '^5.8.3',
    },
  })
}

function tsconfig(): string {
  return json({
    compilerOptions: {
      target: 'ES2022',
      module: 'NodeNext',
      moduleResolution: 'NodeNext',
      outDir: 'dist',
      rootDir: 'src',
      strict: true,
      skipLibCheck: true,
      experimentalDecorators: true,
      useDefineForClassFields: false,
    },
    include: ['src'],
  })
}

function indexFile({ database, storage, includeExamples }: ProjectAnswers): string {
  const storageClass = storage === 's3' ? 'S3StorageService' : 'LocalStorageService'

  const databaseEnv =
    database === 'postgresql'
      ? `  DB_HOST: Env.schema.string(),
  DB_PORT: Env.schema.number({ optional: true }),
  DB_USER: Env.schema.string(),
  DB_PASSWORD: Env.schema.string(),
  DB_NAME: Env.schema.string(),`
      : `  DB_PATH: Env.schema.string(),`

  const storageEnv =
    storage === 's3'
      ? `  S3_ENDPOINT: Env.schema.string({ format: 'url' }),
  S3_REGION: Env.schema.string({ optional: true }),
  S3_BUCKET: Env.schema.string(),
  S3_ACCESS_KEY_ID: Env.schema.string(),
  S3_SECRET_ACCESS_KEY: Env.schema.string(),
  S3_FORCE_PATH_STYLE: Env.schema.boolean({ optional: true }),
  S3_PUBLIC_URL: Env.schema.string({ optional: true }),`
      : `  LOCAL_STORAGE_DIR: Env.schema.string(),`

  const storageInit =
    storage === 's3'
      ? `new S3StorageService({
  endpoint: env.S3_ENDPOINT,
  region: env.S3_REGION,
  bucket: env.S3_BUCKET,
  accessKey: env.S3_ACCESS_KEY_ID,
  secretKey: env.S3_SECRET_ACCESS_KEY,
  pathStyle: env.S3_FORCE_PATH_STYLE,
  publicUrl: env.S3_PUBLIC_URL,
})`
      : `new LocalStorageService(env.LOCAL_STORAGE_DIR)`

  const databaseInit =
    database === 'postgresql'
      ? `KyselyDatabaseAdapter.forPostgreSQL(
  { host: env.DB_HOST, port: env.DB_PORT, user: env.DB_USER, password: env.DB_PASSWORD, database: env.DB_NAME },
  url => storage.retrieve(url)
)`
      : `KyselyDatabaseAdapter.forSQLite({ filename: env.DB_PATH }, url => storage.retrieve(url))`

  return `import 'dotenv/config'
import { DigitalTwinEngine, setupGracefulShutdown } from '@cepseudo/engine'
import { KyselyDatabaseAdapter } from '@cepseudo/database'
import { ${storageClass} } from '@cepseudo/storage'
import { Env } from '@cepseudo/shared'
${includeExamples ? "import { JSONPlaceholderCollector } from './components/index.js'\n" : ''}
// AUTH_MODE and the other authentication variables are read by the engine itself
const env = Env.validate({
  PORT: Env.schema.number({ optional: true }),
${databaseEnv}
${storageEnv}
  REDIS_HOST: Env.schema.string(),
  REDIS_PORT: Env.schema.number(),
})

const storage = ${storageInit}

const database = await ${databaseInit}

const engine = new DigitalTwinEngine({
  database,
  storage,
  redis: { host: env.REDIS_HOST, port: env.REDIS_PORT },
  server: { port: env.PORT ?? 3000 },
  collectors: [${includeExamples ? 'new JSONPlaceholderCollector()' : ''}],
})

setupGracefulShutdown(engine)
await engine.start()
`
}

function envFile({ projectName, database, storage, auth, ngsiLd, includeDocker }: ProjectAnswers, secret: string): string {
  const sections = ['NODE_ENV=development\nPORT=3000']

  sections.push(
    database === 'postgresql'
      ? `DB_HOST=localhost
DB_PORT=5432
DB_USER=${POSTGRES.user}
DB_PASSWORD=${POSTGRES.password}
DB_NAME=${projectName}`
      : `DB_PATH=./${projectName}.db`
  )

  sections.push(
    storage === 's3'
      ? `S3_ENDPOINT=http://localhost:9000
S3_REGION=us-east-1
S3_BUCKET=${MINIO.bucket}
S3_ACCESS_KEY_ID=${MINIO.user}
S3_SECRET_ACCESS_KEY=${MINIO.password}
# Bucket in the path rather than the host name, as MinIO needs
S3_FORCE_PATH_STYLE=true
# Base URL of public links, e.g. a CDN
# S3_PUBLIC_URL=`
      : 'LOCAL_STORAGE_DIR=./uploads'
  )

  sections.push('REDIS_HOST=localhost\nREDIS_PORT=6379')

  const authLines = [
    '# Authentication: none, oidc or trusted-headers (see the @cepseudo/auth README)',
    `AUTH_MODE=${auth}`,
    '# Role that makes a caller admin',
    '# AUTH_ADMIN_ROLE=admin',
  ]
  if (auth === 'oidc') {
    authLines.push(
      includeDocker
        ? '# The mock issuer of docker-compose.yml; use your identity provider in production'
        : '# Issuer of your identity provider and the audience its tokens carry',
      `OIDC_ISSUER=${MOCK_OIDC.issuer}`,
      `OIDC_AUDIENCE=${MOCK_OIDC.audience}`,
      '# OIDC_ROLES_CLAIM=roles'
    )
  }
  if (auth === 'trusted-headers') {
    authLines.push(
      '# The gateway sends it in x-auth-secret; requests without it are refused',
      `AUTH_HEADER_SECRET=${secret}`,
      '# AUTH_HEADER_SUBJECT=x-user-id',
      '# AUTH_HEADER_ROLES=x-user-roles'
    )
  }
  sections.push(authLines.join('\n'))

  if (ngsiLd) {
    sections.push('# NGSI-LD GET endpoints answer without a token unless this is false\n# NGSI_LD_PUBLIC_READ=true')
  }

  return `${sections.join('\n\n')}\n`
}

function gitignore(): string {
  return ['node_modules/', 'dist/', '.env', 'uploads/', '*.db', '*.db-shm', '*.db-wal', ''].join('\n')
}

function exampleCollector(): string {
  return `import { Collector } from '@cepseudo/components'

/**
 * Fetches five posts from the JSONPlaceholder API every five minutes; a starting point for your own collectors
 */
export class JSONPlaceholderCollector extends Collector {
  getConfiguration() {
    return {
      name: 'jsonplaceholder',
      description: 'Posts from the JSONPlaceholder API',
      contentType: 'application/json',
      endpoint: 'posts'
    }
  }

  async collect(): Promise<Buffer> {
    const response = await fetch('https://jsonplaceholder.typicode.com/posts?_limit=5')
    if (!response.ok) throw new Error(\`JSONPlaceholder answered \${response.status}\`)
    return Buffer.from(JSON.stringify(await response.json()))
  }

  getSchedule(): string {
    return '0 */5 * * * *'
  }
}
`
}

function dockerCompose({ projectName, database, storage, auth }: ProjectAnswers): string {
  const services = [
    `  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"`,
  ]
  const volumes: string[] = []

  if (database === 'postgresql') {
    services.push(`  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: ${POSTGRES.user}
      POSTGRES_PASSWORD: ${POSTGRES.password}
      POSTGRES_DB: ${projectName}
    ports:
      - "5432:5432"
    volumes:
      - postgres-data:/var/lib/postgresql/data`)
    volumes.push('  postgres-data:')
  }

  if (storage === 's3') {
    services.push(`  minio:
    image: pgsty/minio:RELEASE.2026-08-04T00-00-00Z
    command: server /data --console-address :9001
    environment:
      MINIO_ROOT_USER: ${MINIO.user}
      MINIO_ROOT_PASSWORD: ${MINIO.password}
    ports:
      - "9000:9000"
      - "9001:9001"
    volumes:
      - minio-data:/data`)
    services.push(`  minio-bucket:
    image: pgsty/mc:RELEASE.2026-09-16T00-00-00Z
    depends_on:
      - minio
    entrypoint:
      - sh
      - -c
      - until mc alias set local http://minio:9000 ${MINIO.user} ${MINIO.password}; do sleep 1; done && mc mb --ignore-existing local/${MINIO.bucket}`)
    volumes.push('  minio-data:')
  }

  if (auth === 'oidc') {
    services.push(`  # Development issuer: any client id and secret get a token, see the README
  oidc:
    image: ghcr.io/navikt/mock-oauth2-server:6.0.4
    ports:
      - "8080:8080"`)
  }

  const compose = `services:\n${services.join('\n\n')}\n`
  return volumes.length > 0 ? `${compose}\nvolumes:\n${volumes.join('\n')}\n` : compose
}

function readme({ projectName, database, storage, auth, ngsiLd, includeDocker }: ProjectAnswers): string {
  const services = [
    'Redis',
    ...(database === 'postgresql' ? ['PostgreSQL'] : []),
    ...(storage === 's3' ? ['MinIO'] : []),
    ...(auth === 'oidc' ? ['a mock OIDC issuer'] : []),
  ]

  const start = includeDocker
    ? `\`\`\`bash
docker compose up -d   # ${services.join(', ')}
npm install
npm run dev
\`\`\``
    : `Start ${services.join(', ')} and check the addresses in \`.env\`, then:

\`\`\`bash
npm install
npm run dev
\`\`\``

  const token =
    auth === 'oidc' && includeDocker
      ? `
## Calling the API with a token

The mock issuer gives a token to any client id and secret; the client id becomes the user's subject:

\`\`\`bash
TOKEN=$(curl -s -X POST ${MOCK_OIDC.issuer}/token \\
  -d grant_type=client_credentials -d client_id=dev -d client_secret=dev -d scope=${MOCK_OIDC.audience} \\
  | node -pe "JSON.parse(require('fs').readFileSync(0)).access_token")
\`\`\`

Send it as \`Authorization: Bearer $TOKEN\` to the endpoints that need a user, such as uploads.
`
      : ''

  return `# ${projectName}

A Digital Twin application on the [\`@cepseudo/*\` packages](https://github.com/CePseudoBE/digitaltwin).

- Database: ${database === 'postgresql' ? 'PostgreSQL' : 'SQLite'}
- File storage: ${storage === 's3' ? 'S3-compatible object storage' : 'local directory'}
- Authentication: \`AUTH_MODE=${auth}\`${ngsiLd ? '\n- NGSI-LD API: `@cepseudo/ngsi-ld`' : ''}

## Getting started

${start}

\`.env\` holds the development settings and \`.env.example\` documents them. The server listens on http://localhost:3000; \`/api/health\` reports the state of each service.
${token}
## Adding components

\`\`\`bash
node dt make:collector Weather --description "Weather data"
node dt make:harvester DailyAverage --source weather
node dt make:handler Status --method get
node dt make:assets-manager Models --content-type model/gltf-binary
\`\`\`

Then register the new class in \`src/index.ts\`.

## Scripts

- \`npm run dev\`: start with reload on change
- \`npm run build\`: compile to \`dist/\`
- \`npm start\`: run the compiled app
`
}
