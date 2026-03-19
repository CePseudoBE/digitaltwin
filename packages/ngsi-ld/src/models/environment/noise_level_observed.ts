import type { NgsiLdEntity, NgsiLdProperty } from '../../types/entity.js'
import { property } from '../../helpers/property.js'
import { buildUrn } from '../../helpers/urn.js'
import { NGSI_LD_CORE_CONTEXT } from '../../types/context.js'

export interface NoiseLevelObservedAttributes {
    localId: string
    dateObserved?: string
    LAeq?: number
    LAmax?: number
    LAmin?: number
    LAeq_d?: number
    LAeq_e?: number
    LAeq_n?: number
    sonometerClass?: string
}

/**
 * Builds an NGSI-LD NoiseLevelObserved entity.
 */
export function buildNoiseLevelObserved(attrs: NoiseLevelObservedAttributes): NgsiLdEntity {
    const entity: NgsiLdEntity = {
        id: buildUrn('NoiseLevelObserved', attrs.localId),
        type: 'NoiseLevelObserved',
        '@context': NGSI_LD_CORE_CONTEXT,
    }

    const observedAt = attrs.dateObserved

    if (attrs.dateObserved !== undefined) {
        entity['dateObserved'] = property(attrs.dateObserved)
    }
    if (attrs.LAeq !== undefined) {
        entity['LAeq'] = property<number>(attrs.LAeq, observedAt ? { observedAt } : undefined) as NgsiLdProperty<number>
    }
    if (attrs.LAmax !== undefined) {
        entity['LAmax'] = property<number>(attrs.LAmax, observedAt ? { observedAt } : undefined) as NgsiLdProperty<number>
    }
    if (attrs.LAmin !== undefined) {
        entity['LAmin'] = property<number>(attrs.LAmin, observedAt ? { observedAt } : undefined) as NgsiLdProperty<number>
    }
    if (attrs.sonometerClass !== undefined) {
        entity['sonometerClass'] = property(attrs.sonometerClass)
    }

    return entity
}
