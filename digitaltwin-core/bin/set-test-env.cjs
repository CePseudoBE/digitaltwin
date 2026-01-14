// CommonJS preload script to set environment variables before ESM loader
process.env.NODE_ENV = 'test'
process.env.TS_NODE_PROJECT = 'tsconfig.test.json'
process.env.TS_NODE_TRANSPILE_ONLY = 'true'
process.env.DIGITALTWIN_DISABLE_AUTH = 'true'
