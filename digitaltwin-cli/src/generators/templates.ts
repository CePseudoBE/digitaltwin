import { StringUtils } from '../utils/string_utils.js'

/** What the make:* commands pass to a template */
export interface TemplateData {
  name: string
  endpoint: string
  description?: string
  tags?: string[]
  schedule?: string
  sourceCollector?: string
  contentType?: string
  method?: string
  schemaKey?: string
  inputField?: string
}

/** A single-quoted TypeScript string literal, so quotes and backslashes in user input stay inert */
function quote(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
}

function list(items: string[] = []): string {
  return items.map(quote).join(', ')
}

function docBlock(description?: string): string {
  return description ? `/**\n * ${description.replace(/\*\//g, '*\\/')}\n */\n` : ''
}

function collector(data: TemplateData): string {
  return `import { Collector } from '@cepseudo/components'

${docBlock(data.description)}export class ${StringUtils.toPascalCase(data.name)} extends Collector {
  getConfiguration() {
    return {
      name: ${quote(data.endpoint)},
      description: ${quote(data.description ?? '')},
      contentType: 'application/json',
      endpoint: ${quote(data.endpoint)},
      tags: [${list(data.tags)}]
    }
  }

  async collect(): Promise<Buffer> {
    // TODO: Implement your data collection logic here
    // This method should return the collected data as a Buffer
    throw new Error('Collection logic not implemented')
  }

  getSchedule(): string {
    return ${quote(data.schedule || '0 */5 * * * *')}
  }
}
`
}

function harvester(data: TemplateData): string {
  return `import { Harvester } from '@cepseudo/components'
import type { DataRecord, HarvesterConfiguration } from '@cepseudo/shared'

${docBlock(data.description)}export class ${StringUtils.toPascalCase(data.name)} extends Harvester {
  getUserConfiguration(): HarvesterConfiguration {
    return {
      name: ${quote(data.endpoint)},
      description: ${quote(data.description ?? '')},
      contentType: 'application/json',
      endpoint: ${quote(data.endpoint)},
      source: ${quote(data.sourceCollector ?? '')},
      tags: [${list(data.tags)}]
    }
  }

  async harvest(
    sourceData: DataRecord | DataRecord[],
    dependenciesData: Record<string, DataRecord | DataRecord[] | null>
  ): Promise<Buffer> {
    // TODO: Implement your data harvesting/processing logic here
    // sourceData contains the data from the source collector
    // dependenciesData contains data from any configured dependencies
    throw new Error('Harvester logic not implemented')
  }
}
`
}

function handler(data: TemplateData): string {
  const input = `${StringUtils.toCamelCase(data.name)}Input`
  return `import { Handler } from '@cepseudo/components'
import { servableEndpoint, Type } from '@cepseudo/shared'
import type { DataResponse, Static, TypedRequest } from '@cepseudo/shared'

/** Validated by the engine before handleRequest runs (400 on mismatch) and published in the OpenAPI document */
const ${input} = Type.Object({
  // TODO: describe the fields your endpoint accepts
  example: Type.Optional(Type.String())
})

${docBlock(data.description)}export class ${StringUtils.toPascalCase(data.name)} extends Handler {
  getConfiguration() {
    return {
      name: ${quote(data.endpoint)},
      description: ${quote(data.description ?? '')},
      contentType: 'application/json',
      endpoint: ${quote(data.endpoint)},
      tags: [${list(data.tags)}]
    }
  }

  @servableEndpoint({ path: ${quote(`/api/${data.endpoint}`)}, method: ${quote(data.method ?? 'get')}, schema: { ${data.schemaKey ?? 'body'}: ${input} } })
  async handleRequest(req: TypedRequest): Promise<DataResponse> {
    const input = req.${data.inputField ?? 'body'} as Static<typeof ${input}>
    // TODO: Implement your endpoint logic here
    return {
      status: 200,
      content: JSON.stringify({ received: input }),
      headers: { 'Content-Type': 'application/json' }
    }
  }
}
`
}

function assetsManager(data: TemplateData): string {
  return `import { AssetsManager } from '@cepseudo/assets'

${docBlock(data.description)}export class ${StringUtils.toPascalCase(data.name)} extends AssetsManager {
  getConfiguration() {
    return {
      name: ${quote(data.endpoint)},
      description: ${quote(data.description ?? '')},
      contentType: ${quote(data.contentType || 'application/octet-stream')},
      endpoint: ${quote(data.endpoint)},
      tags: [${list(data.tags)}]
    }
  }
}
`
}

function tilesetManager(data: TemplateData): string {
  return `import { TilesetManager } from '@cepseudo/assets'
import type { AssetsManagerConfiguration } from '@cepseudo/shared'

${docBlock(data.description)}export class ${StringUtils.toPascalCase(data.name)} extends TilesetManager {
  getConfiguration(): AssetsManagerConfiguration {
    return {
      name: ${quote(data.endpoint)},
      description: ${quote(data.description ?? '')},
      contentType: 'application/zip',
      endpoint: ${quote(data.endpoint)},
      extension: '.zip',
      tags: ['tileset', 'assets', 'zip']
    }
  }
}
`
}

function mapManager(data: TemplateData): string {
  return `import { MapManager } from '@cepseudo/assets'
import type { AssetsManagerConfiguration } from '@cepseudo/shared'

${docBlock(data.description)}export class ${StringUtils.toPascalCase(data.name)} extends MapManager {
  getConfiguration(): AssetsManagerConfiguration {
    return {
      name: ${quote(data.endpoint)},
      description: ${quote(data.description ?? '')},
      contentType: 'application/json',
      endpoint: ${quote(data.endpoint)},
      extension: '.json',
      tags: ['map', 'layer', 'geojson', 'assets']
    }
  }
}
`
}

export const TEMPLATES = {
  collector,
  harvester,
  handler,
  assets_manager: assetsManager,
  tileset_manager: tilesetManager,
  map_manager: mapManager
} satisfies Record<string, (data: TemplateData) => string>

export type TemplateName = keyof typeof TEMPLATES
