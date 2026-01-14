/**
 * @fileoverview OpenAPI specification generator for Digital Twin components
 *
 * This module provides utilities to automatically generate OpenAPI 3.0
 * documentation from Digital Twin components that implement OpenAPIDocumentable.
 */

import type {
    OpenAPIDocument,
    OpenAPIGeneratorOptions,
    OpenAPITag,
    OpenAPISchema,
    OpenAPIComponents,
    OpenAPISecurityScheme
} from './types.js'
import { isOpenAPIDocumentable } from './types.js'

/**
 * Generates OpenAPI 3.0 specifications from Digital Twin components.
 *
 * The generator aggregates OpenAPI specs from all components that implement
 * the OpenAPIDocumentable interface and produces a complete OpenAPI document.
 *
 * @example
 * ```typescript
 * import { OpenAPIGenerator } from 'digitaltwin-core'
 * import * as components from './src/components'
 *
 * const spec = OpenAPIGenerator.generate({
 *   info: {
 *     title: 'My Digital Twin API',
 *     version: '1.0.0',
 *     description: 'API documentation'
 *   },
 *   components: Object.values(components),
 *   servers: [{ url: 'http://localhost:3000' }]
 * })
 *
 * // Write to file
 * OpenAPIGenerator.writeYAML(spec, './openapi.yaml')
 * ```
 */
export class OpenAPIGenerator {
    /**
     * Generates an OpenAPI document from the provided components.
     *
     * @param options - Generation options including components and metadata
     * @returns Complete OpenAPI document
     */
    static generate(options: OpenAPIGeneratorOptions): OpenAPIDocument {
        const { info, servers, components, additionalSchemas, additionalTags, includeAuth = true } = options

        // Filter components that implement OpenAPIDocumentable
        const documentableComponents = components.filter(isOpenAPIDocumentable)

        // Aggregate paths, tags, and schemas from all components
        const allPaths: OpenAPIDocument['paths'] = {}
        const allTags: OpenAPITag[] = additionalTags ? [...additionalTags] : []
        const allSchemas: Record<string, OpenAPISchema> = additionalSchemas ? { ...additionalSchemas } : {}
        const tagNames = new Set<string>(additionalTags?.map(t => t.name) || [])

        for (const component of documentableComponents) {
            try {
                const spec = component.getOpenAPISpec()

                // Merge paths
                for (const [path, pathItem] of Object.entries(spec.paths)) {
                    if (allPaths[path]) {
                        // Merge operations into existing path
                        allPaths[path] = { ...allPaths[path], ...pathItem }
                    } else {
                        allPaths[path] = pathItem
                    }
                }

                // Merge tags (avoid duplicates)
                if (spec.tags) {
                    for (const tag of spec.tags) {
                        if (!tagNames.has(tag.name)) {
                            allTags.push(tag)
                            tagNames.add(tag.name)
                        }
                    }
                }

                // Merge schemas
                if (spec.schemas) {
                    Object.assign(allSchemas, spec.schemas)
                }
            } catch (error) {
                const componentName =
                    'getConfiguration' in component
                        ? (component as { getConfiguration: () => { name: string } }).getConfiguration().name
                        : 'unknown'
                console.warn(`Warning: Failed to get OpenAPI spec from component "${componentName}":`, error)
            }
        }

        // Sort tags alphabetically
        allTags.sort((a, b) => a.name.localeCompare(b.name))

        // Build components section
        const componentsSection: OpenAPIComponents = {}

        if (Object.keys(allSchemas).length > 0) {
            componentsSection.schemas = allSchemas
        }

        if (includeAuth) {
            componentsSection.securitySchemes = this.getDefaultSecuritySchemes()
        }

        // Build final document
        const document: OpenAPIDocument = {
            openapi: '3.0.3',
            info,
            paths: allPaths
        }

        if (servers && servers.length > 0) {
            document.servers = servers
        }

        if (allTags.length > 0) {
            document.tags = allTags
        }

        if (Object.keys(componentsSection).length > 0) {
            document.components = componentsSection
        }

        return document
    }

    /**
     * Returns default security schemes for APISIX/Keycloak authentication.
     */
    private static getDefaultSecuritySchemes(): Record<string, OpenAPISecurityScheme> {
        return {
            ApiKeyAuth: {
                type: 'apiKey',
                in: 'header',
                name: 'x-user-id',
                description: 'Keycloak user ID (forwarded by APISIX)'
            }
        }
    }

    /**
     * Converts an OpenAPI document to YAML string.
     *
     * @param document - OpenAPI document to convert
     * @returns YAML string representation
     */
    static toYAML(document: OpenAPIDocument): string {
        return this.objectToYAML(document, 0)
    }

