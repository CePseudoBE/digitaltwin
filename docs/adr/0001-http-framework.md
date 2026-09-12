# ADR 0001: HTTP layer for the 2.0 line

- **Status:** Accepted (2026-09-12). Proposed and discussed the same day; the four open questions are resolved below.
- **Deciders:** maintainer
- **Scope:** which HTTP framework and runtime the engine, assets managers and the NGSI-LD plugin build on. Does not decide validation or OpenAPI libraries, but constrains them (see Open questions).

## Context

The engine serves HTTP through `ultimate-express`, an Express-API clone running on `uWebSockets.js`. It was chosen for throughput. Three things changed since:

1. **The framework is becoming a public library.** Whatever we build on is installed by strangers. `ultimate-express` depends on `uWebSockets.js` as a Git dependency (`github:uNetworking/uWebSockets.js#v20.69.0`) with native binaries, is written by one person, has about 6 000 weekly downloads, and requires Node 22 or later. Its own issue #364 ("officially pointless?") asks whether Node 24 erased its advantage; the maintainer has not replied.
2. **We want a TypeScript-first, batteries-included layer.** Today typed routes, validation, OpenAPI, multipart, CORS and compression are all bolted on separately (VineJS, a hand-rolled OpenAPI generator, `multer`, `cors`, `compression`).
3. **Bun was considered and ruled out** for now (see appendix): `uWebSockets.js` does not load on Bun, `better-sqlite3` crashes on it, and `testcontainers` is unsupported. Any move must stay Node-first.

### What the code actually depends on

Measured on `develop` at `aa84634`:

| Surface | Count |
|---|---|
| Files importing `ultimate-express` | 10 (engine 3, ngsi-ld 5, shared 2) |
| Direct `req.*` / `res.*` uses | assets 35, engine 17, ngsi-ld 60, auth 13, components 7, shared 4 |
| uWebSockets-specific workarounds in the engine | 4 (argument order of `listen`, timeouts, synchronous `close()`, port lookup) |

Components already return a framework-neutral `DataResponse` object; the engine's `endpoints.ts` adapts it to the response. The request side is not neutral: `TypedRequest` in `@cepseudo/shared` extends the Express `Request` type, so user handlers read `req.params`, `req.query`, `req.body`, `req.headers`, `req.file`.

### What we measured

Trivial JSON route, one middleware, 100 connections, 10 s, Node 24.14, Windows laptop, 2026-09-12:

| Framework | req/s (`/`) | req/s (`/users/:id`) | p99 |
|---|---|---|---|
| ultimate-express 2.2.1 | 21 000 | 19 500 | 7 ms |
| Express 5.2.1 | 12 700 | 12 000 | 10 ms |

The "Express is 3x faster on Node 24" claim from ultimate-express issue #364 did not reproduce here. Independent numbers with a stated Node version: Fastify 5 is about 55 % faster than Express 5 on Node 24 (toolchew, 4 vCPU), and on Node 26 Fastify, h3, Hono and Elysia-on-Node land within about 10 % of each other with Express 2x slower and ultimate-express 1.7x faster than Fastify (SaltyAom benchmark). Every real route in this framework does a PostgreSQL query or an S3 round trip, each costing milliseconds; the framework costs tens of microseconds. Throughput ranking matters as a tie-breaker, not as the decision.

## Decision criteria

In order:

1. **Maintained for years by more than one person.** Foundation or multi-maintainer governance, regular releases, a written LTS policy.
2. **TypeScript-first and complete.** Typed params/body/query, schema validation, OpenAPI, multipart, CORS, compression, static files from first-party packages, not from a pile of unrelated middleware.
3. **Node 20/22/24 first-class**, not an adapter. Bun tolerated, not required.
4. **Fast on Node 24**, in the top group. Not necessarily the fastest.
5. **Contributor-friendly.** Newcomers should recognise it and find answers.
6. **Migration cost** from the current `(req, res)` contract.

## Options considered

