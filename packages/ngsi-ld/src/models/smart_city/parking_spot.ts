import type { NgsiLdEntity, NgsiLdProperty } from '../../types/entity.js'
import { property } from '../../helpers/property.js'
import { buildUrn } from '../../helpers/urn.js'
import { NGSI_LD_CORE_CONTEXT } from '../../types/context.js'

export interface ParkingSpotAttributes {
    localId: string
    status?: 'free' | 'occupied' | 'closed' | 'unknown'
    category?: string[]
    refParkingSite?: string
    dateModified?: string
    name?: string
}

/**
 * Builds an NGSI-LD ParkingSpot entity.
 */
export function buildParkingSpot(attrs: ParkingSpotAttributes): NgsiLdEntity {
    const entity: NgsiLdEntity = {
        id: buildUrn('ParkingSpot', attrs.localId),
        type: 'ParkingSpot',
        '@context': NGSI_LD_CORE_CONTEXT,
    }

    if (attrs.status !== undefined) {
        entity['status'] = property(attrs.status)
    }
    if (attrs.category !== undefined) {
        entity['category'] = property(attrs.category) as NgsiLdProperty<string[]>
    }
    if (attrs.name !== undefined) {
        entity['name'] = property(attrs.name)
    }
    if (attrs.dateModified !== undefined) {
        entity['dateModified'] = property(attrs.dateModified)
    }

    return entity
}
