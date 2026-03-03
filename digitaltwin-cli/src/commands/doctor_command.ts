import { BaseCommand } from './base_command.js'
import fs from 'fs-extra'
import path from 'path'

interface CheckResult {
  name: string
  success: boolean
  message: string
  suggestion?: string
}

/**
 * Checks project health and configuration
 */
export class DoctorCommand extends BaseCommand {
  static override commandName = 'doctor'
  static override description = 'Check project health and configuration'

  override async run(): Promise<void> {
    this.info('Running project diagnostics...\n')

    const cwd = process.cwd()
    const results: CheckResult[] = []

    // Run all checks
    results.push(await this.checkPackageJson(cwd))
    results.push(await this.checkTsConfig(cwd))
    results.push(await this.checkNodeModules(cwd))
    results.push(await this.checkComponentsDir(cwd))
    results.push(await this.checkEnvFile(cwd))

    // Display results
    let hasErrors = false
    let hasWarnings = false

    for (const result of results) {
      if (result.success) {
        this.success(`${result.name}: ${result.message}`)
      } else {
        hasErrors = true
        this.logger.error(`${result.name}: ${result.message}`)
        if (result.suggestion) {
          this.info(`  -> ${result.suggestion}`)
        }
      }
    }

    // Summary
    this.logger.log('')
    if (hasErrors) {
      this.logger.error('Some issues were found. Please fix them before continuing.')
      this.exitCode = 1
    } else if (hasWarnings) {
      this.warning('Some warnings were found. Consider addressing them.')
    } else {
      this.success('All checks passed!')
    }
  }

  private async checkPackageJson(cwd: string): Promise<CheckResult> {
    const packageJsonPath = path.join(cwd, 'package.json')

    if (!(await fs.pathExists(packageJsonPath))) {
      return {
        name: 'package.json',
        success: false,
        message: 'File not found',
        suggestion: 'Run npm init or ensure you are in a project directory',
      }
    }

    try {
      const packageJson = await fs.readJson(packageJsonPath)
      const deps = { ...packageJson.dependencies, ...packageJson.devDependencies }

      if (!deps['digitaltwin-core']) {
        return {
          name: 'package.json',
          success: false,
          message: 'digitaltwin-core dependency not found',
          suggestion: 'Run: npm install digitaltwin-core',
        }
      }

      return {
        name: 'package.json',
        success: true,
        message: `Found digitaltwin-core@${deps['digitaltwin-core']}`,
      }
    } catch {
      return {
        name: 'package.json',
        success: false,
        message: 'Failed to parse package.json',
        suggestion: 'Ensure package.json contains valid JSON',
      }
    }
  }

  private async checkTsConfig(cwd: string): Promise<CheckResult> {
    const tsconfigPath = path.join(cwd, 'tsconfig.json')

    if (!(await fs.pathExists(tsconfigPath))) {
      return {
        name: 'tsconfig.json',
        success: false,
        message: 'File not found',
        suggestion: 'Run: npx tsc --init',
      }
    }

    try {
      const tsconfig = await fs.readJson(tsconfigPath)

      // Check for common required settings
      const compilerOptions = tsconfig.compilerOptions || {}

      if (compilerOptions.module !== 'ESNext' && compilerOptions.module !== 'NodeNext') {
        return {
          name: 'tsconfig.json',
          success: false,
          message: `module is "${compilerOptions.module}", expected "ESNext" or "NodeNext"`,
          suggestion: 'Set "module": "ESNext" in compilerOptions',
        }
      }

      return {
        name: 'tsconfig.json',
        success: true,
        message: 'Configuration looks good',
      }
    } catch {
      return {
        name: 'tsconfig.json',
        success: false,
        message: 'Failed to parse tsconfig.json',
        suggestion: 'Ensure tsconfig.json contains valid JSON',
      }
    }
  }

  private async checkNodeModules(cwd: string): Promise<CheckResult> {
    const nodeModulesPath = path.join(cwd, 'node_modules')

    if (!(await fs.pathExists(nodeModulesPath))) {
      return {
        name: 'node_modules',
        success: false,
        message: 'Directory not found',
        suggestion: 'Run: npm install',
      }
    }

    // Check if digitaltwin-core is installed
    const corePath = path.join(nodeModulesPath, 'digitaltwin-core')
    if (!(await fs.pathExists(corePath))) {
      return {
        name: 'node_modules',
        success: false,
        message: 'digitaltwin-core not installed',
        suggestion: 'Run: npm install',
      }
    }

    return {
      name: 'node_modules',
      success: true,
      message: 'Dependencies installed',
    }
  }

  private async checkComponentsDir(cwd: string): Promise<CheckResult> {
    const srcDir = (await fs.pathExists(path.join(cwd, 'src'))) ? 'src' : '.'
    const componentsDir = path.join(cwd, srcDir, 'components')

    if (!(await fs.pathExists(componentsDir))) {
      return {
        name: 'components',
        success: true, // Not an error, just no components yet
        message: 'No components directory (will be created when you add components)',
      }
    }

    const files = await fs.readdir(componentsDir)
    const componentFiles = files.filter(
      (f) =>
        f.endsWith('_collector.ts') ||
        f.endsWith('_handler.ts') ||
        f.endsWith('_harvester.ts') ||
        f.endsWith('_assets_manager.ts') ||
        f.endsWith('_tileset_manager.ts') ||
        f.endsWith('_map_manager.ts')
    )

    return {
      name: 'components',
      success: true,
      message: `Found ${componentFiles.length} component(s)`,
    }
  }

  private async checkEnvFile(cwd: string): Promise<CheckResult> {
    const envPath = path.join(cwd, '.env')
    const envExamplePath = path.join(cwd, '.env.example')

    if (!(await fs.pathExists(envPath))) {
      if (await fs.pathExists(envExamplePath)) {
        return {
          name: '.env',
          success: false,
          message: 'File not found',
          suggestion: 'Copy .env.example to .env and configure it',
        }
      }
      return {
        name: '.env',
        success: true,
        message: 'No .env file (optional)',
      }
    }

    return {
      name: '.env',
      success: true,
      message: 'Environment file found',
    }
  }
}
