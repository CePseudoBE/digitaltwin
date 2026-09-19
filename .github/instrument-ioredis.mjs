import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
const require = createRequire(path.resolve('packages/engine/package.json'))
const built = path.dirname(require.resolve('ioredis'))
let command = fs.readFileSync(`${built}/Command.js`, 'utf8')
command = command.replace('this.name = name;\n        this.inTransaction = false;', 'this.name = name;\n        this.createdStack = new Error("created").stack;\n        this.inTransaction = false;')
fs.writeFileSync(`${built}/Command.js`, command)
let redis = fs.readFileSync(`${built}/Redis.js`, 'utf8')
redis = redis.split('item.command.reject(error);').join('item.command.reject(new Error(error.message + " [" + item.command.name + " " + item.command.args.slice(0, 2).join(",") + "] " + item.command.createdStack));')
fs.writeFileSync(`${built}/Redis.js`, redis)
console.log('instrumented', built, (redis.match(/createdStack/g) || []).length, (command.match(/createdStack/g) || []).length)
