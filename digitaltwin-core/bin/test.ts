import { configure, run } from '@japa/runner'
import { assert } from '@japa/assert'
import * as reporters from '@japa/runner/reporters'

// Set test environment
process.env.NODE_ENV = 'test'
process.env.TS_NODE_PROJECT = 'tsconfig.test.json'
process.env.TS_NODE_TRANSPILE_ONLY = 'true'
// Disable authentication for tests (unless explicitly testing auth)
process.env.DIGITALTWIN_DISABLE_AUTH = 'true'

// Get file filter from CLI args (e.g., pnpm test -- tests/errors/*.spec.ts)
// Filter out "--" separator from args
const args = process.argv.slice(2).filter(arg => arg !== '--')
const fileFilter = args.length > 0 ? args : []

configure({
  files: ['tests/**/*.spec.ts'],
  plugins: [assert()],
  reporters: {
    activated: ['spec'],
    list: [
      reporters.spec(),
    ],
  },
  timeout: 10000,
  forceExit: true,
  filters: {
    tests: process.env.TEST_NAME ? [process.env.TEST_NAME] : [],
    files: fileFilter,
  },
})

run()