| | Express 5 | Fastify 5 | Hono | Elysia | Keep ultimate-express |
|---|---|---|---|---|---|
| Latest release | 5.2.1, 2025-12 (1 release in 2026) | 5.12.4, 2026-09-11 (26 in 2026) | 4.13.7, 2026-09-04 (50 in 2026) | 1.4.30, 2026-08; 2.0 beta | 2.2.1, 2026-07-30 |
| Weekly downloads | 97.8 M | 9.5 M | 48.7 M | 825 k | 6 k |
| Governance | OpenJS Foundation, TC, 32 committers in 2026 | OpenJS, 5 lead maintainers, 31 committers in 2026, written LTS | One dominant maintainer | One maintainer, rewrite in progress | One developer |
| Node support | ≥ 18, first-class | 20/22/24/26 first-class, LTS table | Adapter (`@hono/node-server`) | Adapter, 14 open adapter issues | ≥ 22, native binary from Git |
| Typed routes + validation | Generics only, no validation | JSON Schema native, TypeBox/Zod type providers | Route-typed, `@hono/*-validator` | TypeBox built in | As Express 4 |
| OpenAPI | Third-party, small | `@fastify/swagger`, first-party, 1.9 M/wk | `@hono/zod-openapi` (Zod only) | First-party | None |
| Multipart | `multer` (streams) | `@fastify/multipart`, streaming | Buffers files in memory | Buffers files | `multer` |
| CORS / compression / static | Separate packages | `@fastify/cors`, `@fastify/compress`, `@fastify/static` | Built in | Plugins | Separate packages |
| Speed on Node 24 (relative) | 1x | ~1.5x | ~1.5x | ~1.5x | ~2.5x |
| 2025–2026 concerns | Slow cadence, no ESM yet, 5.2.0 reverted same day | Security fixes may ship as minors; 6.0 (Node 24+) in alpha | 4 advisories in 2026 (static traversal, CORS reflection, ReDoS, memo leak), one maintainer | Bun-first, Elysia 2 breaks API and package scope | Git dependency, Node 22+, unanswered "pointless?" issue |
| Migration cost | Trivial | Medium | Medium–high (no Express bridge, multipart rewrite) | High + runtime change | None |

