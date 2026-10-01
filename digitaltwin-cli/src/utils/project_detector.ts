import { existsSync } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'path'

/**
 * Detects if current directory is a Digital Twin project
 */
export class ProjectDetector {
  /**
   * Check if we're in a Digital Twin project (one that depends on @cepseudo/engine)
   */
  async isDigitalTwinProject(cwd: string = process.cwd()): Promise<boolean> {
    try {
      const packageJsonPath = path.join(cwd, 'package.json')
      
      if (!existsSync(packageJsonPath)) {
        return false
      }
      
      const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'))
      
      const dependencies = packageJson.dependencies || {}
      const devDependencies = packageJson.devDependencies || {}

      return '@cepseudo/engine' in dependencies || '@cepseudo/engine' in devDependencies
    } catch {
      return false
    }
  }
  
  /**
   * Get project info (name, version, etc.)
   */
  async getProjectInfo(cwd: string = process.cwd()): Promise<{
    name: string
    version: string
    hasTypeScript: boolean
    srcDir: string
  } | null> {
    try {
      const packageJsonPath = path.join(cwd, 'package.json')
      const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'))
      
      const srcDir = existsSync(path.join(cwd, 'src')) ? 'src' : '.'
      const hasTypeScript = existsSync(path.join(cwd, 'tsconfig.json'))
      
      return {
        name: packageJson.name || 'unknown',
        version: packageJson.version || '1.0.0',
        hasTypeScript,
        srcDir
      }
    } catch {
      return null
    }
  }
  
  /**
   * Ensure we're in a valid project or throw error
   */
  async validateProject(cwd: string = process.cwd()): Promise<void> {
    const isProject = await this.isDigitalTwinProject(cwd)
    
    if (!isProject) {
      throw new Error(
        'This command must be run inside a Digital Twin project.\n' +
        'Make sure you have @cepseudo/engine in your dependencies.'
      )
    }
  }
}