export const DATABASES = ['sqlite', 'postgresql'] as const
export type DatabaseType = (typeof DATABASES)[number]

export const STORAGES = ['local', 's3'] as const
export type StorageType = (typeof STORAGES)[number]

/** The `AUTH_MODE` values a new project can start with (`gateway` is deprecated) */
export const AUTH_MODES = ['none', 'oidc', 'trusted-headers'] as const
export type AuthMode = (typeof AUTH_MODES)[number]

/** What the prompts or the command-line flags decided */
export interface ProjectAnswers {
  /** Directory and package name */
  projectName: string
  /** Absolute path of the directory to create */
  projectPath: string
  database: DatabaseType
  storage: StorageType
  auth: AuthMode
  /** Install the optional NGSI-LD plugin */
  ngsiLd: boolean
  /** docker-compose.yml with the services the choices need */
  includeDocker: boolean
  /** An example collector in src/components */
  includeExamples: boolean
}

export function isValidProjectName(name: string): boolean {
  return /^[a-z0-9-_]+$/.test(name)
}
