/**
 * JSON-LD @context value — can be a URL string, array of strings/objects, or an inline context object.
 */
export type JsonLdContext = string | string[] | Record<string, unknown>

/**
 * The default ETSI NGSI-LD core context URL.
 */
export const NGSI_LD_CORE_CONTEXT = 'https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld'
