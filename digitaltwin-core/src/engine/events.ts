/**
 * @fileoverview Event system for digital twin engine component communication
 *
 * This module provides a centralized event bus for components to communicate
 * asynchronously about their execution status and data processing events.
 */

import { EventEmitter } from 'events'

/**
 * Interface representing an event emitted by digital twin components.
 *
 * Component events provide information about component execution lifecycle,
 * allowing other parts of the system to react to component state changes.
 *
 * @example
 * ```typescript
 * const event: ComponentEvent = {
 *   type: 'collector:completed',
 *   componentName: 'weather-data-collector',
 *   timestamp: new Date(),
 *   data: { recordsProcessed: 150 }
 * };
 * ```
 */
export interface ComponentEvent {
    /** The type of event that occurred */
    type: 'collector:completed' | 'harvester:completed'

    /** Name of the component that emitted this event */
    componentName: string

    /** Timestamp when the event occurred */
    timestamp: Date

    /** Optional additional data related to the event */
    data?: Record<string, unknown>
}

/**
 * Enhanced event bus for digital twin engine component communication.
 *
 * Extends Node.js EventEmitter to provide type-safe event handling
 * for component lifecycle events. All components can emit events
 * to notify other parts of the system about their execution status.
 *
 * @example
 * ```typescript
 * // Listen for collector completion events
 * engineEventBus.on('collector:completed', (event) => {
 *   console.log(`Collector ${event.componentName} completed at ${event.timestamp}`);
 * });
 *
 * // Emit an event from a component
 * engineEventBus.emit('collector:completed', {
 *   type: 'collector:completed',
 *   componentName: 'my-collector',
 *   timestamp: new Date(),
 *   data: { success: true }
 * });
 * ```
 */
export class EngineEventBus extends EventEmitter {
    /**
     * Emits a component event to all registered listeners.
     *
     * @param event - The event name/type to emit
     * @param data - The component event data
     * @returns True if the event had listeners, false otherwise
     */
    override emit(event: string, data: ComponentEvent): boolean {
        return super.emit(event, data)
    }

    /**
     * Registers a listener for component events.
     *
     * @param event - The event name/type to listen for
     * @param listener - Function to call when the event is emitted
     * @returns This event bus instance for method chaining
     */
    override on(event: string, listener: (data: ComponentEvent) => void): this {
        return super.on(event, listener)
    }
}

/**
 * Global event bus instance for the digital twin engine.
 *
 * This singleton provides a centralized communication channel
 * for all components within the digital twin system.
 *
 * @example
 * ```typescript
 * // Listen for all collector events
 * engineEventBus.on('collector:completed', (event) => {
 *   console.log(`Collector completed: ${event.componentName}`);
 * });
 *
 * // Components emit events through this bus
 * engineEventBus.emit('collector:completed', eventData);
 * ```
 */
export const engineEventBus = new EngineEventBus()
