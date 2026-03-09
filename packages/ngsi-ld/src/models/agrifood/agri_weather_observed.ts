import type { NgsiLdEntity, NgsiLdProperty } from '../../types/entity.js'
import { property } from '../../helpers/property.js'
import { buildUrn } from '../../helpers/urn.js'
import { NGSI_LD_CORE_CONTEXT } from '../../types/context.js'

export interface AgriWeatherObservedAttributes {
    localId: string
    dateObserved?: string
    temperature?: number
    relativeHumidity?: number
    atmosphericPressure?: number
    solarRadiation?: number
    precipitation?: number
    windSpeed?: number
    windDirection?: number
    leafWetness?: number
    dewPoint?: number
    refAgriParcel?: string
}

/**
 * Builds an NGSI-LD AgriWeatherObserved entity.
 */
export function buildAgriWeatherObserved(attrs: AgriWeatherObservedAttributes): NgsiLdEntity {
    const entity: NgsiLdEntity = {
        id: buildUrn('AgriWeatherObserved', attrs.localId),
        type: 'AgriWeatherObserved',
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
    if (attrs.solarRadiation !== undefined) {
        entity['solarRadiation'] = property<number>(attrs.solarRadiation, observedAt ? { observedAt } : undefined) as NgsiLdProperty<number>
    }
    if (attrs.precipitation !== undefined) {
        entity['precipitation'] = property<number>(attrs.precipitation, observedAt ? { observedAt } : undefined) as NgsiLdProperty<number>
    }
    if (attrs.windSpeed !== undefined) {
        entity['windSpeed'] = property<number>(attrs.windSpeed, observedAt ? { observedAt } : undefined) as NgsiLdProperty<number>
    }

    return entity
}
