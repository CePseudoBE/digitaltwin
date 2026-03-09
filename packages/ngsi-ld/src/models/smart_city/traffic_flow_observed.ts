import type { NgsiLdEntity, NgsiLdProperty } from '../../types/entity.js'
import { property } from '../../helpers/property.js'
import { buildUrn } from '../../helpers/urn.js'
import { NGSI_LD_CORE_CONTEXT } from '../../types/context.js'

export interface TrafficFlowObservedAttributes {
    localId: string
    dateObserved?: string
    intensity?: number
    occupancy?: number
    averageVehicleSpeed?: number
    averageVehicleLength?: number
    congested?: boolean
    averageHeadwayTime?: number
    laneId?: number
    laneDirection?: string
    vehicleType?: string
}

/**
 * Builds an NGSI-LD TrafficFlowObserved entity.
 */
export function buildTrafficFlowObserved(attrs: TrafficFlowObservedAttributes): NgsiLdEntity {
    const entity: NgsiLdEntity = {
        id: buildUrn('TrafficFlowObserved', attrs.localId),
        type: 'TrafficFlowObserved',
        '@context': NGSI_LD_CORE_CONTEXT,
    }

    const observedAt = attrs.dateObserved

    if (attrs.dateObserved !== undefined) {
        entity['dateObserved'] = property(attrs.dateObserved)
    }
    if (attrs.intensity !== undefined) {
        entity['intensity'] = property<number>(attrs.intensity, observedAt ? { observedAt } : undefined) as NgsiLdProperty<number>
    }
    if (attrs.occupancy !== undefined) {
        entity['occupancy'] = property<number>(attrs.occupancy, observedAt ? { observedAt } : undefined) as NgsiLdProperty<number>
    }
    if (attrs.averageVehicleSpeed !== undefined) {
        entity['averageVehicleSpeed'] = property<number>(attrs.averageVehicleSpeed, observedAt ? { observedAt } : undefined) as NgsiLdProperty<number>
    }
    if (attrs.congested !== undefined) {
        entity['congested'] = property(attrs.congested)
    }
    if (attrs.laneId !== undefined) {
        entity['laneId'] = property<number>(attrs.laneId) as NgsiLdProperty<number>
    }
    if (attrs.vehicleType !== undefined) {
        entity['vehicleType'] = property(attrs.vehicleType)
    }

    return entity
}
