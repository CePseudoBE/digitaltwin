// Plugin entry point
export { registerNgsiLd } from './plugin.js'
export type { NgsiLdPluginOptions } from './plugin.js'

// Types
export type { NgsiLdEntity, NgsiLdProperty, NgsiLdGeoProperty, NgsiLdRelationship, GeoJsonGeometry } from './types/entity.js'
export type { Subscription, SubscriptionCreate, NotificationEndpoint, NotificationFormat } from './types/subscription.js'
export type { NotificationPayload, NotificationJobData } from './types/notification.js'
export type { JsonLdContext } from './types/context.js'
export { NGSI_LD_CORE_CONTEXT } from './types/context.js'

// Helpers
export { property, geoProperty, relationship } from './helpers/property.js'
export { buildUrn, parseUrn } from './helpers/urn.js'
export type { ParsedUrn } from './helpers/urn.js'

// Abstract components
export { NgsiLdCollector } from './components/ngsi_ld_collector.js'
export { NgsiLdHarvester } from './components/ngsi_ld_harvester.js'
export { isNgsiLdCollector, isNgsiLdHarvester } from './components/type_guards.js'

// Subsystems (for advanced usage)
export { EntityCache } from './cache/entity_cache.js'
export { SubscriptionStore } from './subscriptions/subscription_store.js'
export { SubscriptionCache } from './subscriptions/subscription_cache.js'
export { SubscriptionMatcher } from './subscriptions/subscription_matcher.js'
export { parseQ, evaluateQ } from './subscriptions/q_parser.js'
export type { QExpr, QComparison, QAnd, QOperator } from './subscriptions/q_parser.js'

// Smart Data Models
export {
    buildAirQualityObserved,
    buildWeatherObserved,
    buildWaterQualityObserved,
    buildNoiseLevelObserved,
    buildStreetLight,
    buildParkingSpot,
    buildTrafficFlowObserved,
    buildAgriParcel,
    buildAgriSoilMeasurement,
    buildAgriWeatherObserved,
    buildDevice,
    buildDeviceMeasurement,
} from './models/index.js'

export type {
    AirQualityObservedAttributes,
    WeatherObservedAttributes,
    WaterQualityObservedAttributes,
    NoiseLevelObservedAttributes,
    StreetLightAttributes,
    ParkingSpotAttributes,
    TrafficFlowObservedAttributes,
    AgriParcelAttributes,
    AgriSoilMeasurementAttributes,
    AgriWeatherObservedAttributes,
    DeviceAttributes,
    DeviceMeasurementAttributes,
} from './models/index.js'
