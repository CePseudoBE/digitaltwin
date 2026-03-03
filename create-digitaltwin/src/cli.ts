import { Command } from 'commander'
import chalk from 'chalk'
import path from 'path'
import { getProjectPrompts } from './prompts.js'
import { generateProject } from './generators/project.js'
import type { ProjectAnswers, DatabaseType, StorageType } from './types/index.js'

interface CliOptions {
  yes?: boolean
  database?: string
  storage?: string
  redis?: boolean
  docker?: boolean
  examples?: boolean
  skipInstall?: boolean
  storagePath?: string
}

const program = new Command()

/**
 * Validates project name format
 */
function validateProjectName(name: string): boolean {
  return /^[a-z0-9-_]+$/.test(name)
}

/**
 * Validates database option
 */
function validateDatabase(db: string): db is DatabaseType {
  return db === 'sqlite' || db === 'postgresql'
}

/**
 * Validates storage option
 */
function validateStorage(storage: string): storage is StorageType {
  return storage === 'local' || storage === 'ovh'
}

/**
 * Main CLI function to create a Digital Twin application.
 * Handles user prompts and orchestrates project generation.
 * Supports both interactive and non-interactive modes.
 *
 * @example
 * ```bash
 * # Interactive mode
 * npx create-digitaltwin
 * npx create-digitaltwin my-app
 *
 * # Non-interactive mode
 * npx create-digitaltwin my-app --yes
 * npx create-digitaltwin my-app --yes --database postgresql --redis
 * ```
 */
export async function createDigitalTwinApp(): Promise<void> {
  console.log(chalk.blue.bold('Create Digital Twin App'))
  console.log(chalk.gray('Generate a new Digital Twin project with digitaltwin-core\n'))

  program
    .name('create-digitaltwin')
    .description('CLI to create Digital Twin applications')
    .version('0.1.0')
    .argument('[project-name]', 'name of the project')
    .option('-y, --yes', 'Skip prompts and use defaults')
    .option('--database <type>', 'Database type: sqlite, postgresql', 'sqlite')
    .option('--storage <type>', 'Storage type: local, ovh', 'local')
    .option('--storage-path <path>', 'Local storage directory path', './uploads')
    .option('--redis', 'Enable Redis for queue management')
    .option('--docker', 'Include Docker configuration files')
    .option('--examples', 'Include example components', true)
    .option('--no-examples', 'Skip example components')
    .option('--skip-install', 'Skip npm install after project creation')
    .action(async (projectName?: string, options?: CliOptions) => {
      try {
        let answers: ProjectAnswers

        if (options?.yes) {
          // Non-interactive mode
          if (!projectName) {
            console.error(chalk.red('Error: Project name is required when using --yes flag'))
            console.log(chalk.gray('Usage: create-digitaltwin my-app --yes'))
            process.exit(1)
          }

          if (!validateProjectName(projectName)) {
            console.error(
              chalk.red('Error: Project name must contain only lowercase letters, numbers, hyphens, and underscores')
            )
            process.exit(1)
          }

          const database = options.database || 'sqlite'
          const storage = options.storage || 'local'

          if (!validateDatabase(database)) {
            console.error(chalk.red(`Error: Invalid database type '${database}'. Use 'sqlite' or 'postgresql'`))
            process.exit(1)
          }

          if (!validateStorage(storage)) {
            console.error(chalk.red(`Error: Invalid storage type '${storage}'. Use 'local' or 'ovh'`))
            process.exit(1)
          }

          answers = {
            projectName,
            projectPath: path.resolve(process.cwd(), projectName),
            database,
            storage,
            localStoragePath: storage === 'local' ? options.storagePath || './uploads' : undefined,
            useRedis: options.redis ?? true,
            includeDocker: options.docker ?? false,
            includeExamples: options.examples ?? true,
          }

          console.log(chalk.cyan('Using configuration:'))
          console.log(chalk.gray(`  Project: ${answers.projectName}`))
          console.log(chalk.gray(`  Database: ${answers.database}`))
          console.log(chalk.gray(`  Storage: ${answers.storage}`))
          console.log(chalk.gray(`  Redis: ${answers.useRedis ? 'enabled' : 'disabled'}`))
          console.log(chalk.gray(`  Docker: ${answers.includeDocker ? 'included' : 'not included'}`))
          console.log(chalk.gray(`  Examples: ${answers.includeExamples ? 'included' : 'not included'}`))
          console.log()
        } else {
          // Interactive mode
          answers = await getProjectPrompts(projectName)
        }

        await generateProject(answers)

        console.log(chalk.green.bold('\nProject created successfully!'))
        console.log(chalk.cyan('\nNext steps:'))
        console.log(chalk.white(`  cd ${answers.projectName}`))

        if (!options?.skipInstall) {
          console.log(chalk.white('  npm install'))
        }

        console.log(chalk.white('  npm run dev     # Start the development server'))
        console.log(chalk.white('  node dt test    # Run dry-run test'))
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        console.error(chalk.red('Error creating project:'), message)
        process.exit(1)
      }
    })

  await program.parseAsync()
}
