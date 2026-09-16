import type { FastifyInstance, HTTPMethods } from 'fastify'

export interface LegacyRequest {
    params: Record<string, string>
    query: Record<string, string | string[] | undefined>
    body: unknown
    headers: Record<string, string | string[] | undefined>
}

export interface LegacyResponse {
    status(code: number): LegacyResponse
    setHeader(name: string, value: string): LegacyResponse
    json(body: unknown): void
    send(body?: unknown): void
    end(): void
}

export type LegacyHandler = (req: LegacyRequest, res: LegacyResponse) => Promise<void> | void

type RouteRegistrar = (path: string, handler: LegacyHandler) => void

/**
 * Express-style route registration on top of Fastify.
 *
 * Transitional: the NGSI-LD plugin still registers `(req, res)` handlers until #102
 * turns it into a Fastify plugin. Only the members it uses are provided.
 */
export interface LegacyRouter {
    get: RouteRegistrar
    post: RouteRegistrar
    put: RouteRegistrar
    patch: RouteRegistrar
    delete: RouteRegistrar
}

export function createLegacyRouter(fastify: FastifyInstance): LegacyRouter {
    const register =
        (method: HTTPMethods): RouteRegistrar =>
        (path, handler) => {
            fastify.route({
                method,
                url: path,
                handler: async (request, reply) => {
                    const res: LegacyResponse = {
                        status(code) {
                            reply.code(code)
                            return res
                        },
                        setHeader(name, value) {
                            reply.header(name, value)
                            return res
                        },
                        json: body => void reply.send(body),
                        send: body => void reply.send(body),
                        end: () => void reply.send()
                    }
                    await handler(
                        {
                            params: request.params as Record<string, string>,
                            query: request.query as Record<string, string | string[] | undefined>,
                            body: request.body,
                            headers: request.headers
                        },
                        res
                    )
                    return reply
                }
            })
        }

    return {
        get: register('GET'),
        post: register('POST'),
        put: register('PUT'),
        patch: register('PATCH'),
        delete: register('DELETE')
    }
}
