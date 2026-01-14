/**
 * Enumeration of available logging levels.
 *
 * Levels are ordered by severity, with lower numbers being more verbose.
 *
 * @enum {number}
 */
export enum LogLevel {
    /** Debug messages - most verbose, includes internal state information */
    DEBUG = 0,
    /** Informational messages - general application flow */
    INFO = 1,
    /** Warning messages - potential issues that don't prevent operation */
    WARN = 2,
    /** Error messages - failures that affect functionality */
    ERROR = 3,
    /** Silent mode - no logging output */
    SILENT = 4
}

/**
 * Simple logger class for Digital Twin framework components.
 *
 * Provides structured logging with component identification and configurable levels.
 * Automatically adjusts log level based on environment (silent in tests).
 *
 * @class Logger
 *
 * @example
 * ```typescript
 * const logger = new Logger('MyCollector', LogLevel.DEBUG)
 * logger.info('Starting data collection')
 * logger.error('Failed to connect', error)
 * ```
 */
export class Logger {
    /**
     * Creates a new logger instance for a component.
     *
     * @param {string} componentName - Name of the component for log prefixing
     * @param {LogLevel} level - Minimum log level to output (defaults based on NODE_ENV)
     */
    constructor(
        private readonly componentName: string,
        private readonly level: LogLevel = process.env.NODE_ENV === 'test' ? LogLevel.ERROR : LogLevel.INFO
    ) {}

    /**
     * Logs debug information for development and troubleshooting.
     *
     * @param {string} message - Debug message
     * @param {any} data - Optional additional data to log
     */
    debug(message: string, data?: any) {
        if (this.level <= LogLevel.DEBUG) {
            console.log(`[${this.componentName}] DEBUG: ${message}`, data || '')
        }
    }

    /**
     * Logs informational messages about normal operation.
     *
     * @param {string} message - Information message
     * @param {any} data - Optional additional data to log
     */
    info(message: string, data?: any) {
        if (this.level <= LogLevel.INFO) {
            console.log(`[${this.componentName}] ${message}`, data || '')
        }
    }

    /**
     * Logs warning messages about potential issues.
     *
     * @param {string} message - Warning message
     * @param {any} data - Optional additional data to log
     */
    warn(message: string, data?: any) {
        if (this.level <= LogLevel.WARN) {
            console.warn(`[${this.componentName}] WARN: ${message}`, data || '')
        }
    }

    /**
     * Logs error messages about failures and exceptions.
     *
     * @param {string} message - Error message
     * @param {any} error - Optional error object or additional data
     */
    error(message: string, error?: any) {
        if (this.level <= LogLevel.ERROR) {
            console.error(`[${this.componentName}] ERROR: ${message}`, error || '')
        }
    }
}
