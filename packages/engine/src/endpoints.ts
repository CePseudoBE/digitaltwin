import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import { createWriteStream } from 'node:fs'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import type { FastifyInstance, FastifyRequest, HTTPMethods } from 'fastify'
import multipart from '@fastify/multipart'
import type { Collector, Harvester, Handler, CustomTableManager } from '@cepseudo/components'
import type { AssetsManager } from '@cepseudo/assets'
import type { AuthMiddleware } from '@cepseudo/auth'
import type { DataResponse, EndpointSchema, HttpMethod, TypedRequest, UploadedFile } from '@cepseudo/shared'
import { AuthenticationError, sanitizeFilename } from '@cepseudo/shared'

// Re-exported from @cepseudo/shared for backward compatibility
export type { HttpMethod } from '@cepseudo/shared'

interface Endpoint {
    method: HttpMethod
    path: string
    handler: (req: TypedRequest) => Promise<DataResponse> | DataResponse
    responseType?: string
    schema?: EndpointSchema
}

export interface ExposeEndpointsOptions {
    /** Resolves the caller's identity from the headers into `TypedRequest.user` */
    authMiddleware?: Pick<AuthMiddleware, 'identify'>
    /** Largest multipart file accepted, in bytes (default: 100 MiB) */
    maxFileSize?: number
}

const SUPPORTED_METHODS = new Set<string>(['get', 'post', 'put', 'patch', 'delete'])
const DEFAULT_MAX_FILE_SIZE = 100 * 1024 * 1024

function tempUploadDir(): string {
    return process.env.TEMP_UPLOAD_DIR || '/tmp/digitaltwin-uploads'
}

/** A file over the size limit is reported by the plugin once the parts have been consumed, after it was spooled. */
async function readMultipart(request: FastifyRequest): Promise<{ body: Record<string, unknown>; file?: UploadedFile }> {
    const body: Record<string, unknown> = {}
    let file: UploadedFile | undefined

    try {
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
    } catch (error) {
        if (file?.path) {
            await fs.rm(file.path, { force: true })
        }
        throw error
    }

    return { body, file }
}

async function toTypedRequest(request: FastifyRequest, options: ExposeEndpointsOptions): Promise<TypedRequest> {
    const user = await options.authMiddleware?.identify(request.headers)
    // Uploads are only ever authenticated writes, so an anonymous body is refused before it touches the disk
    if (request.isMultipart() && options.authMiddleware && !user) {
        throw new AuthenticationError('Authentication required')
    }
    const upload = request.isMultipart() ? await readMultipart(request) : undefined
    return {
        params: request.params as Record<string, string>,
        query: request.query as Record<string, string | string[] | undefined>,
        body: upload?.body ?? (request.body as Record<string, unknown> | undefined) ?? {},
        headers: request.headers,
        user,
        file: upload?.file
    }
}

/**
 * Registers every component endpoint as a Fastify route.
 *
 * Handlers receive a framework-neutral `TypedRequest` and return a `DataResponse`
 * that is written back as-is (status, headers, content). An endpoint's `schema`
 * is validated by Fastify before the handler runs. Multipart bodies are spooled
 * to the temp upload directory and exposed as `req.file`; the component that
 * receives the file owns its removal. Errors propagate to the instance's error handler.
 */
export async function exposeEndpoints(
    fastify: FastifyInstance,
    servables: Array<Collector | Harvester | Handler | AssetsManager | CustomTableManager>,
    options: ExposeEndpointsOptions = {}
): Promise<void> {
    await fastify.register(multipart, { limits: { fileSize: options.maxFileSize ?? DEFAULT_MAX_FILE_SIZE, files: 1 } })

    for (const servable of servables) {
        for (const ep of servable.getEndpoints() as Endpoint[]) {
            const method = ep.method.toLowerCase()
            if (!SUPPORTED_METHODS.has(method)) {
                throw new Error(`Unsupported HTTP method: ${ep.method}`)
            }

            fastify.route({
                method: method.toUpperCase() as HTTPMethods,
                url: ep.path,
                schema: ep.schema,
                handler: async (request, reply) => {
                    const result = await ep.handler(await toTypedRequest(request, options))
                    reply.code(result.status).headers(result.headers ?? {})
                    return result.content
                }
            })
        }
    }
}
