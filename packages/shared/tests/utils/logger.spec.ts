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

    // Helper to stringify args properly
    const stringify = (args: any[]): string => {
        return args.map(arg => {
            if (typeof arg === 'object' && arg !== null) {
                return JSON.stringify(arg)
            }
            return String(arg)
        }).join(' ')
    }

    console.log = (...args: any[]) => {
        logs.push(stringify(args))
    }
    console.warn = (...args: any[]) => {
        warnings.push(stringify(args))
    }
    console.error = (...args: any[]) => {
        errors.push(stringify(args))
    }

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

test.group('LogLevel enum', () => {
    test('should have correct level values', ({ assert }) => {
        assert.equal(LogLevel.DEBUG, 0)
        assert.equal(LogLevel.INFO, 1)
        assert.equal(LogLevel.WARN, 2)
        assert.equal(LogLevel.ERROR, 3)
        assert.equal(LogLevel.SILENT, 4)
    })

    test('levels should be ordered by severity', ({ assert }) => {
        assert.isTrue(LogLevel.DEBUG < LogLevel.INFO)
        assert.isTrue(LogLevel.INFO < LogLevel.WARN)
        assert.isTrue(LogLevel.WARN < LogLevel.ERROR)
        assert.isTrue(LogLevel.ERROR < LogLevel.SILENT)
    })
})

test.group('Logger construction', () => {
    test('should create logger with component name', ({ assert }) => {
        const logger = new Logger('TestComponent', LogLevel.SILENT)
        assert.isDefined(logger)
    })

    test('should use ERROR level by default in test environment', ({ assert }) => {
        // In test env, default level is ERROR
        const logger = new Logger('TestComponent')
        const capture = captureConsole()

        try {
            logger.debug('debug message')
            logger.info('info message')
            logger.warn('warn message')

            // These should not be logged at ERROR level
            assert.equal(capture.logs.length, 0)
            assert.equal(capture.warnings.length, 0)
        } finally {
            capture.restore()
        }
    })
})

test.group('Logger.debug()', () => {
    test('should log when level is DEBUG', ({ assert }) => {
        const logger = new Logger('TestComponent', LogLevel.DEBUG)
        const capture = captureConsole()

        try {
            logger.debug('test debug message')
            assert.equal(capture.logs.length, 1)
            assert.include(capture.logs[0], '[TestComponent]')
            assert.include(capture.logs[0], 'DEBUG:')
            assert.include(capture.logs[0], 'test debug message')
        } finally {
            capture.restore()
        }
    })

    test('should not log when level is above DEBUG', ({ assert }) => {
        const logger = new Logger('TestComponent', LogLevel.INFO)
        const capture = captureConsole()

        try {
            logger.debug('should not appear')
            assert.equal(capture.logs.length, 0)
        } finally {
            capture.restore()
        }
    })

    test('should log additional data if provided', ({ assert }) => {
        const logger = new Logger('TestComponent', LogLevel.DEBUG)
        const capture = captureConsole()

        try {
            logger.debug('message with data', { key: 'value' })
            assert.equal(capture.logs.length, 1)
            assert.include(capture.logs[0], 'key')
        } finally {
            capture.restore()
        }
    })
})

test.group('Logger.info()', () => {
    test('should log when level is INFO or lower', ({ assert }) => {
        const loggerDebug = new Logger('Test', LogLevel.DEBUG)
        const loggerInfo = new Logger('Test', LogLevel.INFO)
        const capture = captureConsole()

        try {
            loggerDebug.info('from debug logger')
            loggerInfo.info('from info logger')
            assert.equal(capture.logs.length, 2)
        } finally {
            capture.restore()
        }
    })

    test('should not log when level is above INFO', ({ assert }) => {
        const logger = new Logger('Test', LogLevel.WARN)
        const capture = captureConsole()

        try {
            logger.info('should not appear')
            assert.equal(capture.logs.length, 0)
        } finally {
            capture.restore()
        }
    })

    test('should include component name without DEBUG prefix', ({ assert }) => {
        const logger = new Logger('MyComponent', LogLevel.INFO)
        const capture = captureConsole()

        try {
            logger.info('info message')
            assert.include(capture.logs[0], '[MyComponent]')
            assert.notInclude(capture.logs[0], 'DEBUG:')
            assert.notInclude(capture.logs[0], 'INFO:') // INFO doesn't add prefix
        } finally {
            capture.restore()
        }
    })
})

