import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify'

const ERRORS_BASE = 'https://uri.etsi.org/ngsi-ld/errors/'

export const NGSI_LD_ERROR_TYPES: Record<number, string> = {
    400: `${ERRORS_BASE}BadRequestData`,
    401: `${ERRORS_BASE}Unauthorized`,
    403: `${ERRORS_BASE}Forbidden`,
    404: `${ERRORS_BASE}ResourceNotFound`,
    500: `${ERRORS_BASE}InternalError`
}

/** NGSI-LD ProblemDetails body for a status, as the ETSI spec describes errors. */
export function problem(status: number, title: string): { type: string; title: string } {
    return { type: NGSI_LD_ERROR_TYPES[status] ?? NGSI_LD_ERROR_TYPES[500], title }
}

/**
 * Turns every error raised inside the NGSI-LD routes into a ProblemDetails body.
 * Schema violations and other 4xx keep their status; anything else is a 500.
 */
export function ngsiLdErrorHandler(error: FastifyError, _request: FastifyRequest, reply: FastifyReply): FastifyReply {
    const status = error.validation || (error.statusCode && error.statusCode < 500) ? (error.statusCode ?? 400) : 500
    return reply.code(status).send(problem(status, error.message))
}
