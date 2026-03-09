import type { NgsiLdEntity, NgsiLdProperty } from '../../types/entity.js'
import { property } from '../../helpers/property.js'
import { buildUrn } from '../../helpers/urn.js'
import { NGSI_LD_CORE_CONTEXT } from '../../types/context.js'

export interface AirQualityObservedAttributes {
    localId: string
    dateObserved?: string
    pm25?: number
    pm10?: number
    no2?: number
    o3?: number
    co?: number
    so2?: number
    temperature?: number
    relativeHumidity?: number
    airQualityIndex?: number
    airQualityLevel?: string
    location?: string
}

/**
 * Builds an NGSI-LD AirQualityObserved entity.
 * Conforms to the FIWARE Smart Data Models AirQualityObserved schema.
 */
export function buildAirQualityObserved(attrs: AirQualityObservedAttributes): NgsiLdEntity {
    const entity: NgsiLdEntity = {
        id: buildUrn('AirQualityObserved', attrs.localId),
        type: 'AirQualityObserved',
        '@context': NGSI_LD_CORE_CONTEXT,
    }

    const observedAt = attrs.dateObserved

    if (attrs.dateObserved !== undefined) {
        entity['dateObserved'] = property(attrs.dateObserved)
    }
    if (attrs.pm25 !== undefined) {
        entity['pm25'] = property<number>(attrs.pm25, observedAt ? { observedAt } : undefined) as NgsiLdProperty<number>
    }
    if (attrs.pm10 !== undefined) {
        entity['pm10'] = property<number>(attrs.pm10, observedAt ? { observedAt } : undefined) as NgsiLdProperty<number>
    }
    if (attrs.no2 !== undefined) {
        entity['no2'] = property<number>(attrs.no2, observedAt ? { observedAt } : undefined) as NgsiLdProperty<number>
    }
    if (attrs.o3 !== undefined) {
        entity['o3'] = property<number>(attrs.o3, observedAt ? { observedAt } : undefined) as NgsiLdProperty<number>
    }
    if (attrs.co !== undefined) {
        entity['co'] = property<number>(attrs.co, observedAt ? { observedAt } : undefined) as NgsiLdProperty<number>
    }
    if (attrs.so2 !== undefined) {
        entity['so2'] = property<number>(attrs.so2, observedAt ? { observedAt } : undefined) as NgsiLdProperty<number>
    }
    if (attrs.temperature !== undefined) {
        entity['temperature'] = property<number>(attrs.temperature, observedAt ? { observedAt } : undefined) as NgsiLdProperty<number>
    }
    if (attrs.relativeHumidity !== undefined) {
        entity['relativeHumidity'] = property<number>(attrs.relativeHumidity, observedAt ? { observedAt } : undefined) as NgsiLdProperty<number>
    }
    if (attrs.airQualityIndex !== undefined) {
        entity['airQualityIndex'] = property<number>(attrs.airQualityIndex, observedAt ? { observedAt } : undefined) as NgsiLdProperty<number>
    }
    if (attrs.airQualityLevel !== undefined) {
        entity['airQualityLevel'] = property(attrs.airQualityLevel)
    }

    return entity
}
