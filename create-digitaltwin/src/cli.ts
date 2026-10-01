import { Command, InvalidArgumentError, Option } from 'commander'
import { intro, log, note, outro } from '@clack/prompts'
import path from 'node:path'
import { askProjectAnswers } from './prompts.js'
import { generateProject } from './generators/project.js'
import { AUTH_MODES, DATABASES, STORAGES, isValidProjectName } from './types/project-config.js'
import type { AuthMode, DatabaseType, ProjectAnswers, StorageType } from './types/project-config.js'

interface CliOptions {
  yes?: boolean
  database: DatabaseType
  storage: StorageType
  auth: AuthMode
  ngsiLd: boolean
  docker: boolean
  examples: boolean
}

function parseProjectName(name: string): string {
  if (!isValidProjectName(name)) {
    throw new InvalidArgumentError('Use lowercase letters, numbers, hyphens and underscores only.')
  }
  return name
}

function answersFromFlags(projectName: string | undefined, options: CliOptions): ProjectAnswers {
  if (!projectName) {
    throw new Error('A project name is required with --yes, e.g. create-digitaltwin my-app --yes')
  }
  return {
    projectName,
    projectPath: path.resolve(projectName),
    database: options.database,
    storage: options.storage,
    auth: options.auth,
    ngsiLd: options.ngsiLd,
    includeDocker: options.docker,
    includeExamples: options.examples,
  }
}

function nextSteps(answers: ProjectAnswers): string {
  return [
    `cd ${answers.projectName}`,
    ...(answers.includeDocker ? ['docker compose up -d'] : []),
    'npm install',
    'npm run dev',
  ].join('\n')
}

/**
 * Creates a Digital Twin application, asking for each choice or, with `--yes`, taking them from the flags.
 *
 * @example
 * ```bash
 * npx create-digitaltwin
 * npx create-digitaltwin my-app --yes --database postgresql --storage s3 --auth oidc --ngsi-ld
 * ```
 */
export async function createDigitalTwinApp(): Promise<void> {
  const program = new Command()
    .name('create-digitaltwin')
    .description('Create a Digital Twin application on the @cepseudo/* packages')
    .argument('[project-name]', 'directory and package name', parseProjectName)
    .option('-y, --yes', 'skip the prompts and use the flags below')
    .addOption(new Option('--database <type>', 'database').choices(DATABASES).default('sqlite'))
    .addOption(new Option('--storage <type>', 'file storage').choices(STORAGES).default('local'))
    .addOption(new Option('--auth <mode>', 'AUTH_MODE').choices(AUTH_MODES).default('none'))
    .option('--ngsi-ld', 'add the NGSI-LD API', false)
    .option('--no-docker', 'skip docker-compose.yml')
    .option('--no-examples', 'skip the example collector')
    .action(async (projectName: string | undefined, options: CliOptions) => {
      intro('create-digitaltwin')
      const answers = options.yes ? answersFromFlags(projectName, options) : await askProjectAnswers(projectName)
      await generateProject(answers)
      log.success(`Created ${answers.projectPath}`)
      note(nextSteps(answers), 'Next steps')
      outro('Done')
    })

  await program.parseAsync()
}
