import { Command } from 'commander'
import chalk from 'chalk'
import { getProjectPrompts } from './prompts.js'
import { generateProject } from './generators/project.js'
import type { ProjectAnswers } from './types/index.js'

const program = new Command()

/**
 * Main CLI function to create a Digital Twin application.
 * Handles user prompts and orchestrates project generation.
 * 
 * @example
 * ```bash
 * npx create-digitaltwin
 * npx create-digitaltwin my-app
 * npm init digitaltwin my-project
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
    .action(async (projectName?: string) => {
      try {
        const answers: ProjectAnswers = await getProjectPrompts(projectName)
        await generateProject(answers)
        
        console.log(chalk.green.bold('\nProject created successfully!'))
        console.log(chalk.cyan('\nNext steps:'))
        console.log(chalk.white(`  cd ${answers.projectName}`))
        console.log(chalk.white('  npm install'))
        console.log(chalk.white('  npm run dev     # Start the development server'))
        console.log(chalk.white('  node dt test    # Run dry-run test'))
      } catch (error: any) {
        console.error(chalk.red('Error creating project:'), error.message)
        process.exit(1)
      }
    })

  await program.parseAsync()
}