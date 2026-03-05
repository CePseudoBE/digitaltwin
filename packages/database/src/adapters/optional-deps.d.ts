// Type declarations for optional peer dependencies
// These modules are dynamically imported at runtime only when needed

declare module 'pg' {
    export class Pool {
        constructor(config: Record<string, unknown>)
    }
}

declare module 'better-sqlite3' {
    class Database {
        constructor(filename: string)
        pragma(stmt: string): unknown
        exec(sql: string): void
        close(): void
    }
    export default Database
}
