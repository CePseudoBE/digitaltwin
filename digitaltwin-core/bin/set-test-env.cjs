// CommonJS preload script to set environment variables before ESM loader
process.env.NODE_ENV = 'test'
process.env.AUTH_MODE = 'none'
process.env.TSX_TSCONFIG_PATH = 'tsconfig.test.json'
