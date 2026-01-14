/**
 * Supported database types for Digital Twin projects
 */
export type DatabaseType = 'sqlite' | 'postgresql'

/**
 * Supported storage service types
 */
export type StorageType = 'local' | 'ovh'

/**
 * User answers collected from CLI prompts for project configuration
 */
export interface ProjectAnswers {
  /** Name of the project (used for directory and package name) */
  projectName: string
  /** Full path where the project will be created */
  projectPath: string
  /** Database type selection */
  database: DatabaseType
  /** Storage service selection */
  storage: StorageType
  /** Local storage directory path (only for local storage) */
  localStoragePath?: string
  /** Whether to include Redis for queue management */
  useRedis: boolean
  /** Whether to include Docker configuration files */
  includeDocker: boolean
  /** Whether to include example components */
  includeExamples: boolean
}

/**
 * Package.json dependencies object
 */
export interface PackageJsonDependencies {
  [key: string]: string
}

/**
 * Package.json configuration structure
 */
export interface PackageJsonConfig {
  /** Package name */
  name: string
  /** Package version */
  version: string
  /** Package description */
  description: string
  /** Main entry point */
  main: string
  /** Module type ("module" for ESM) */
  type: string
  /** NPM scripts */
  scripts: Record<string, string>
  /** Binary commands */
  bin: Record<string, string>
  /** Production dependencies */
  dependencies: PackageJsonDependencies
  /** Development dependencies */
  devDependencies: PackageJsonDependencies
}

/**
 * Database configuration options for different database types
 */
export interface DatabaseConfig {
  /** PostgreSQL configuration */
  postgresql: {
    client: 'pg'
    connection: {
      host: string
      port: number
      user: string
      password: string
      database: string
    }
  }
  /** SQLite configuration */
  sqlite: {
    client: 'sqlite3'
    connection: {
      filename: string
    }
    useNullAsDefault: boolean
  }
}

/**
 * Storage configuration options for different storage types
 */
export interface StorageConfig {
  /** Local filesystem storage path */
  local: string
  /** OVH Object Storage (S3-compatible) configuration */
  ovh: {
    accessKey: string
    secretKey: string
    endpoint: string
    region: string
    bucket: string
  }
}

/**
 * Template data used for generating project files
 */
export interface TemplateData {
  /** Project name */
  projectName: string
  /** Selected database type */
  database: DatabaseType
  /** Selected storage type */
  storage: StorageType
  /** Local storage path (for local storage only) */
  localStoragePath?: string
  /** Whether Redis is enabled */
  useRedis: boolean
  /** Whether to include example components */
  includeExamples: boolean
}