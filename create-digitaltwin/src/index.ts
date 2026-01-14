#!/usr/bin/env node

/**
 * Create Digital Twin CLI Entry Point
 * 
 * This is the main entry point for the create-digitaltwin package.
 * It can be invoked via:
 * - npx create-digitaltwin
 * - npm init digitaltwin
 * - yarn create digitaltwin
 */

import { createDigitalTwinApp } from './cli.js'

createDigitalTwinApp().catch((error: Error) => {
  console.error('Failed to create Digital Twin app:', error.message)
  process.exit(1)
})