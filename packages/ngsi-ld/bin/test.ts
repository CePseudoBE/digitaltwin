import { configure, run } from '@japa/runner'
import { assert } from '@japa/assert'
import * as reporters from '@japa/runner/reporters'

process.env.NODE_ENV = 'test'

const args = process.argv.slice(2).filter(arg => arg !== '--')
const fileFilter = args.length > 0 ? args : []

configure({
    files: ['tests/**/*.spec.ts'],
    plugins: [assert()],
    reporters: {
        activated: ['spec'],
        list: [reporters.spec()],
    },
    timeout: 30000,
    forceExit: true,
    filters: {
        tests: process.env.TEST_NAME ? [process.env.TEST_NAME] : [],
        files: fileFilter,
    },
})

run()
