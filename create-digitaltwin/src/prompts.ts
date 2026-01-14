import prompts, { PromptObject } from 'prompts'
import path from 'path'
import type { ProjectAnswers } from './types/index.js'

/**
 * Collects user input for Digital Twin project configuration.
 * Prompts for project name, database, storage, and feature options.
 * 
 * @param initialProjectName - Optional initial project name
 * @returns Promise resolving to user's configuration choices
 * 
 * @example
 * ```typescript
 * const answers = await getProjectPrompts('my-digitaltwin')
 * console.log(answers.projectName) // 'my-digitaltwin'
 * console.log(answers.database)    // 'sqlite' or 'postgresql'
 * ```
 */
export async function getProjectPrompts(initialProjectName?: string): Promise<ProjectAnswers> {
  const questions: PromptObject[] = [
    {
      type: 'text',
      name: 'projectName',
      message: 'Project name:',
      initial: initialProjectName || 'my-digitaltwin-app',
      validate: (value: string) => {
        if (!value.trim()) return 'Project name is required'
        if (!/^[a-z0-9-_]+$/.test(value)) return 'Project name must contain only lowercase letters, numbers, hyphens, and underscores'
        return true
      }
    },
    {
      type: 'select',
      name: 'database',
      message: 'Choose your database:',
      choices: [
        { title: 'SQLite (File-based, good for development)', value: 'sqlite' },
        { title: 'PostgreSQL (Production-ready)', value: 'postgresql' }
      ],
      initial: 0
    },
    {
      type: 'select',
      name: 'storage',
      message: 'Choose your storage service:',
      choices: [
        { title: 'Local Storage (File system)', value: 'local' },
        { title: 'OVH Object Storage (S3-compatible)', value: 'ovh' }
      ],
      initial: 0
    },
    {
      type: (prev: string) => prev === 'local' ? 'text' : null,
      name: 'localStoragePath',
      message: 'Local storage directory:',
      initial: './uploads',
      validate: (value: string) => {
        if (!value.trim()) return 'Storage path is required'
        return true
      }
    },
    {
      type: 'confirm',
      name: 'useRedis',
      message: 'Use Redis for queue management?',
      initial: true
    },
    {
      type: 'confirm',
      name: 'includeDocker',
      message: 'Include Docker configuration?',
      initial: false
    },
    {
      type: 'confirm',
      name: 'includeExamples',
      message: 'Include example components?',
      initial: true
    }
  ]

  const answers = await prompts(questions, {
    onCancel: () => {
      console.log('Operation cancelled.')
      process.exit(1)
    }
  }) as ProjectAnswers

  // Normalize project name and create full path
  answers.projectPath = path.resolve(process.cwd(), answers.projectName)
  
  return answers
}