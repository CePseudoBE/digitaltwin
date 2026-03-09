import type { NgsiLdEntity, NgsiLdProperty } from '../../types/entity.js'
import { property } from '../../helpers/property.js'
import { buildUrn } from '../../helpers/urn.js'
import { NGSI_LD_CORE_CONTEXT } from '../../types/context.js'

export interface StreetLightAttributes {
    localId: string
    status?: 'ok' | 'defectiveLamp' | 'columnIssue' | 'ballastProblem' | 'okLampNotWorking' | 'vandalized'
    powerState?: 'on' | 'off' | 'low' | 'bootingUp'
    illuminanceLevel?: number
    powerConsumption?: number
    dateLastSwitchingOn?: string
    dateLastSwitchingOff?: string
    refStreetLightGroup?: string
}

/**
 * Builds an NGSI-LD StreetLight entity.
 */
export function buildStreetLight(attrs: StreetLightAttributes): NgsiLdEntity {
    const entity: NgsiLdEntity = {
        id: buildUrn('StreetLight', attrs.localId),
        type: 'StreetLight',
        '@context': NGSI_LD_CORE_CONTEXT,
    }

    if (attrs.status !== undefined) {
        entity['status'] = property(attrs.status)
    }
    if (attrs.powerState !== undefined) {
        entity['powerState'] = property(attrs.powerState)
    }
    if (attrs.illuminanceLevel !== undefined) {
        entity['illuminanceLevel'] = property<number>(attrs.illuminanceLevel) as NgsiLdProperty<number>
    }
    if (attrs.powerConsumption !== undefined) {
        entity['powerConsumption'] = property<number>(attrs.powerConsumption) as NgsiLdProperty<number>
    }
    if (attrs.dateLastSwitchingOn !== undefined) {
        entity['dateLastSwitchingOn'] = property(attrs.dateLastSwitchingOn)
    }
    if (attrs.dateLastSwitchingOff !== undefined) {
        entity['dateLastSwitchingOff'] = property(attrs.dateLastSwitchingOff)
    }

    return entity
}
