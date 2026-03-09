import type { NgsiLdEntity, NgsiLdProperty } from '../../types/entity.js'
import { property } from '../../helpers/property.js'
import { buildUrn } from '../../helpers/urn.js'
import { NGSI_LD_CORE_CONTEXT } from '../../types/context.js'

export interface DeviceAttributes {
    localId: string
    category?: string[]
    controlledAsset?: string[]
    ipAddress?: string[]
    deviceState?: string
    dateLastValueReported?: string
    value?: string
    serialNumber?: string
    refDeviceModel?: string
    batteryLevel?: number
    rssi?: number
    firmwareVersion?: string
    osVersion?: string
    softwareVersion?: string
    hardwareVersion?: string
    name?: string
}

/**
 * Builds an NGSI-LD Device entity.
 */
export function buildDevice(attrs: DeviceAttributes): NgsiLdEntity {
    const entity: NgsiLdEntity = {
        id: buildUrn('Device', attrs.localId),
        type: 'Device',
        '@context': NGSI_LD_CORE_CONTEXT,
    }

    if (attrs.category !== undefined) {
        entity['category'] = property(attrs.category) as NgsiLdProperty<string[]>
    }
    if (attrs.deviceState !== undefined) {
        entity['deviceState'] = property(attrs.deviceState)
    }
    if (attrs.dateLastValueReported !== undefined) {
        entity['dateLastValueReported'] = property(attrs.dateLastValueReported)
    }
    if (attrs.batteryLevel !== undefined) {
        entity['batteryLevel'] = property<number>(attrs.batteryLevel) as NgsiLdProperty<number>
    }
    if (attrs.rssi !== undefined) {
        entity['rssi'] = property<number>(attrs.rssi) as NgsiLdProperty<number>
    }
    if (attrs.firmwareVersion !== undefined) {
        entity['firmwareVersion'] = property(attrs.firmwareVersion)
    }
    if (attrs.name !== undefined) {
        entity['name'] = property(attrs.name)
    }
    if (attrs.serialNumber !== undefined) {
        entity['serialNumber'] = property(attrs.serialNumber)
    }

    return entity
}
