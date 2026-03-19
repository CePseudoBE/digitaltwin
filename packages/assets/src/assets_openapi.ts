import type { OpenAPIComponentSpec, AssetsManagerConfiguration } from '@cepseudo/shared'

/**
 * Generate OpenAPI specification for an AssetsManager's endpoints.
 *
 * Extracted from AssetsManager to keep the main class focused on
 * business logic and HTTP handling.
 */
export function generateAssetsOpenAPISpec(config: AssetsManagerConfiguration): OpenAPIComponentSpec {
    const basePath = `/${config.endpoint}`
    const tagName = config.tags?.[0] || config.name

    return {
        paths: {
            [basePath]: {
                get: {
                    summary: `List all ${config.name} assets`,
                    description: config.description,
                    tags: [tagName],
                    responses: {
                        '200': {
                            description: 'List of assets',
                            content: {
                                'application/json': {
                                    schema: {
                                        type: 'array',
                                        items: { $ref: '#/components/schemas/AssetResponse' }
                                    }
                                }
                            }
                        }
                    }
                },
                post: {
                    summary: `Upload a new ${config.name} asset`,
                    description: 'Upload a new asset file with metadata. Requires authentication.',
                    tags: [tagName],
                    security: [{ ApiKeyAuth: [] }],
                    requestBody: {
                        required: true,
                        content: {
                            'multipart/form-data': {
                                schema: {
                                    type: 'object',
                                    required: ['file', 'description', 'source'],
                                    properties: {
                                        file: {
                                            type: 'string',
                                            format: 'binary',
                                            description: 'The file to upload'
                                        },
                                        description: { type: 'string', description: 'Asset description' },
                                        source: {
                                            type: 'string',
                                            format: 'uri',
                                            description: 'Source URL for provenance'
                                        },
                                        is_public: {
                                            type: 'boolean',
                                            description: 'Whether asset is public (default: true)'
                                        }
                                    }
                                }
                            }
                        }
                    },
                    responses: {
                        '200': {
                            description: 'Asset uploaded successfully',
                            content: {
                                'application/json': {
                                    schema: { $ref: '#/components/schemas/SuccessResponse' }
                                }
                            }
                        },
                        '400': { description: 'Bad request - missing or invalid fields' },
                        '401': { description: 'Unauthorized - authentication required' }
                    }
                }
            },
            [`${basePath}/{id}`]: {
                get: {
                    summary: `Get ${config.name} asset by ID`,
                    description: 'Returns the asset file content',
                    tags: [tagName],
                    parameters: [
                        {
                            name: 'id',
                            in: 'path',
                            required: true,
                            schema: { type: 'string' },
                            description: 'Asset ID'
                        }
                    ],
                    responses: {
                        '200': {
                            description: 'Asset file content',
                            content: {
                                [config.contentType]: {
                                    schema: { type: 'string', format: 'binary' }
                                }
                            }
                        },
                        '404': { description: 'Asset not found' }
                    }
                },
                put: {
                    summary: `Update ${config.name} asset metadata`,
                    description:
                        'Update asset description, source, or visibility. Requires authentication and ownership.',
                    tags: [tagName],
                    security: [{ ApiKeyAuth: [] }],
                    parameters: [
                        {
                            name: 'id',
                            in: 'path',
                            required: true,
                            schema: { type: 'string' },
                            description: 'Asset ID'
                        }
                    ],
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    properties: {
                                        description: { type: 'string' },
                                        source: { type: 'string', format: 'uri' },
                                        is_public: { type: 'boolean' }
                                    }
                                }
                            }
                        }
                    },
                    responses: {
                        '200': {
                            description: 'Asset updated successfully',
                            content: {
                                'application/json': {
                                    schema: { $ref: '#/components/schemas/SuccessResponse' }
                                }
                            }
                        },
                        '400': { description: 'Bad request' },
                        '401': { description: 'Unauthorized' },
                        '403': { description: 'Forbidden - not owner' },
                        '404': { description: 'Asset not found' }
                    }
                },
                delete: {
                    summary: `Delete ${config.name} asset`,
                    description: 'Delete an asset. Requires authentication and ownership.',
                    tags: [tagName],
                    security: [{ ApiKeyAuth: [] }],
                    parameters: [
                        {
                            name: 'id',
                            in: 'path',
                            required: true,
                            schema: { type: 'string' },
                            description: 'Asset ID'
                        }
                    ],
                    responses: {
                        '200': {
                            description: 'Asset deleted successfully',
                            content: {
                                'application/json': {
                                    schema: { $ref: '#/components/schemas/SuccessResponse' }
                                }
                            }
                        },
                        '401': { description: 'Unauthorized' },
                        '403': { description: 'Forbidden - not owner' },
                        '404': { description: 'Asset not found' }
                    }
                }
            },
            [`${basePath}/{id}/download`]: {
                get: {
                    summary: `Download ${config.name} asset`,
                    description: 'Download the asset file with Content-Disposition header',
                    tags: [tagName],
                    parameters: [
                        {
                            name: 'id',
                            in: 'path',
                            required: true,
                            schema: { type: 'string' },
                            description: 'Asset ID'
                        }
                    ],
                    responses: {
                        '200': {
                            description: 'Asset file download',
                            content: {
                                [config.contentType]: {
                                    schema: { type: 'string', format: 'binary' }
                                }
                            }
                        },
                        '404': { description: 'Asset not found' }
                    }
                }
            },
            [`${basePath}/batch`]: {
                post: {
                    summary: `Batch upload ${config.name} assets`,
                    description: 'Upload multiple assets in one request. Files must be base64 encoded.',
                    tags: [tagName],
                    security: [{ ApiKeyAuth: [] }],
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    required: ['requests'],
                                    properties: {
                                        requests: {
                                            type: 'array',
                                            items: {
                                                type: 'object',
                                                required: ['file', 'description', 'source', 'filename'],
                                                properties: {
                                                    file: {
                                                        type: 'string',
                                                        format: 'byte',
                                                        description: 'Base64 encoded file'
                                                    },
                                                    filename: { type: 'string' },
                                                    description: { type: 'string' },
                                                    source: { type: 'string', format: 'uri' },
                                                    is_public: { type: 'boolean' }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    },
                    responses: {
                        '200': { description: 'All assets uploaded successfully' },
                        '207': { description: 'Partial success - some uploads failed' },
                        '400': { description: 'Bad request' },
                        '401': { description: 'Unauthorized' }
                    }
                },
                delete: {
                    summary: `Batch delete ${config.name} assets`,
                    description:
                        'Delete multiple assets by IDs. Requires authentication and ownership. Pass IDs as comma-separated query parameter.',
                    tags: [tagName],
                    security: [{ ApiKeyAuth: [] }],
                    parameters: [
                        {
                            name: 'ids',
                            in: 'query',
                            required: true,
                            schema: {
                                type: 'string'
                            },
                            description: 'Comma-separated list of asset IDs to delete (e.g., 1,2,3)'
                        }
                    ],
                    responses: {
                        '200': { description: 'All assets deleted successfully' },
                        '207': { description: 'Partial success - some deletions failed' },
                        '400': { description: 'Bad request' },
                        '401': { description: 'Unauthorized' }
                    }
                }
            },
            [`${basePath}/upload-request`]: {
                post: {
                    summary: 'Request presigned upload URL',
                    description:
                        'Generate a presigned PUT URL for direct client-to-storage upload. Only available when storage supports presigned URLs (S3-compatible).',
                    tags: [tagName],
                    security: [{ ApiKeyAuth: [] }],
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    required: ['fileName', 'fileSize', 'contentType'],
                                    properties: {
                                        fileName: { type: 'string' },
                                        fileSize: { type: 'integer' },
                                        contentType: { type: 'string' },
                                        description: { type: 'string' },
                                        source: { type: 'string', format: 'uri' },
                                        is_public: { type: 'boolean' }
                                    }
                                }
                            }
                        }
                    },
                    responses: {
                        '200': {
                            description: 'Presigned upload URL generated',
                            content: {
                                'application/json': {
                                    schema: {
                                        type: 'object',
                                        properties: {
                                            fileId: { type: 'integer' },
                                            uploadUrl: { type: 'string', format: 'uri' },
                                            key: { type: 'string' },
                                            expiresAt: { type: 'string', format: 'date-time' }
                                        }
                                    }
                                }
                            }
                        },
                        '400': { description: 'Presigned URLs not supported or invalid request' },
                        '401': { description: 'Unauthorized' }
                    }
                }
            },
            [`${basePath}/confirm/{fileId}`]: {
                post: {
                    summary: 'Confirm presigned upload',
                    description:
                        'Confirm that a file has been uploaded via the presigned URL. Verifies the file exists on storage and updates the record status.',
                    tags: [tagName],
                    security: [{ ApiKeyAuth: [] }],
                    parameters: [
                        {
                            name: 'fileId',
                            in: 'path',
                            required: true,
                            schema: { type: 'string' },
                            description: 'File record ID from upload-request'
                        }
                    ],
                    responses: {
                        '200': {
                            description: 'Upload confirmed',
                            content: {
                                'application/json': {
                                    schema: {
                                        type: 'object',
                                        properties: {
                                            message: { type: 'string' },
                                            id: { type: 'integer' },
                                            url: { type: 'string' }
                                        }
                                    }
                                }
                            }
                        },
                        '400': { description: 'File not found on storage' },
                        '401': { description: 'Unauthorized' },
                        '403': { description: 'Not the owner' },
                        '404': { description: 'Record not found' },
                        '409': { description: 'Upload not in pending state' }
                    }
                }
            }
        },
        tags: [
            {
                name: tagName,
                description: config.description
            }
        ],
        schemas: {
            AssetResponse: {
                type: 'object',
                properties: {
                    id: { type: 'integer' },
                    name: { type: 'string' },
                    date: { type: 'string', format: 'date-time' },
                    contentType: { type: 'string' },
                    description: { type: 'string' },
                    source: { type: 'string' },
                    owner_id: { type: 'integer', nullable: true },
                    filename: { type: 'string' },
                    is_public: { type: 'boolean' },
                    url: { type: 'string' },
                    download_url: { type: 'string' }
                }
            },
            SuccessResponse: {
                type: 'object',
                properties: {
                    message: { type: 'string' }
                }
            }
        }
    }
}
