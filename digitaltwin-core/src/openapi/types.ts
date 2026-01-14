/**
 * @fileoverview OpenAPI 3.0 type definitions for automatic documentation generation
 *
 * These types provide a structured way to define OpenAPI specifications
 * for digital twin components.
 */

/**
 * OpenAPI Info object
 */
export interface OpenAPIInfo {
    title: string
    description?: string
    version: string
}

/**
 * OpenAPI Server object
 */
export interface OpenAPIServer {
    url: string
    description?: string
}

/**
 * OpenAPI Tag object
 */
export interface OpenAPITag {
    name: string
    description?: string
}

/**
 * OpenAPI Parameter object
 */
export interface OpenAPIParameter {
    name: string
    in: 'path' | 'query' | 'header' | 'cookie'
    description?: string
    required?: boolean
    schema: OpenAPISchema
}

/**
 * OpenAPI Schema object (simplified)
 */
export interface OpenAPISchema {
    type?: 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object'
    format?: string
    items?: OpenAPISchema
    properties?: Record<string, OpenAPISchema>
    required?: string[]
    $ref?: string
    description?: string
    nullable?: boolean
    enum?: string[]
    default?: unknown
    additionalProperties?: boolean | OpenAPISchema
}

/**
 * OpenAPI Media Type object
 */
export interface OpenAPIMediaType {
    schema: OpenAPISchema
}

/**
 * OpenAPI Request Body object
 */
export interface OpenAPIRequestBody {
    description?: string
    required?: boolean
    content: Record<string, OpenAPIMediaType>
}

/**
 * OpenAPI Response object
 */
export interface OpenAPIResponse {
    description: string
    content?: Record<string, OpenAPIMediaType>
    headers?: Record<string, { description?: string; schema: OpenAPISchema }>
}

/**
 * OpenAPI Security Requirement object
 */
export interface OpenAPISecurityRequirement {
    [name: string]: string[]
}

/**
 * OpenAPI Operation object
 */
export interface OpenAPIOperation {
    summary?: string
    description?: string
    operationId?: string
    tags?: string[]
    parameters?: OpenAPIParameter[]
    requestBody?: OpenAPIRequestBody
    responses: Record<string, OpenAPIResponse>
    security?: OpenAPISecurityRequirement[]
    deprecated?: boolean
}

/**
 * OpenAPI Path Item object
 */
export interface OpenAPIPathItem {
    get?: OpenAPIOperation
    post?: OpenAPIOperation
    put?: OpenAPIOperation
    delete?: OpenAPIOperation
    patch?: OpenAPIOperation
    options?: OpenAPIOperation
    head?: OpenAPIOperation
}

/**
 * OpenAPI Security Scheme object
 */
export interface OpenAPISecurityScheme {
    type: 'apiKey' | 'http' | 'oauth2' | 'openIdConnect'
    description?: string
    name?: string
    in?: 'query' | 'header' | 'cookie'
    scheme?: string
    bearerFormat?: string
}

/**
 * OpenAPI Components object
 */
export interface OpenAPIComponents {
    schemas?: Record<string, OpenAPISchema>
    securitySchemes?: Record<string, OpenAPISecurityScheme>
}

/**
 * Complete OpenAPI Document
 */
export interface OpenAPIDocument {
    openapi: string
    info: OpenAPIInfo
    servers?: OpenAPIServer[]
    tags?: OpenAPITag[]
    paths: Record<string, OpenAPIPathItem>
    components?: OpenAPIComponents
}

/**
 * Specification returned by a component's getOpenAPISpec() method
 */
export interface OpenAPIComponentSpec {
    /** Paths contributed by this component */
    paths: Record<string, OpenAPIPathItem>
    /** Tags used by this component */
    tags?: OpenAPITag[]
    /** Schemas contributed by this component */
    schemas?: Record<string, OpenAPISchema>
}

/**
 * Options for OpenAPI generation
 */
export interface OpenAPIGeneratorOptions {
    /** API information */
    info: OpenAPIInfo
    /** Server URLs */
    servers?: OpenAPIServer[]
    /** Components to document */
    components: OpenAPIDocumentable[]
    /** Additional schemas to merge (e.g., from external file) */
    additionalSchemas?: Record<string, OpenAPISchema>
    /** Additional tags to include */
    additionalTags?: OpenAPITag[]
    /** Include security scheme for authentication */
    includeAuth?: boolean
}

/**
 * Interface for components that can provide OpenAPI documentation
 */
export interface OpenAPIDocumentable {
    /**
     * Returns the OpenAPI specification for this component's endpoints
     */
    getOpenAPISpec(): OpenAPIComponentSpec
}

/**
 * Type guard to check if an object implements OpenAPIDocumentable
 */
export function isOpenAPIDocumentable(obj: unknown): obj is OpenAPIDocumentable {
    return (
        typeof obj === 'object' &&
        obj !== null &&
        'getOpenAPISpec' in obj &&
        typeof (obj as OpenAPIDocumentable).getOpenAPISpec === 'function'
    )
}
