/**
 * Builds an NGSI-LD URN from a type and local identifier.
 *
 * @example
 * buildUrn('AirQualityObserved', 'sensor-42')
 * // => 'urn:ngsi-ld:AirQualityObserved:sensor-42'
 */
export function buildUrn(type: string, localId: string): string {
    return `urn:ngsi-ld:${type}:${localId}`
}

/**
 * Result of parsing an NGSI-LD URN.
 */
export interface ParsedUrn {
    type: string
    localId: string
}

/**
 * Parses an NGSI-LD URN into its type and local identifier components.
 *
 * @throws {Error} When the URN does not conform to the `urn:ngsi-ld:<type>:<localId>` format.
 *
 * @example
 * parseUrn('urn:ngsi-ld:AirQualityObserved:sensor-42')
 * // => { type: 'AirQualityObserved', localId: 'sensor-42' }
 */
export function parseUrn(urn: string): ParsedUrn {
    const parts = urn.split(':')
    if (parts.length < 4 || parts[0] !== 'urn' || parts[1] !== 'ngsi-ld') {
        throw new Error(`Invalid NGSI-LD URN format: "${urn}". Expected "urn:ngsi-ld:<type>:<localId>"`)
    }
    // type is index 2, localId is everything from index 3 onward (supports colons in localId)
    const type = parts[2]
    const localId = parts.slice(3).join(':')
    return { type, localId }
}
