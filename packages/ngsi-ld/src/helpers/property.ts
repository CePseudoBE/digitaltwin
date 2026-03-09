import type { NgsiLdProperty, NgsiLdGeoProperty, NgsiLdRelationship, GeoJsonGeometry } from '../types/entity.js'

/**
 * Creates an NGSI-LD Property attribute.
 *
 * @param value - The property value
 * @param meta - Optional metadata (observedAt, unitCode, etc.)
 */
export function property<T>(
    value: T,
    meta?: { observedAt?: string; unitCode?: string; [key: string]: unknown }
): NgsiLdProperty<T> {
    return {
        type: 'Property',
        value,
        ...meta
    }
}

/**
 * Creates an NGSI-LD GeoProperty attribute.
 *
 * @param geojson - A GeoJSON geometry object
 * @param meta - Optional metadata (observedAt, etc.)
 */
export function geoProperty(
    geojson: GeoJsonGeometry,
    meta?: { observedAt?: string; [key: string]: unknown }
): NgsiLdGeoProperty {
    return {
        type: 'GeoProperty',
        value: geojson,
        ...meta
    }
}

/**
 * Creates an NGSI-LD Relationship attribute.
 *
 * @param urn - The URN of the related entity
 * @param meta - Optional metadata (observedAt, etc.)
 */
export function relationship(
    urn: string,
    meta?: { observedAt?: string; [key: string]: unknown }
): NgsiLdRelationship {
    return {
        type: 'Relationship',
        object: urn,
        ...meta
    }
}
