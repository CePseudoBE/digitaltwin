import type { TestContext } from '@japa/runner/core'
import type { Assert } from '@japa/assert'

export type ctx = TestContext & { assert: Assert }
