import type { NgsiLdCollector } from './ngsi_ld_collector.js'
import type { NgsiLdHarvester } from './ngsi_ld_harvester.js'

/**
 * Duck-type guard: checks if a component implements the NgsiLdCollector contract.
 *
 * Uses structural typing to avoid a hard import of NgsiLdCollector in the engine.
 */
export function isNgsiLdCollector(component: unknown): component is NgsiLdCollector {
    return (
        component !== null &&
        typeof component === 'object' &&
        typeof (component as NgsiLdCollector).toNgsiLdEntity === 'function' &&
        typeof (component as NgsiLdCollector).collect === 'function' &&
        typeof (component as NgsiLdCollector).getSchedule === 'function'
    )
}

/**
 * Duck-type guard: checks if a component implements the NgsiLdHarvester contract.
 *
 * Uses structural typing to avoid a hard import of NgsiLdHarvester in the engine.
 */
export function isNgsiLdHarvester(component: unknown): component is NgsiLdHarvester {
    return (
        component !== null &&
        typeof component === 'object' &&
        typeof (component as NgsiLdHarvester).toNgsiLdEntity === 'function' &&
        typeof (component as NgsiLdHarvester).harvest === 'function' &&
        typeof (component as NgsiLdHarvester).getUserConfiguration === 'function'
    )
}
