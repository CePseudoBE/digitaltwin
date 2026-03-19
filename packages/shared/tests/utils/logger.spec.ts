import { test } from '@japa/runner'
import { Logger, LogLevel } from '../../src/utils/logger.js'

// Helper to capture console output
function captureConsole() {
    const logs: string[] = []
    const warnings: string[] = []
    const errors: string[] = []

    const originalLog = console.log
    const originalWarn = console.warn
    const originalError = console.error

    const stringify = (args: any[]): string => {
        return args.map(arg => {
            if (typeof arg === 'object' && arg !== null) {
                return JSON.stringify(arg)
            }
            return String(arg)
        }).join(' ')
    }

    console.log = (...args: any[]) => { logs.push(stringify(args)) }
    console.warn = (...args: any[]) => { warnings.push(stringify(args)) }
    console.error = (...args: any[]) => { errors.push(stringify(args)) }

    return {
        logs,
        warnings,
        errors,
        restore: () => {
            console.log = originalLog
            console.warn = originalWarn
            console.error = originalError
        }
    }
}

test.group('Logger level filtering', () => {
    test('only logs messages at or above the configured level', ({ assert }) => {
        const logger = new Logger('Test', LogLevel.WARN)
        const capture = captureConsole()

        try {
            logger.debug('should be hidden')
            logger.info('should be hidden')
            logger.warn('visible warning')
            logger.error('visible error')

            assert.equal(capture.logs.length, 0)
            assert.equal(capture.warnings.length, 1)
            assert.equal(capture.errors.length, 1)
        } finally {
            capture.restore()
        }
    })

    test('SILENT level suppresses all output', ({ assert }) => {
        const logger = new Logger('Test', LogLevel.SILENT)
        const capture = captureConsole()

        try {
            logger.debug('hidden')
            logger.info('hidden')
            logger.warn('hidden')
            logger.error('hidden')

            assert.equal(capture.logs.length, 0)
            assert.equal(capture.warnings.length, 0)
            assert.equal(capture.errors.length, 0)
        } finally {
            capture.restore()
        }
    })

    test('defaults to ERROR level in test environment', ({ assert }) => {
        const logger = new Logger('Test')
        const capture = captureConsole()

        try {
            logger.debug('hidden')
            logger.info('hidden')
            logger.warn('hidden')
            logger.error('visible')

            assert.equal(capture.logs.length, 0)
            assert.equal(capture.warnings.length, 0)
            assert.equal(capture.errors.length, 1)
        } finally {
            capture.restore()
        }
    })
})

test.group('Logger output format', () => {
    test('includes component name and level prefix in output', ({ assert }) => {
        const logger = new Logger('MyCollector', LogLevel.DEBUG)
        const capture = captureConsole()

        try {
            logger.debug('fetching data')
            logger.warn('rate limited')
            logger.error('connection lost')

            assert.include(capture.logs[0], '[MyCollector]')
            assert.include(capture.logs[0], 'DEBUG:')
            assert.include(capture.warnings[0], 'WARN:')
            assert.include(capture.errors[0], 'ERROR:')
        } finally {
            capture.restore()
        }
    })

    test('includes additional data when provided', ({ assert }) => {
        const logger = new Logger('Test', LogLevel.DEBUG)
        const capture = captureConsole()

        try {
            logger.debug('query result', { rows: 42, table: 'users' })
            assert.include(capture.logs[0], 'rows')
        } finally {
            capture.restore()
        }
    })
})

test.group('Logger edge cases', () => {
    test('handles null, undefined, and error objects as data', ({ assert }) => {
        const logger = new Logger('Test', LogLevel.DEBUG)
        const capture = captureConsole()

        try {
            logger.debug('with null', null)
            logger.debug('with undefined')
            logger.error('operation failed', new Error('test error'))

            assert.equal(capture.logs.length, 2)
            assert.equal(capture.errors.length, 1)
            assert.include(capture.errors[0], 'operation failed')
        } finally {
            capture.restore()
        }
    })

    test('two loggers with different levels do not interfere', ({ assert }) => {
        const verbose = new Logger('Verbose', LogLevel.DEBUG)
        const quiet = new Logger('Quiet', LogLevel.ERROR)
        const capture = captureConsole()

        try {
            verbose.debug('should appear')
            quiet.debug('should not appear')

            assert.equal(capture.logs.length, 1)
            assert.include(capture.logs[0], '[Verbose]')
        } finally {
            capture.restore()
        }
    })
})
