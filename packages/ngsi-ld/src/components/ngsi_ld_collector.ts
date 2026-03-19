import { Collector } from '@cepseudo/components'
import type { DataRecord } from '@cepseudo/shared'
import type { NgsiLdEntity } from '../types/entity.js'

/**
 * Abstract base class for NGSI-LD-aware Collectors.
 *
 * Extends the standard Collector with the ability to produce NGSI-LD entities
 * from collected data. The engine's NGSI-LD plugin will call `toNgsiLdEntity`
 * after each successful collection run to update the entity cache.
 *
 * @abstract
 */
export abstract class NgsiLdCollector extends Collector {
    /**
     * Converts the latest collected data into an NGSI-LD entity.
     *
     * Called by the NGSI-LD plugin after each successful `collect()` run.
     *
     * @param data - The parsed JSON data from the most recent collection
     * @param record - The raw DataRecord as stored in the database
     * @returns A fully formed NGSI-LD entity
     */
    abstract toNgsiLdEntity(data: unknown, record: DataRecord): NgsiLdEntity
}
