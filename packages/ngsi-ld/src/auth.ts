import type { AuthResult } from '@cepseudo/shared'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { NGSI_LD_ERROR_TYPES } from './endpoints/errors.js'

/** The subset of the engine's AuthMiddleware the plugin relies on. */
export interface NgsiLdAuthenticator {
    authenticate(req: { headers?: Record<string, string | string[] | undefined> }): Promise<AuthResult>
}

/** A Fastify `preHandler` that answers the request itself when the caller is not allowed in. */
export type RouteGuard = (request: FastifyRequest, reply: FastifyReply) => Promise<unknown>

/** Writes always authenticate; reads only when `publicRead` is off. */
export interface RouteGuards {
    read?: RouteGuard
    write: RouteGuard
}

function titleOf(content: Buffer | string): string {
    try {
        const parsed = JSON.parse(String(content)) as { error?: unknown }
        if (typeof parsed.error === 'string') return parsed.error
    } catch {
        // not JSON, fall through
    }
    return 'Authentication required'
}

/**
 * Builds the guards used by every NGSI-LD route.
 * Without an authenticator, writes are refused outright: an unconfigured plugin must fail closed.
 */
export function createRouteGuards(auth: NgsiLdAuthenticator | undefined, publicRead: boolean): RouteGuards {
    const protect: RouteGuard = async (request, reply) => {
        if (!auth) {
            return reply.code(401).send({ type: NGSI_LD_ERROR_TYPES[401], title: 'Authentication is not configured for the NGSI-LD API' })
        }
        const result = await auth.authenticate({ headers: request.headers })
        if (!result.success) {
            const status = result.response.status
            return reply.code(status).send({ type: NGSI_LD_ERROR_TYPES[status] ?? NGSI_LD_ERROR_TYPES[500], title: titleOf(result.response.content) })
        }
    }

    return { write: protect, read: publicRead ? undefined : protect }
}
