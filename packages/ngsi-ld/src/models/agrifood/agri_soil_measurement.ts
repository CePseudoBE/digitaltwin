import type { NgsiLdEntity, NgsiLdProperty } from '../../types/entity.js'
import { property } from '../../helpers/property.js'
import { buildUrn } from '../../helpers/urn.js'
import { NGSI_LD_CORE_CONTEXT } from '../../types/context.js'

export interface AgriSoilMeasurementAttributes {
    localId: string
    dateObserved?: string
    soilTemperature?: number
    soilMoistureVwc?: number
    soilMoistureEc?: number
    soilSalinity?: number
    pH?: number
    soilDepth?: number
    refAgriParcel?: string
}

/**
 * Builds an NGSI-LD AgriSoilMeasurement entity (custom Smart Data Model).
 */
export function buildAgriSoilMeasurement(attrs: AgriSoilMeasurementAttributes): NgsiLdEntity {
    const entity: NgsiLdEntity = {
        id: buildUrn('AgriSoilMeasurement', attrs.localId),
        type: 'AgriSoilMeasurement',
        '@context': NGSI_LD_CORE_CONTEXT,
    }

    const observedAt = attrs.dateObserved

    if (attrs.dateObserved !== undefined) {
        entity['dateObserved'] = property(attrs.dateObserved)
    }
    if (attrs.soilTemperature !== undefined) {
        entity['soilTemperature'] = property<number>(attrs.soilTemperature, observedAt ? { observedAt } : undefined) as NgsiLdProperty<number>
    }
    if (attrs.soilMoistureVwc !== undefined) {
        entity['soilMoistureVwc'] = property<number>(attrs.soilMoistureVwc, observedAt ? { observedAt } : undefined) as NgsiLdProperty<number>
    }
    if (attrs.soilMoistureEc !== undefined) {
        entity['soilMoistureEc'] = property<number>(attrs.soilMoistureEc, observedAt ? { observedAt } : undefined) as NgsiLdProperty<number>
    }
    if (attrs.pH !== undefined) {
        entity['pH'] = property<number>(attrs.pH, observedAt ? { observedAt } : undefined) as NgsiLdProperty<number>
    }

    return entity
}
