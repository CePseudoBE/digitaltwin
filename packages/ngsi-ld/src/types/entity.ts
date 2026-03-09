import type { JsonLdContext } from './context.js'

/**
 * A GeoJSON geometry value as per RFC 7946.
 */
export interface GeoJsonGeometry {
    type: 'Point' | 'LineString' | 'Polygon' | 'MultiPoint' | 'MultiLineString' | 'MultiPolygon'
    coordinates: number | number[] | number[][] | number[][][] | number[][][][]
}

/**
 * An NGSI-LD Property holding a typed value.
 */
export interface NgsiLdProperty<T = unknown> {
    type: 'Property'
    value: T
    observedAt?: string
    unitCode?: string
    [key: string]: unknown
}

/**
 * An NGSI-LD GeoProperty holding a GeoJSON geometry.
 */
export interface NgsiLdGeoProperty {
    type: 'GeoProperty'
    value: GeoJsonGeometry
    observedAt?: string
    [key: string]: unknown
}

/**
 * An NGSI-LD Relationship pointing to another entity by URN.
 */
export interface NgsiLdRelationship {
    type: 'Relationship'
    object: string
    observedAt?: string
    [key: string]: unknown
}

/**
 * An NGSI-LD entity with typed attributes.
 */
export interface NgsiLdEntity {
    id: string
    type: string
    '@context'?: JsonLdContext
    [key: string]: NgsiLdProperty | NgsiLdGeoProperty | NgsiLdRelationship | string | JsonLdContext | undefined
}
