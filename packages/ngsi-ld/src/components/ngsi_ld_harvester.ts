import { Harvester } from '@digitaltwin/components'
import type { DataRecord } from '@digitaltwin/shared'
import type { NgsiLdEntity } from '../types/entity.js'

/**
 * Abstract base class for NGSI-LD-aware Harvesters.
 *
 * Extends the standard Harvester with the ability to produce NGSI-LD entities
 * from harvested data. The engine's NGSI-LD plugin will call `toNgsiLdEntity`
 * after each successful harvest run to update the entity cache.
 *
 * @abstract
 */
export abstract class NgsiLdHarvester extends Harvester {
    /**
     * Converts the latest harvested data into an NGSI-LD entity.
     *
     * Called by the NGSI-LD plugin after each successful `harvest()` run.
     *
     * @param data - The parsed JSON data from the most recent harvest
     * @param record - The raw DataRecord as stored in the database
     * @returns A fully formed NGSI-LD entity
     */
    abstract toNgsiLdEntity(data: unknown, record: DataRecord): NgsiLdEntity
}
