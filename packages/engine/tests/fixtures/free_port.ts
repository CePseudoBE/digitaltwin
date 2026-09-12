import { createServer } from 'node:net'

/** Asks the OS for a free TCP port, so integration tests never collide. */
export function freePort(): Promise<number> {
    return new Promise(resolve => {
        const probe = createServer()
        probe.listen(0, () => {
            const { port } = probe.address() as { port: number }
            probe.close(() => resolve(port))
        })
    })
}
