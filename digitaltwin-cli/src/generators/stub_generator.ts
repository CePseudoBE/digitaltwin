import { existsSync } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { TEMPLATES } from './templates.js'
import type { TemplateData, TemplateName } from './templates.js'

/**
 * Generates component source files from the code templates
 */
export class StubGenerator {
  /**
   * Generate content from a template
   */
  async generate(stubName: TemplateName, data: TemplateData): Promise<string> {
    return TEMPLATES[stubName](data)
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

    if (existsSync(filePath) && !options.force) {
      throw new Error(`File already exists: ${filePath}. Use --force to overwrite.`)
    }

    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, content, 'utf8')

    return filePath
  }

  /**
   * Get all available templates
   */
  async getAvailableStubs(): Promise<string[]> {
    return Object.keys(TEMPLATES)
  }
}