Koa (coasting, no ecosystem), h3 v2 (still RC after a year, one maintainer) and NestJS (dictates consumers' architecture, wraps Express/Fastify anyway) were reviewed and dropped.

## Decision

**Adopt Fastify 5 as the HTTP layer of the 2.0 line**, with the TypeBox type provider, `@fastify/multipart`, `@fastify/cors`, `@fastify/compress`, `@fastify/static` and `@fastify/swagger`.

Why Fastify over the alternatives, against the criteria:

1. It is the only candidate that is both multi-maintainer, foundation-backed and Node-first with a written LTS. Hono and Elysia are one-person projects; Express has the governance but not the features.
2. Schema-first routes give typed params/body/query, validation, response serialisation and OpenAPI from one declaration, which is exactly the "complete without bolt-ons" requirement.
3. Streaming multipart matters for tilesets and models; Hono and Elysia buffer whole files in memory.
4. It is in the top performance group on Node 24 and the gap to ultimate-express is within what a single DB query costs.
5. Every Node developer has seen it; the `@fastify/*` organisation answers most "how do I" questions.

### How the migration would work

- **Framework-neutral request contract in `@cepseudo/shared`.** `TypedRequest` stops extending the Express type. It becomes our own interface (`params`, `query`, `body`, `headers`, `user`, optional `file` stream metadata). Components keep returning `DataResponse`. This is the one change user code sees, and it is the change that makes the framework swappable at all.
- **Engine adapter.** `endpoints.ts` and `digital_twin_engine.ts` map the contract onto Fastify routes, plugins and hooks. The four uWebSockets workarounds disappear.
- **Assets and NGSI-LD** rewrite their direct `req`/`res` usage (about 95 sites) against the contract or against Fastify's `request`/`reply` where they register routes themselves. The NGSI-LD plugin registers a Fastify plugin instead of an Express router.
- **Uploads.** Presigned URLs stay the path for large files. The legacy multipart path moves from `multer` to `@fastify/multipart` with the size limits from issue #47.
- **No `@fastify/express` compatibility shim.** We have no external users with Express middleware; carrying the shim would keep the old contract alive.
- **Health, graceful shutdown, OpenAPI** map onto Fastify's `close()`, `onClose` hooks and `@fastify/swagger`. The hand-rolled YAML emitter (#69) goes away with it.

### Where it fits in the roadmap

Milestone **"1. HTTP layer (Fastify)"** sits between "0. Stabilize" and "2. Auth 2.0"; the later milestones were renumbered. Reason: Auth 2.0 (#57–#64) and the HTTP switch touch the same handler files in assets and ngsi-ld; doing HTTP first means those files are rewritten once, and the new `AuthMiddleware` hooks into Fastify directly instead of being ported twice.

## Consequences

Positive:

- One dependency organisation with a security policy replaces five unrelated middleware packages and a Git-hosted native binary.
- Typed routes and OpenAPI from schemas; the custom OpenAPI generator and YAML emitter are deleted.
- The request contract becomes ours, so a future framework change is an engine-only change.
- Node 20 through 26 covered by a published LTS table; Bun runs Fastify's `node:http` path if a user insists.

Negative:

- Raw throughput roughly halves on trivial routes compared to ultimate-express. Accepted: no route in this framework is trivial.
- Fastify may ship breaking changes in minors for security fixes, and 6.0 (Node 24+) will land during the 2.0 lifetime. Budget one framework major upgrade.
- About 95 direct `req`/`res` call sites to rewrite, plus every HTTP-level test in engine, assets, ngsi-ld and e2e.
- Fastify's schema-first style is a different mental model from Express for contributors who only know the latter.

## Resolved questions

1. **Validation library: TypeBox.** Schemas are JSON Schema at the type level, validated by Fastify at the route and reused for OpenAPI. VineJS is removed rather than bridged; the codebase has one schema file, and starting the 2.0 line on one validation model is worth more than keeping it.
2. **Milestone order: HTTP before Auth 2.0.** The handler files in assets and ngsi-ld are rewritten once.
3. **`TypedRequest` stays minimal:** params, query, body, headers, user, file metadata. No access to the underlying Fastify request from component code. Anything that needs Fastify directly lives in the engine or registers its own Fastify plugin (as the NGSI-LD package does).
4. **Hono not pursued.** Portability to Bun, Deno or workers is not a product goal; nothing in the stack (BullMQ, Kysely, S3 SDK, testcontainers) runs outside Node anyway. Revisit only if that goal appears, as a new ADR.

## Appendix: why not Bun now

Checked on 2026-09-12 against Bun 1.4:

| Dependency | On Bun |
|---|---|
| ultimate-express / uWebSockets.js | Does not load (V8 native addon, Bun issue #4290 open) |
| better-sqlite3 | Crashes (N-API/ABI, several 2025–2026 issues) |
| testcontainers | "Not officially supported" per maintainer |
| BullMQ + ioredis | Works with caveats; BullMQ 6 has a Bun adapter, fixes still landing in Aug 2026 |
| Kysely + pg, AWS SDK, jose, Japa | Work (S3 body streams had a concurrency hang fixed in 2026) |

Bun 1.4 (Aug 2026) is a Zig-to-Rust rewrite with about 30 breaking changes in a minor release. Revisit when the native-addon gap closes, BullMQ's Bun adapter has a quiet stretch, and 1.4.x settles. Whatever we pick must avoid `bun:*` and `Bun.*` APIs so that users who run Bun can.

## Sources

- npm registry and GitHub API queries, 2026-09-12 (versions, dates, downloads, contributors).
- Express: https://github.com/expressjs/express/releases · https://expressjs.com/en/guide/migrating-5/
- Fastify: https://github.com/fastify/fastify/blob/main/docs/Reference/LTS.md · https://github.com/fastify/fastify-multipart · https://github.com/fastify/fastify-express
- Hono: https://github.com/honojs/node-server/releases/tag/v2.0.0 · https://github.com/honojs/hono/issues/3293 · https://github.com/advisories/GHSA-q5qw-h33p-qvwr
- Elysia: https://elysiajs.com/blog/elysia-20 · https://github.com/elysiajs/node/issues
- ultimate-express: https://github.com/dimdenGD/ultimate-express/issues/364 · https://github.com/uNetworking/uWebSockets.js/blob/master/misc/npm.md
- Benchmarks: https://toolchew.com/en/fastify-vs-express/ (Node 24.15) · https://github.com/SaltyAom/bun-http-framework-benchmark (Node 26.1) · local run above
- Bun: https://github.com/oven-sh/bun/issues/4290 · https://github.com/oven-sh/bun/issues/24956 · https://github.com/testcontainers/testcontainers-node/discussions/1115 · https://docs.bullmq.io/guide/connections · https://bun.com/blog/bun-v1.4