test.group('Logger.warn()', () => {
    test('should log when level is WARN or lower', ({ assert }) => {
        const logger = new Logger('Test', LogLevel.WARN)
        const capture = captureConsole()

        try {
            logger.warn('warning message')
            assert.equal(capture.warnings.length, 1)
            assert.include(capture.warnings[0], 'WARN:')
        } finally {
            capture.restore()
        }
    })

    test('should not log when level is ERROR', ({ assert }) => {
        const logger = new Logger('Test', LogLevel.ERROR)
        const capture = captureConsole()

        try {
            logger.warn('should not appear')
            assert.equal(capture.warnings.length, 0)
        } finally {
            capture.restore()
        }
    })
})

test.group('Logger.error()', () => {
    test('should log when level is ERROR or lower', ({ assert }) => {
        const logger = new Logger('Test', LogLevel.ERROR)
        const capture = captureConsole()

        try {
            logger.error('error message')
            assert.equal(capture.errors.length, 1)
            assert.include(capture.errors[0], 'ERROR:')
        } finally {
            capture.restore()
        }
    })

    test('should not log when level is SILENT', ({ assert }) => {
        const logger = new Logger('Test', LogLevel.SILENT)
        const capture = captureConsole()

        try {
            logger.error('should not appear')
            assert.equal(capture.errors.length, 0)
        } finally {
            capture.restore()
        }
    })

    test('should log error objects', ({ assert }) => {
        const logger = new Logger('Test', LogLevel.ERROR)
        const capture = captureConsole()

        try {
            const error = new Error('test error')
            logger.error('operation failed', error)
            assert.equal(capture.errors.length, 1)
            assert.include(capture.errors[0], 'operation failed')
        } finally {
            capture.restore()
        }
    })
})

test.group('Logger SILENT level', () => {
    test('should not log anything at SILENT level', ({ assert }) => {
        const logger = new Logger('Test', LogLevel.SILENT)
        const capture = captureConsole()

        try {
            logger.debug('debug')
            logger.info('info')
            logger.warn('warn')
            logger.error('error')

            assert.equal(capture.logs.length, 0)
            assert.equal(capture.warnings.length, 0)
            assert.equal(capture.errors.length, 0)
        } finally {
            capture.restore()
        }
    })
})

test.group('Logger data handling', () => {
    test('should handle undefined data gracefully', ({ assert }) => {
        const logger = new Logger('Test', LogLevel.DEBUG)
        const capture = captureConsole()

        try {
            logger.debug('message')
            logger.info('message')
            logger.warn('message')
            logger.error('message')

            // Should not throw and should log empty string for data
            assert.equal(capture.logs.length, 2) // debug and info
            assert.equal(capture.warnings.length, 1)
            assert.equal(capture.errors.length, 1)
        } finally {
            capture.restore()
        }
    })

    test('should handle null data', ({ assert }) => {
        const logger = new Logger('Test', LogLevel.DEBUG)
        const capture = captureConsole()

        try {
            logger.debug('message', null)
            assert.equal(capture.logs.length, 1)
        } finally {
            capture.restore()
        }
    })

    test('should handle complex objects', ({ assert }) => {
        const logger = new Logger('Test', LogLevel.DEBUG)
        const capture = captureConsole()

        try {
            logger.debug('message', { nested: { deep: { value: 42 } } })
            assert.equal(capture.logs.length, 1)
        } finally {
            capture.restore()
        }
    })
})
