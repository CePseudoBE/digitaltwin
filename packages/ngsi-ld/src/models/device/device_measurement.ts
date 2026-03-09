import type { NgsiLdEntity, NgsiLdProperty } from '../../types/entity.js'
import { property } from '../../helpers/property.js'
import { buildUrn } from '../../helpers/urn.js'
import { NGSI_LD_CORE_CONTEXT } from '../../types/context.js'

export interface DeviceMeasurementAttributes {
    localId: string
    dateObserved?: string
    numValue?: number
    textValue?: string
    controlledProperty?: string
    refDevice?: string
    measurementType?: string
    unitCode?: string
}

/**
 * Builds an NGSI-LD DeviceMeasurement entity.
 */
export function buildDeviceMeasurement(attrs: DeviceMeasurementAttributes): NgsiLdEntity {
    const entity: NgsiLdEntity = {
        id: buildUrn('DeviceMeasurement', attrs.localId),
        type: 'DeviceMeasurement',
        '@context': NGSI_LD_CORE_CONTEXT,
    }

    const observedAt = attrs.dateObserved

    if (attrs.dateObserved !== undefined) {
        entity['dateObserved'] = property(attrs.dateObserved)
    }
    if (attrs.numValue !== undefined) {
        entity['numValue'] = property<number>(
            attrs.numValue,
            {
                ...(observedAt ? { observedAt } : {}),
                ...(attrs.unitCode ? { unitCode: attrs.unitCode } : {}),
            }
        ) as NgsiLdProperty<number>
    }
    if (attrs.textValue !== undefined) {
        entity['textValue'] = property(attrs.textValue)
    }
    if (attrs.controlledProperty !== undefined) {
        entity['controlledProperty'] = property(attrs.controlledProperty)
    }
    if (attrs.measurementType !== undefined) {
        entity['measurementType'] = property(attrs.measurementType)
    }

    return entity
}
