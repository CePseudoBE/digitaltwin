import type { NgsiLdEntity, NgsiLdProperty } from '../../types/entity.js'
import { property } from '../../helpers/property.js'
import { buildUrn } from '../../helpers/urn.js'
import { NGSI_LD_CORE_CONTEXT } from '../../types/context.js'

export interface WeatherObservedAttributes {
    localId: string
    dateObserved?: string
    temperature?: number
    relativeHumidity?: number
    windSpeed?: number
    windDirection?: number
    atmosphericPressure?: number
    precipitation?: number
    snowHeight?: number
    visibility?: number
    weatherType?: string
}

/**
 * Builds an NGSI-LD WeatherObserved entity.
 */
export function buildWeatherObserved(attrs: WeatherObservedAttributes): NgsiLdEntity {
    const entity: NgsiLdEntity = {
        id: buildUrn('WeatherObserved', attrs.localId),
        type: 'WeatherObserved',
        '@context': NGSI_LD_CORE_CONTEXT,
    }

    const observedAt = attrs.dateObserved

    if (attrs.dateObserved !== undefined) {
        entity['dateObserved'] = property(attrs.dateObserved)
    }
    if (attrs.temperature !== undefined) {
        entity['temperature'] = property<number>(attrs.temperature, observedAt ? { observedAt } : undefined) as NgsiLdProperty<number>
    }
    if (attrs.relativeHumidity !== undefined) {
        entity['relativeHumidity'] = property<number>(attrs.relativeHumidity, observedAt ? { observedAt } : undefined) as NgsiLdProperty<number>
    }
    if (attrs.windSpeed !== undefined) {
        entity['windSpeed'] = property<number>(attrs.windSpeed, observedAt ? { observedAt } : undefined) as NgsiLdProperty<number>
    }
    if (attrs.windDirection !== undefined) {
        entity['windDirection'] = property<number>(attrs.windDirection, observedAt ? { observedAt } : undefined) as NgsiLdProperty<number>
    }
    if (attrs.atmosphericPressure !== undefined) {
        entity['atmosphericPressure'] = property<number>(attrs.atmosphericPressure, observedAt ? { observedAt } : undefined) as NgsiLdProperty<number>
    }
    if (attrs.precipitation !== undefined) {
        entity['precipitation'] = property<number>(attrs.precipitation, observedAt ? { observedAt } : undefined) as NgsiLdProperty<number>
    }
    if (attrs.snowHeight !== undefined) {
        entity['snowHeight'] = property<number>(attrs.snowHeight, observedAt ? { observedAt } : undefined) as NgsiLdProperty<number>
    }
    if (attrs.visibility !== undefined) {
        entity['visibility'] = property<number>(attrs.visibility, observedAt ? { observedAt } : undefined) as NgsiLdProperty<number>
    }
    if (attrs.weatherType !== undefined) {
        entity['weatherType'] = property(attrs.weatherType)
    }

    return entity
}
