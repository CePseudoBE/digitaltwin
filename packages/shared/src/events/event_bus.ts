import { EventEmitter } from 'events'

/**
 * Interface representing an event emitted by digital twin components.
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
 * for component lifecycle events.
 */
export class EngineEventBus extends EventEmitter {
    override emit(event: string, data: ComponentEvent): boolean {
        return super.emit(event, data)
    }

    override on(event: string, listener: (data: ComponentEvent) => void): this {
        return super.on(event, listener)
    }
}

/**
 * Global event bus singleton for the digital twin engine.
 */
export const engineEventBus = new EngineEventBus()
