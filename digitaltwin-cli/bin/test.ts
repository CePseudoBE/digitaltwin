import { configure, run } from '@japa/runner'
import { assert } from '@japa/assert'
import * as reporters from '@japa/runner/reporters'

// Set test environment
process.env.NODE_ENV = 'test'
process.env.TS_NODE_PROJECT = 'tsconfig.json'
process.env.TS_NODE_TRANSPILE_ONLY = 'true'

// Get file filter from CLI args
const args = process.argv.slice(2).filter((arg) => arg !== '--')
const fileFilter = args.length > 0 ? args : []

configure({
  files: ['tests/**/*.spec.ts'],
  plugins: [assert()],
  reporters: {
    activated: ['spec'],
    list: [reporters.spec()],
  },
  timeout: 10000,
  forceExit: true,
  filters: {
    tests: process.env.TEST_NAME ? [process.env.TEST_NAME] : [],
    files: fileFilter,
  },
})

run()
