import type { NgsiLdEntity, NgsiLdProperty } from '../../types/entity.js'
import { property } from '../../helpers/property.js'
import { buildUrn } from '../../helpers/urn.js'
import { NGSI_LD_CORE_CONTEXT } from '../../types/context.js'

export interface AgriParcelAttributes {
    localId: string
    name?: string
    area?: number
    cropStatus?: string
    lastPlantedAt?: string
    hasAgriSoil?: string
    hasAgriCrop?: string
    ownedBy?: string
    belongsTo?: string
}

/**
 * Builds an NGSI-LD AgriParcel entity.
 */
export function buildAgriParcel(attrs: AgriParcelAttributes): NgsiLdEntity {
    const entity: NgsiLdEntity = {
        id: buildUrn('AgriParcel', attrs.localId),
        type: 'AgriParcel',
        '@context': NGSI_LD_CORE_CONTEXT,
    }

    if (attrs.name !== undefined) {
        entity['name'] = property(attrs.name)
    }
    if (attrs.area !== undefined) {
        entity['area'] = property<number>(attrs.area) as NgsiLdProperty<number>
    }
    if (attrs.cropStatus !== undefined) {
        entity['cropStatus'] = property(attrs.cropStatus)
    }
    if (attrs.lastPlantedAt !== undefined) {
        entity['lastPlantedAt'] = property(attrs.lastPlantedAt)
    }

    return entity
}
