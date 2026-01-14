import fs from 'fs-extra'
import path from 'path'

/**
 * Detects if current directory is a valid digitaltwin-core project
 */
export class ProjectDetector {
  /**
   * Check if we're in a digitaltwin-core project
   */
  async isDigitalTwinProject(cwd: string = process.cwd()): Promise<boolean> {
    try {
      const packageJsonPath = path.join(cwd, 'package.json')
      
      if (!await fs.pathExists(packageJsonPath)) {
        return false
      }
      
      const packageJson = await fs.readJson(packageJsonPath)
      
      // Check if digitaltwin-core is in dependencies
      const dependencies = packageJson.dependencies || {}
      const devDependencies = packageJson.devDependencies || {}
      
      return 'digitaltwin-core' in dependencies || 'digitaltwin-core' in devDependencies
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
      const packageJson = await fs.readJson(packageJsonPath)
      
      const srcDir = await fs.pathExists(path.join(cwd, 'src')) ? 'src' : '.'
      const hasTypeScript = await fs.pathExists(path.join(cwd, 'tsconfig.json'))
      
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
        'This command must be run inside a digitaltwin-core project.\n' +
        'Make sure you have digitaltwin-core in your dependencies.'
      )
    }
  }
}