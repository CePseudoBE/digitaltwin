import { isIP } from 'node:net'
import { lookup } from 'node:dns/promises'

/** Thrown when a subscription endpoint must not be called from this server. */
export class WebhookUrlError extends Error {
    override readonly name = 'WebhookUrlError'
}

export interface WebhookUrlOptions {
    /** Accept loopback and private addresses (development only). */
    allowPrivate?: boolean
}

function isPrivateV4(ip: string): boolean {
    const [a, b] = ip.split('.').map(Number)
    return (
        a === 0 || // "this" network
        a === 10 || // RFC1918
        a === 127 || // loopback
        (a === 169 && b === 254) || // link-local, includes the cloud metadata address
        (a === 172 && b >= 16 && b <= 31) || // RFC1918
        (a === 192 && b === 168) || // RFC1918
        (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
        a >= 224 // multicast and reserved
    )
}

function isPrivateV6(ip: string): boolean {
    const lower = ip.toLowerCase()
    // IPv4-mapped, dotted (::ffff:10.0.0.1) or as the URL parser normalises it (::ffff:a00:1)
    const dotted = /^(?:0*:)*ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower)
    if (dotted) return isPrivateV4(dotted[1])
    const hex = /^(?:0*:)*ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(lower)
    if (hex) {
        const hi = parseInt(hex[1], 16)
        const lo = parseInt(hex[2], 16)
        return isPrivateV4(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`)
    }
    if (lower === '::' || lower === '::1') return true

    const first = parseInt(lower.split(':')[0] || '0', 16)
    return (first & 0xffc0) === 0xfe80 || (first & 0xfe00) === 0xfc00 // link-local, unique local
}

/** True for loopback, link-local, private, CGNAT, multicast and reserved addresses. Non-IP input counts as unsafe. */
export function isPrivateAddress(ip: string): boolean {
    const version = isIP(ip)
    if (version === 4) return isPrivateV4(ip)
    if (version === 6) return isPrivateV6(ip)
    return true
}

/**
 * Checks that a webhook URL is something this server may POST to:
 * http or https, not localhost, and not resolving to a private or reserved address.
 * Hostnames are resolved so a DNS name pointing at an internal service is caught too.
 *
 * @throws {WebhookUrlError} When the URL is malformed or points somewhere private
 */
export async function assertSafeWebhookUrl(raw: string, options: WebhookUrlOptions = {}): Promise<URL> {
    let url: URL
    try {
        url = new URL(raw)
    } catch {
        throw new WebhookUrlError(`Invalid webhook URL: ${raw}`)
    }

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new WebhookUrlError(`Webhook URL must use http or https, got "${url.protocol.replace(':', '')}"`)
    }

    if (options.allowPrivate) return url

    const host = url.hostname.replace(/^\[|\]$/g, '')
    if (host === 'localhost' || host.endsWith('.localhost')) {
        throw new WebhookUrlError('Webhook URL must not point to localhost')
    }

    if (isIP(host)) {
        if (isPrivateAddress(host)) throw new WebhookUrlError(`Webhook URL must not point to a private or reserved address: ${host}`)
        return url
    }

    let addresses: Array<{ address: string }>
    try {
        addresses = await lookup(host, { all: true })
    } catch {
        throw new WebhookUrlError(`Webhook host cannot be resolved: ${host}`)
    }
    if (addresses.length === 0 || addresses.some(a => isPrivateAddress(a.address))) {
        throw new WebhookUrlError(`Webhook host resolves to a private or reserved address: ${host}`)
    }

    return url
}
