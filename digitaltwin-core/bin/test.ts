import { configure, processCLIArgs, run } from '@japa/runner'
import { assert } from '@japa/assert'
import * as reporters from '@japa/runner/reporters'

// Set test environment
process.env.NODE_ENV = 'test'
process.env.TS_NODE_PROJECT = 'tsconfig.test.json'
process.env.TS_NODE_TRANSPILE_ONLY = 'true'
// Disable authentication for tests (unless explicitly testing auth)
process.env.DIGITALTWIN_DISABLE_AUTH = 'true'

// Prend en compte les arguments CLI classiques
processCLIArgs(process.argv.slice(2))

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
    tags: [],
    groups: [],
    files: process.argv.length > 2 ? process.argv.slice(2) : [],
  },
})

run()
