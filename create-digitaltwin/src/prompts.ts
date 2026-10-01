import { cancel, confirm, group, select, text } from '@clack/prompts'
import path from 'node:path'
import { isValidProjectName } from './types/project-config.js'
import type { AuthMode, DatabaseType, ProjectAnswers, StorageType } from './types/project-config.js'

/** Asks every question in the terminal; Ctrl+C exits with code 1 */
export async function askProjectAnswers(initialProjectName?: string): Promise<ProjectAnswers> {
  const answers = await group(
    {
      projectName: () =>
        text({
          message: 'Project name',
          initialValue: initialProjectName,
          placeholder: 'my-digitaltwin-app',
          defaultValue: 'my-digitaltwin-app',
          validate: value =>
            !value || isValidProjectName(value)
              ? undefined
              : 'Use lowercase letters, numbers, hyphens and underscores only',
        }),
      database: () =>
        select<DatabaseType>({
          message: 'Database',
          options: [
            { value: 'sqlite', label: 'SQLite', hint: 'a file, nothing to run' },
            { value: 'postgresql', label: 'PostgreSQL' },
          ],
        }),
      storage: () =>
        select<StorageType>({
          message: 'File storage',
          options: [
            { value: 'local', label: 'Local directory' },
            { value: 's3', label: 'S3-compatible object storage', hint: 'AWS S3, MinIO, Scaleway, ...' },
          ],
        }),
      auth: () =>
        select<AuthMode>({
          message: 'Authentication (AUTH_MODE)',
          options: [
            { value: 'none', label: 'none', hint: 'development only, every request is anonymous' },
            { value: 'oidc', label: 'oidc', hint: 'Bearer tokens from an OIDC identity provider' },
            { value: 'trusted-headers', label: 'trusted-headers', hint: 'identity headers set by a gateway' },
          ],
        }),
      ngsiLd: () => confirm({ message: 'Add the NGSI-LD API (@cepseudo/ngsi-ld)?', initialValue: false }),
      includeDocker: () =>
        confirm({ message: 'Generate a docker-compose.yml for the local services?', initialValue: true }),
      includeExamples: () => confirm({ message: 'Include an example collector?', initialValue: true }),
    },
    {
      onCancel: () => {
        cancel('Cancelled.')
        process.exit(1)
      },
    }
  )

  return { ...answers, projectPath: path.resolve(answers.projectName) }
}
