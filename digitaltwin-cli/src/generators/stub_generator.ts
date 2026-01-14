import { compile } from 'tempura'
import fs from 'fs-extra'
import path from 'path'
import { StringUtils } from '../utils/string_utils.js'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/**
 * Generates code from stub templates using Tempura
 */
export class StubGenerator {
  private stubsDir: string
  
  constructor() {
    // Find stubs directory by looking up from the current file location
    // This works both in development (src/) and production (dist/)
    let currentDir = __dirname
    let stubsDir = null
    
    // Look up the directory tree to find the stubs folder
    while (currentDir !== path.dirname(currentDir)) {
      const potentialStubsDir = path.join(currentDir, 'stubs')
      if (fs.existsSync(potentialStubsDir)) {
        stubsDir = potentialStubsDir
        break
      }
      currentDir = path.dirname(currentDir)
    }
    
    if (!stubsDir) {
      throw new Error('Could not locate stubs directory')
    }
    
    this.stubsDir = stubsDir
  }
  
  /**
   * Generate content from a stub template
   */
  async generate(stubName: string, data: Record<string, any>): Promise<string> {
    const stubPath = path.join(this.stubsDir, `${stubName}.stub`)
    
    if (!await fs.pathExists(stubPath)) {
      throw new Error(`Stub template not found: ${stubName}.stub`)
    }
    
    const template = await fs.readFile(stubPath, 'utf8')
    const render = compile(template, { loose: true })
    
    // Add naming utilities to template data
    const templateData = {
      ...data,
      // Generate all naming variants if name is provided
      ...(data.name ? StringUtils.generateNamingVariants(data.name) : {}),
      // Helper functions available in templates
      helpers: {
        pascalCase: StringUtils.toPascalCase,
        camelCase: StringUtils.toCamelCase,
        snakeCase: StringUtils.toSnakeCase,
        kebabCase: StringUtils.toKebabCase
      }
    }
    
    return render(templateData)
  }
  
  /**
   * Write generated content to file
   */
  async writeFile(
    content: string, 
    fileName: string, 
    targetDir: string,
    options: { force?: boolean } = {}
  ): Promise<string> {
    const filePath = path.join(targetDir, fileName)
    
    // Check if file exists and force flag
    if (await fs.pathExists(filePath) && !options.force) {
      throw new Error(`File already exists: ${filePath}. Use --force to overwrite.`)
    }
    
    // Ensure directory exists
    await fs.ensureDir(path.dirname(filePath))
    
    // Write file
    await fs.writeFile(filePath, content, 'utf8')
    
    return filePath
  }
  
  /**
   * Get all available stub templates
   */
  async getAvailableStubs(): Promise<string[]> {
    try {
      const files = await fs.readdir(this.stubsDir)
      return files
        .filter(file => file.endsWith('.stub'))
        .map(file => file.replace('.stub', ''))
    } catch {
      return []
    }
  }
}