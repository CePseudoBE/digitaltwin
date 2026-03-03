/**
 * @fileoverview Component auto-discovery and loading utilities
 *
 * This module provides utilities for automatically discovering and loading
 * Digital Twin components from a directory based on file naming conventions.
 *
 * @example
 * ```typescript
 * import { loadComponents } from 'digitaltwin-core'
 *
 * const result = await loadComponents('./dist/components')
 *
 * const engine = new DigitalTwinEngine({ storage, database })
 * engine.registerComponents(result)
 * await engine.start()
 * ```
 */

export { loadComponents, type LoadComponentsOptions, type LoadComponentsResult } from './component_loader.js'
