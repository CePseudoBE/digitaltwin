/**
 * @fileoverview Type definitions and guards for dynamic component registration
 *
 * Provides type-safe utilities for runtime component type detection and
 * dynamic registration with the DigitalTwinEngine.
 */

import type { Collector } from '../components/collector.js'
import type { Harvester } from '../components/harvester.js'
import type { Handler } from '../components/handler.js'
import type { AssetsManager } from '../components/assets_manager.js'
import type { CustomTableManager } from '../components/custom_table_manager.js'

/**
 * String literal union of all component type names.
 * Used for discriminated unions and type narrowing.
 */
export type ComponentTypeName = 'collector' | 'harvester' | 'handler' | 'assets_manager' | 'custom_table_manager'

/**
 * Union type of all component class instances that can be registered.
 */
export type AnyComponent = Collector | Harvester | Handler | AssetsManager | CustomTableManager

/**
 * Union type of components that can be scheduled (have run() and getSchedule()).
 */
export type SchedulableComponent = Collector | Harvester

/**
 * Union type of components that require setDependencies(db, storage).
 */
export type ActiveComponent = Collector | Harvester

/**
 * Map of component type names to their corresponding class types.
 * Enables type-safe lookups and factory patterns.
 */
export interface ComponentTypeMap {
    collector: Collector
    harvester: Harvester
    handler: Handler
    assets_manager: AssetsManager
    custom_table_manager: CustomTableManager
}

/**
 * Result of loading components from a directory.
 */
export interface LoadedComponents {
    collectors: Collector[]
    harvesters: Harvester[]
    handlers: Handler[]
    assetsManagers: AssetsManager[]
    customTableManagers: CustomTableManager[]
}

/**
 * Type guard: Check if component is a Collector.
 * Collectors have collect() method and getSchedule().
 */
export function isCollector(component: AnyComponent): component is Collector {
    return (
        typeof (component as Collector).collect === 'function' &&
        typeof (component as Collector).getSchedule === 'function' &&
        typeof (component as Collector).setDependencies === 'function' &&
        typeof (component as Collector).run === 'function'
    )
}

/**
 * Type guard: Check if component is a Harvester.
 * Harvesters have harvest() method and getUserConfiguration().
 */
export function isHarvester(component: AnyComponent): component is Harvester {
    return (
        typeof (component as Harvester).harvest === 'function' &&
        typeof (component as Harvester).getUserConfiguration === 'function' &&
        typeof (component as Harvester).setDependencies === 'function' &&
        typeof (component as Harvester).run === 'function'
    )
}

/**
 * Type guard: Check if component is a Handler.
 * Handlers have getEndpoints() but NOT setDependencies() by default,
 * and don't have collect() or harvest().
 */
export function isHandler(component: AnyComponent): component is Handler {
    return (
        typeof (component as Handler).getEndpoints === 'function' &&
        typeof (component as Handler).getConfiguration === 'function' &&
        !('collect' in component && typeof (component as any).collect === 'function') &&
        !('harvest' in component && typeof (component as any).harvest === 'function') &&
        !('uploadAsset' in component && typeof (component as any).uploadAsset === 'function') &&
        !('initializeTable' in component && typeof (component as any).initializeTable === 'function')
    )
}

/**
 * Type guard: Check if component is an AssetsManager.
 * AssetsManager has uploadAsset() and getAllAssets().
 */
export function isAssetsManager(component: AnyComponent): component is AssetsManager {
    return (
        typeof (component as AssetsManager).uploadAsset === 'function' &&
        typeof (component as AssetsManager).getAllAssets === 'function' &&
        typeof (component as AssetsManager).setDependencies === 'function'
    )
}

/**
 * Type guard: Check if component is a CustomTableManager.
 * CustomTableManager has initializeTable() and findAll().
 */
export function isCustomTableManager(component: AnyComponent): component is CustomTableManager {
    return (
        typeof (component as CustomTableManager).initializeTable === 'function' &&
        typeof (component as CustomTableManager).findAll === 'function' &&
        typeof (component as CustomTableManager).create === 'function' &&
        typeof (component as CustomTableManager).setDependencies === 'function'
    )
}

/**
 * Type guard: Check if component is an active (schedulable) component.
 */
export function isActiveComponent(component: AnyComponent): component is ActiveComponent {
    return isCollector(component) || isHarvester(component)
}

/**
 * Detect the component type from an instance.
 * Uses type guards for accurate detection.
 *
 * @param component - The component instance to detect
 * @returns The detected component type name
 * @throws Error if component type cannot be determined
 *
 * @example
 * ```typescript
 * const type = detectComponentType(myComponent)
 * // type: 'collector' | 'harvester' | 'handler' | 'assets_manager' | 'custom_table_manager'
 * ```
 */
export function detectComponentType(component: AnyComponent): ComponentTypeName {
    // Order matters: check more specific types first
    if (isCollector(component)) return 'collector'
    if (isHarvester(component)) return 'harvester'
    if (isCustomTableManager(component)) return 'custom_table_manager'
    if (isAssetsManager(component)) return 'assets_manager'
    if (isHandler(component)) return 'handler'

    throw new Error(
        'Unable to detect component type. Component must extend Collector, Harvester, Handler, AssetsManager, or CustomTableManager.'
    )
}
