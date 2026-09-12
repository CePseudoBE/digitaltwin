import type { AuthResult } from '@cepseudo/shared'
import type { Request, Response } from 'ultimate-express'

/** The subset of the engine's AuthMiddleware the plugin relies on. */
export interface NgsiLdAuthenticator {
    authenticate(req: { headers?: Record<string, string | string[] | undefined> }): Promise<AuthResult>
}

export type RouteHandler = (req: Request, res: Response) => Promise<void> | void

/** Wraps route handlers so writes always authenticate and reads do when `publicRead` is off. */
export interface RouteGuards {
    read: (handler: RouteHandler) => RouteHandler
    write: (handler: RouteHandler) => RouteHandler
}

const ERROR_TYPES: Record<number, string> = {
    401: 'https://uri.etsi.org/ngsi-ld/errors/Unauthorized',
    403: 'https://uri.etsi.org/ngsi-ld/errors/Forbidden',
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
 * Builds the guards used by every NGSI-LD endpoint.
 * Without an authenticator, writes are refused outright: an unconfigured plugin must fail closed.
 */
export function createRouteGuards(auth: NgsiLdAuthenticator | undefined, publicRead: boolean): RouteGuards {
    const protect = (handler: RouteHandler): RouteHandler => async (req, res) => {
        if (!auth) {
            res.status(401).json({ type: ERROR_TYPES[401], title: 'Authentication is not configured for the NGSI-LD API' })
            return
        }

        const result = await auth.authenticate({ headers: req.headers })
        if (!result.success) {
            const status = result.response.status
            res.status(status).json({
                type: ERROR_TYPES[status] ?? 'https://uri.etsi.org/ngsi-ld/errors/InternalError',
                title: titleOf(result.response.content),
            })
            return
        }

        await handler(req, res)
    }

    return { write: protect, read: publicRead ? handler => handler : protect }
}
