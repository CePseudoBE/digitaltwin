import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { DigitalTwinError, Logger } from '@cepseudo/shared'

const logger = new Logger('Http')

interface ErrorBody {
    error: {
        code: string
        message: string
        requestId: string
        timestamp: string
        details?: unknown
        context?: unknown
        stack?: string
    }
}

function isFastifyError(error: unknown): error is FastifyError {
    return typeof error === 'object' && error !== null && 'code' in error && 'statusCode' in error
}

function toErrorBody(error: unknown, request: FastifyRequest): { status: number; body: ErrorBody } {
    const requestId = request.id
    const timestamp = new Date().toISOString()

    if (error instanceof DigitalTwinError) {
        const isProduction = process.env.NODE_ENV === 'production'
        return {
            status: error.statusCode,
            body: {
                error: {
                    code: error.code,
                    message: error.message,
                    requestId,
                    timestamp: error.timestamp.toISOString(),
                    ...(error.context && { context: error.context }),
                    ...(!isProduction && { stack: error.stack })
                }
            }
        }
    }

    if (isFastifyError(error) && error.validation) {
        return {
            status: 400,
            body: {
                error: {
                    code: 'VALIDATION_ERROR',
                    message: error.message,
                    requestId,
                    timestamp,
                    details: error.validation
                }
            }
        }
    }

    if (isFastifyError(error) && error.statusCode && error.statusCode < 500) {
        return { status: error.statusCode, body: { error: { code: error.code, message: error.message, requestId, timestamp } } }
    }

    const isProduction = process.env.NODE_ENV === 'production'
    const message = error instanceof Error ? error.message : String(error)
    return {
        status: 500,
        body: {
            error: {
                code: 'INTERNAL_ERROR',
                message: isProduction ? 'Internal server error' : message,
                requestId,
                timestamp,
                ...(!isProduction && error instanceof Error && { stack: error.stack })
            }
        }
    }
}

/**
 * Maps every error thrown while serving a request to a structured JSON body:
 * the shared error hierarchy keeps its status codes, schema violations answer 400,
 * anything else is a 500 whose message is hidden in production.
 */
export function registerErrorHandler(fastify: FastifyInstance): void {
    fastify.setErrorHandler((error: unknown, request: FastifyRequest, reply: FastifyReply) => {
        const { status, body } = toErrorBody(error, request)
        const line = `[${request.id}] ${request.method} ${request.url} - ${body.error.message}`
        const fields = {
            requestId: request.id,
            method: request.method,
            path: request.url,
            userId: request.headers['x-user-id'],
            stack: error instanceof Error ? error.stack : undefined
        }
        if (status >= 500) logger.error(line, fields)
        else logger.warn(line, fields)
        return reply.code(status).send(body)
    })

    fastify.setNotFoundHandler((request: FastifyRequest, reply: FastifyReply) => {
        const body: ErrorBody = {
            error: {
                code: 'NOT_FOUND',
                message: `Route ${request.method} ${request.url} not found`,
                requestId: request.id,
                timestamp: new Date().toISOString()
            }
        }
        return reply.code(404).send(body)
    })
}

/** Echoes the request id back to the client and logs one structured line per request. */
export function registerRequestLogging(fastify: FastifyInstance): void {
    fastify.addHook('onRequest', async (request, reply) => {
        reply.header('x-request-id', request.id)
    })

    fastify.addHook('onResponse', async (request, reply) => {
        logger.debug(`[${request.id}] ${request.method} ${request.url} ${reply.statusCode}`, {
            requestId: request.id,
            method: request.method,
            path: request.url,
            statusCode: reply.statusCode,
            durationMs: Math.round(reply.elapsedTime)
        })
    })
}
