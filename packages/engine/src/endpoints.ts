import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import { createWriteStream } from 'node:fs'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import type { FastifyInstance, FastifyRequest, HTTPMethods } from 'fastify'
import multipart from '@fastify/multipart'
import type { Collector, Harvester, Handler, CustomTableManager } from '@cepseudo/components'
import type { AssetsManager } from '@cepseudo/assets'
import type { DataResponse, HttpMethod, TypedRequest, UploadedFile } from '@cepseudo/shared'
import { DigitalTwinError, Logger, sanitizeFilename } from '@cepseudo/shared'

const logger = new Logger('Endpoints')

// Re-exported from @cepseudo/shared for backward compatibility
export type { HttpMethod } from '@cepseudo/shared'

interface Endpoint {
    method: HttpMethod
    path: string
    handler: (req: TypedRequest) => Promise<DataResponse> | DataResponse
    responseType?: string
}

const SUPPORTED_METHODS = new Set<string>(['get', 'post', 'put', 'patch', 'delete'])

function tempUploadDir(): string {
    return process.env.TEMP_UPLOAD_DIR || '/tmp/digitaltwin-uploads'
}

async function readMultipart(request: FastifyRequest): Promise<{ body: Record<string, unknown>; file?: UploadedFile }> {
    const body: Record<string, unknown> = {}
    let file: UploadedFile | undefined

    for await (const part of request.parts()) {
        if (part.type !== 'file') {
            body[part.fieldname] = part.value
            continue
        }
        const dir = tempUploadDir()
        await fs.mkdir(dir, { recursive: true })
        const filePath = path.join(dir, `${part.fieldname}-${Date.now()}-${crypto.randomInt(1e9)}-${sanitizeFilename(part.filename)}`)
        let size = 0
        part.file.on('data', (chunk: Buffer) => (size += chunk.length))
        await pipeline(part.file, createWriteStream(filePath))
        file = { fieldname: part.fieldname, originalname: part.filename, mimetype: part.mimetype, size, path: filePath }
    }

    return { body, file }
}

async function toTypedRequest(request: FastifyRequest): Promise<TypedRequest> {
    const upload = request.isMultipart() ? await readMultipart(request) : undefined
    return {
        params: request.params as Record<string, string>,
        query: request.query as Record<string, string | string[] | undefined>,
        body: upload?.body ?? (request.body as Record<string, unknown> | undefined) ?? {},
        headers: request.headers,
        file: upload?.file
    }
}

function errorResponse(error: unknown, request: FastifyRequest, endpointPath: string): DataResponse {
    const requestId = (request.headers['x-request-id'] as string | undefined) || crypto.randomUUID()
    const message = error instanceof Error ? error.message : String(error)

    logger.error(`[${requestId}] ${request.method} ${endpointPath} - ${message}`, {
        requestId,
        method: request.method,
        path: endpointPath,
        userId: request.headers['x-user-id'],
        stack: error instanceof Error ? error.stack : undefined
    })

    const json = (status: number, body: unknown): DataResponse => ({
        status,
        content: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' }
    })

    if (error instanceof DigitalTwinError) {
        return json(error.statusCode, { ...error.toJSON(), requestId })
    }

    const isProduction = process.env.NODE_ENV === 'production'
    return json(500, {
        error: {
            code: 'INTERNAL_ERROR',
            message: isProduction ? 'Internal server error' : message,
            requestId,
            timestamp: new Date().toISOString()
        }
    })
}

/**
 * Registers every component endpoint as a Fastify route.
 *
 * Handlers receive a framework-neutral `TypedRequest` and return a `DataResponse`
 * that is written back as-is (status, headers, content). Multipart bodies are
 * spooled to the temp upload directory and exposed as `req.file`.
 */
export async function exposeEndpoints(
    fastify: FastifyInstance,
    servables: Array<Collector | Harvester | Handler | AssetsManager | CustomTableManager>
): Promise<void> {
    await fastify.register(multipart, { limits: { files: 1 } })

    for (const servable of servables) {
        for (const ep of servable.getEndpoints() as Endpoint[]) {
            const method = ep.method.toLowerCase()
            if (!SUPPORTED_METHODS.has(method)) {
                throw new Error(`Unsupported HTTP method: ${ep.method}`)
            }

            fastify.route({
                method: method.toUpperCase() as HTTPMethods,
                url: ep.path,
                handler: async (request, reply) => {
                    let result: DataResponse
                    try {
                        result = await ep.handler(await toTypedRequest(request))
                    } catch (error) {
                        result = errorResponse(error, request, ep.path)
                    }
                    reply.code(result.status).headers(result.headers ?? {})
                    return result.content
                }
            })
        }
    }
}
