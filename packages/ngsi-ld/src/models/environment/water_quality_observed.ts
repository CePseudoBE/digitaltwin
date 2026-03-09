import type { NgsiLdEntity, NgsiLdProperty } from '../../types/entity.js'
import { property } from '../../helpers/property.js'
import { buildUrn } from '../../helpers/urn.js'
import { NGSI_LD_CORE_CONTEXT } from '../../types/context.js'

export interface WaterQualityObservedAttributes {
    localId: string
    dateObserved?: string
    temperature?: number
    pH?: number
    conductivity?: number
    conductance?: number
    tss?: number
    tds?: number
    turbidity?: number
    salinity?: number
    dissolvedOxygen?: number
    orp?: number
}

/**
 * Builds an NGSI-LD WaterQualityObserved entity.
 */
export function buildWaterQualityObserved(attrs: WaterQualityObservedAttributes): NgsiLdEntity {
    const entity: NgsiLdEntity = {
        id: buildUrn('WaterQualityObserved', attrs.localId),
        type: 'WaterQualityObserved',
        '@context': NGSI_LD_CORE_CONTEXT,
    }

    const observedAt = attrs.dateObserved

    if (attrs.dateObserved !== undefined) {
        entity['dateObserved'] = property(attrs.dateObserved)
    }
    if (attrs.temperature !== undefined) {
        entity['temperature'] = property<number>(attrs.temperature, observedAt ? { observedAt } : undefined) as NgsiLdProperty<number>
    }
    if (attrs.pH !== undefined) {
        entity['pH'] = property<number>(attrs.pH, observedAt ? { observedAt } : undefined) as NgsiLdProperty<number>
    }
    if (attrs.conductivity !== undefined) {
        entity['conductivity'] = property<number>(attrs.conductivity, observedAt ? { observedAt } : undefined) as NgsiLdProperty<number>
    }
    if (attrs.turbidity !== undefined) {
        entity['turbidity'] = property<number>(attrs.turbidity, observedAt ? { observedAt } : undefined) as NgsiLdProperty<number>
    }
    if (attrs.salinity !== undefined) {
        entity['salinity'] = property<number>(attrs.salinity, observedAt ? { observedAt } : undefined) as NgsiLdProperty<number>
    }
    if (attrs.dissolvedOxygen !== undefined) {
        entity['dissolvedOxygen'] = property<number>(attrs.dissolvedOxygen, observedAt ? { observedAt } : undefined) as NgsiLdProperty<number>
    }
    if (attrs.tss !== undefined) {
        entity['tss'] = property<number>(attrs.tss, observedAt ? { observedAt } : undefined) as NgsiLdProperty<number>
    }
    if (attrs.tds !== undefined) {
        entity['tds'] = property<number>(attrs.tds, observedAt ? { observedAt } : undefined) as NgsiLdProperty<number>
    }
    if (attrs.orp !== undefined) {
        entity['orp'] = property<number>(attrs.orp, observedAt ? { observedAt } : undefined) as NgsiLdProperty<number>
    }

    return entity
}