    /**
     * Converts an OpenAPI document to JSON string.
     *
     * @param document - OpenAPI document to convert
     * @param pretty - Whether to format with indentation (default: true)
     * @returns JSON string representation
     */
    static toJSON(document: OpenAPIDocument, pretty = true): string {
        return JSON.stringify(document, null, pretty ? 2 : undefined)
    }

    /**
     * Recursively converts an object to YAML format.
     * Simple implementation without external dependencies.
     */
    private static objectToYAML(obj: unknown, indent: number): string {
        const spaces = '  '.repeat(indent)

        if (obj === null || obj === undefined) {
            return 'null'
        }

        if (typeof obj === 'string') {
            // Check if string needs quoting
            if (
                obj === '' ||
                obj.includes(':') ||
                obj.includes('#') ||
                obj.includes('\n') ||
                obj.includes('"') ||
                obj.includes("'") ||
                obj.startsWith(' ') ||
                obj.endsWith(' ') ||
                obj === 'true' ||
                obj === 'false' ||
                obj === 'null' ||
                /^[\d.]+$/.test(obj)
            ) {
                // Use double quotes and escape
                return `"${obj.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`
            }
            return obj
        }

        if (typeof obj === 'number' || typeof obj === 'boolean') {
            return String(obj)
        }

        if (Array.isArray(obj)) {
            if (obj.length === 0) {
                return '[]'
            }

            const items = obj.map(item => {
                const value = this.objectToYAML(item, indent + 1)
                if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
                    // Object in array - put first property on same line as dash
                    const lines = value.split('\n')
                    if (lines.length > 0) {
                        return `${spaces}- ${lines[0].trimStart()}\n${lines.slice(1).join('\n')}`
                    }
                }
                return `${spaces}- ${value}`
            })

            return items.join('\n').replace(/\n+$/, '')
        }

        if (typeof obj === 'object') {
            const entries = Object.entries(obj as Record<string, unknown>)
            if (entries.length === 0) {
                return '{}'
            }

            const lines = entries.map(([key, value]) => {
                // Handle special keys that need quoting
                const quotedKey = /[:\s#[\]{}]/.test(key) ? `"${key}"` : key

                if (value === null || value === undefined) {
                    return `${spaces}${quotedKey}: null`
                }

                if (typeof value === 'object' && !Array.isArray(value) && Object.keys(value as object).length > 0) {
                    return `${spaces}${quotedKey}:\n${this.objectToYAML(value, indent + 1)}`
                }

                if (Array.isArray(value) && value.length > 0) {
                    return `${spaces}${quotedKey}:\n${this.objectToYAML(value, indent + 1)}`
                }

                return `${spaces}${quotedKey}: ${this.objectToYAML(value, indent + 1)}`
            })

            return lines.join('\n')
        }

        return String(obj)
    }

    /**
     * Helper to create a simple schema reference.
     */
    static schemaRef(name: string): OpenAPISchema {
        return { $ref: `#/components/schemas/${name}` }
    }

    /**
     * Helper to create a common response for 200 OK with content.
     */
    static successResponse(contentType: string, schema: OpenAPISchema, description = 'Successful response') {
        return {
            '200': {
                description,
                content: {
                    [contentType]: { schema }
                }
            }
        }
    }

    /**
     * Helper to create common error responses.
     */
    static errorResponses(codes: Array<400 | 401 | 403 | 404 | 500> = [400, 401, 404, 500]) {
        const responses: Record<string, { description: string }> = {}

        const descriptions: Record<number, string> = {
            400: 'Bad request',
            401: 'Unauthorized',
            403: 'Forbidden',
            404: 'Not found',
            500: 'Internal server error'
        }

        for (const code of codes) {
            responses[String(code)] = { description: descriptions[code] }
        }

        return responses
    }

    /**
     * Common schemas used across components.
     */
    static commonSchemas: Record<string, OpenAPISchema> = {
        Error: {
            type: 'object',
            properties: {
                error: { type: 'string' },
                message: { type: 'string' }
            }
        },
        Point: {
            type: 'object',
            required: ['type', 'coordinates'],
            properties: {
                type: { type: 'string', enum: ['Point'] },
                coordinates: {
                    type: 'array',
                    items: { type: 'number' }
                }
            }
        },
        Feature: {
            type: 'object',
            required: ['type', 'geometry', 'properties'],
            properties: {
                type: { type: 'string', enum: ['Feature'] },
                geometry: { type: 'object' },
                properties: { type: 'object' }
            }
        },
        FeatureCollection: {
            type: 'object',
            required: ['type', 'features'],
            properties: {
                type: { type: 'string', enum: ['FeatureCollection'] },
                features: {
                    type: 'array',
                    items: { $ref: '#/components/schemas/Feature' }
                }
            }
        }
    }
}
