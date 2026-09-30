import type { AuthenticatedUser } from '@cepseudo/shared'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { problem } from './endpoints/errors.js'

/** The subset of the engine's AuthMiddleware the plugin relies on. */
export interface NgsiLdAuthenticator {
    identify(headers: Record<string, string | string[] | undefined>): Promise<AuthenticatedUser | undefined>
}

/** A Fastify `preHandler` that answers the request itself when the caller is not allowed in. */
export type RouteGuard = (request: FastifyRequest, reply: FastifyReply) => Promise<unknown>

/** Writes always authenticate; reads only when `publicRead` is off. */
export interface RouteGuards {
    read?: RouteGuard
    write: RouteGuard
}

/**
 * Builds the guards used by every NGSI-LD route.
 * Without an authenticator, writes are refused outright: an unconfigured plugin must fail closed.
 */
export function createRouteGuards(auth: NgsiLdAuthenticator | undefined, publicRead: boolean): RouteGuards {
    const protect: RouteGuard = async (request, reply) => {
        if (!auth) {
            return reply.code(401).send(problem(401, 'Authentication is not configured for the NGSI-LD API'))
        }
        if (!(await auth.identify(request.headers))) {
            return reply.code(401).send(problem(401, 'Authentication required'))
        }
    }

    return { write: protect, read: publicRead ? undefined : protect }
}
