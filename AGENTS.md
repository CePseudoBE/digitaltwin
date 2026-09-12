# AGENTS.md

Instructions for AI coding agents (Claude Code, Codex, Cursor, Copilot, ...) working in this repository. Humans: read CONTRIBUTING.md first, in particular "AI-Assisted Contributions". Everything below is binding for the agent; the human author of a PR stays responsible for every line.

## Roadmap 2.0

The package split (phases 1–4 of the original migration) is done: all implementation lives in `packages/*`, `digitaltwin-core` is a re-export shim scheduled for removal.

Current work is the **2.0 roadmap**, tracked in GitHub Issues + Milestones (see `ROADMAP.md`):

0. Stabilize (audit bugs, no breaking changes)
1. Auth 2.0 — OIDC Bearer resource server, async `AuthProvider`, generic trusted-headers mode, fail-closed defaults
2. Provider-neutral naming (OVH → S3, keycloak_id → subject, no APISIX)
3. Remove legacy (`digitaltwin-core`, Knex adapter, dead code)
4. Onboarding experience (docker-compose, example app, docs, scaffolder)
5. Release 2.0

Pick issues from the earliest open milestone. Milestones are worked in order; within a milestone, follow `Depends on:` lines in issue bodies. Breaking changes are allowed on the 2.0 line and must be listed in the issue and the PR.

## Working With the Maintainer

The public policy in CONTRIBUTING.md ("AI-Assisted Contributions") applies to work done with you. In practice:

- **The human decides.** When a change involves a judgement call (where a fix belongs, whether to add an abstraction, what a test should prove, whether to widen scope), name the options and your recommendation, then let the human choose. Do not bury a design decision inside a large diff.
- **List the decisions you took** at the end of every task, so they can be copied into the PR "Decisions" section. Anything you were unsure about goes there too.
- **Never open or merge a PR on your own.** Push and open a PR only after the human has read the diff and said so. Never use `--no-verify`, never force-push shared branches.
- **Verify, do not assert.** Run the build, tests and lint of every touched package before claiming something works, and report failures verbatim.
- **Stay inside the issue.** Do not fix neighbouring things silently; mention them and offer to open an issue.
- **Do not trust yourself on security or data-loss paths.** Flag them explicitly so the human reviews those lines first.

## Engineering Rules

- **Never break the build.** Every PR leaves `pnpm build`, `pnpm test` and `pnpm lint` green.
- **One issue per PR**, PR targets `develop`, body contains `Closes #<n>`.
- **Root-cause fixes.** Grep every caller of what you touch; fix in the shared place, not in one caller.
- **`@cepseudo/ngsi-ld` is fully optional.** The engine discovers it with a dynamic `import()`; no other package may import it.
- **Update imports in the same commit** when moving or renaming.
- **No `export *`.** Explicit named exports in every `index.ts`.
- **No `any`.** Use `TypedRequest` and generics. Fix existing `any` when touching a file.
- **Tests required.** Every new module has Japa tests in its package's `tests/` folder.
- **Preserve git history.** `git mv` when moving files.

---

## Repository Structure

### Target Architecture

```
packages/
├── shared/          → Types, errors, utils, validation, env (LAYER 0)
├── database/        → DatabaseAdapter + KyselyDatabaseAdapter (LAYER 1; Knex adapter is legacy, removed in milestone 3)
├── storage/         → StorageService + OVH/Local adapters (LAYER 1)
├── auth/            → AuthProvider, UserService, AuthMiddleware (LAYER 1)
├── components/      → Collector, Harvester, Handler, CustomTableManager (LAYER 2)
├── assets/          → AssetsManager, TilesetManager, MapManager, presigned URLs (LAYER 2)
├── ngsi-ld/         → NGSI-LD API endpoints, mapper, subscriptions (LAYER 2)
├── engine/          → Engine, Scheduler, Queues, Loader, OpenAPI (LAYER 3)
├── cli/             → CLI tools for generating components (standalone)
└── create/          → Project scaffolding tool (standalone)
```

### Dependency Rules (strict, never violate)

```
LAYER 0: shared          → no internal dependencies
LAYER 1: database        → shared
          storage        → shared
          auth           → shared, database
LAYER 2: components      → shared, database (type only), storage (type only)
          assets         → shared, database, storage, auth
          ngsi-ld        → shared, database, components (OPTIONAL PACKAGE — see below)
LAYER 3: engine          → shared, database, storage, auth, components, assets
                            + ngsi-ld (optional, loaded dynamically if installed)
```

- **Never import from a higher layer.** A layer 1 package must never import from layer 2 or 3.
- **Prefer `import type` for cross-package dependencies** when only types are needed.
- **Circular dependencies are forbidden.** If extracting code would create one, refactor first.

### Optional Package Pattern (`@cepseudo/ngsi-ld`)

The NGSI-LD package is a plugin. The engine and other packages must NEVER hard-import it. Instead:

```typescript
// In the engine — dynamic discovery
async function loadOptionalPackages() {
    try {
        const ngsiLd = await import('@cepseudo/ngsi-ld')
        // Register NGSI-LD endpoints, subscription matcher, entity cache
        return ngsiLd
    } catch {
        // Package not installed — skip silently, framework works without it
        logger.info('NGSI-LD package not installed, skipping')
        return null
    }
}
```

The integration point is the **EventBus**. The NGSI-LD package listens to `data:written` events emitted by Collectors. If the package is not loaded, no one listens, nothing happens.

```
Collector writes data → EventBus emits "data:written"
  ├── ngsi-ld installed → SubscriptionMatcher evaluates + notifies
  └── ngsi-ld not installed → event ignored, no side effects
```

**Rules for keeping ngsi-ld optional:**
- No package in layers 0-2 (except ngsi-ld itself) may `import` from `@cepseudo/ngsi-ld`
- The engine uses `dynamic import()` with try/catch, never a static import
- EventBus event names/payloads are defined in `@cepseudo/shared`, not in ngsi-ld
- If ngsi-ld needs a new event type, the event type goes in shared, the listener goes in ngsi-ld
- The database migrations for ngsi-ld tables (subscriptions) run only when the package is present

### Legacy shim

`digitaltwin-core/` only re-exports from `packages/*`. Do not add code there. It is removed in roadmap milestone 3; new projects import from `@cepseudo/engine`, `@cepseudo/components`, etc.

---

## Package Manager

This project uses **pnpm** with workspaces defined in `pnpm-workspace.yaml`.

```bash
pnpm install             # Install all dependencies
pnpm build               # Build all packages
pnpm test                # Run tests
pnpm lint                # Lint all packages
pnpm clean               # Clean all dist/ folders
```

Per-package commands:
```bash
pnpm --filter @cepseudo/<package> build
pnpm --filter @cepseudo/<package> dev
pnpm --filter @cepseudo/<package> test
```

---

## Architecture Overview

### Component Model

The framework is component-based. Components are user-defined classes that plug into the engine:

- **Collectors**: Scheduled components that fetch data from external APIs/sources, optionally transform it, and store it in the database. Can run at any frequency (hourly, every second, etc.).
- **Harvesters**: Read data from the database (typically data written by Collectors), transform/aggregate it into new datasets, and write the results back to the database.
- **Handlers**: Expose HTTP endpoints for real-time request/response operations. Do NOT write to the database.
- **Assets Managers**: Handle file uploads with metadata, CRUD operations, and user ownership. Files are stored on OVH Object Storage (S3-compatible), metadata in PostgreSQL.

All components implement `getConfiguration()` and active components (Collector, Harvester) implement `setDependencies(database, storage)`.

### Engine System

- **DigitalTwinEngine**: Central orchestrator — initializes components, manages DI, HTTP, queues, shutdown.
- **QueueManager**: 4 BullMQ queues (collectors, harvesters, priority, uploads) backed by Redis.
- **Scheduler**: Cron scheduling + event-driven triggers via BullMQ.
- **EventBus**: Internal event system (`engineEventBus`) for decoupled communication.

### Storage Architecture

```
PostgreSQL  → Metadata, user ownership, subscriptions, historical data
Redis       → BullMQ queues, subscription cache, entity last-state cache
OVH S3      → Raw files (3D assets, collected data, tilesets)
```

### Authentication & Authorization

**Being replaced (roadmap milestone 1).** Target: the framework is an OIDC resource server. Clients send `Authorization: Bearer <JWT>`; the framework validates it against the issuer's JWKS (`OIDC_ISSUER`, `OIDC_AUDIENCE`, `OIDC_ROLES_CLAIM`). A generic, opt-in trusted-headers mode replaces the APISIX parser for deployments behind a gateway. `AUTH_MODE` is required in production. Until milestone 1 lands, the current behaviour is:

Auth is handled externally by an API Gateway (Apache APISIX) which validates tokens and forwards user info via headers:

- `x-user-id`: User identifier
- `x-user-roles`: Comma-separated roles

The framework parses these via `ApisixAuthParser`, manages user records in the database, and enforces resource ownership.

**Important**: A shared `AuthMiddleware` class handles authentication for all components. Do NOT duplicate auth logic — always use `AuthMiddleware.authenticate(req)`.

---

## Design Notes

### Presigned URL Upload Flow

Large files (3D assets) must NOT transit through the backend or APISIX. The flow:

1. Client → `POST /assets/upload-request` (JWT + fileName, size, contentType)
2. Backend verifies JWT, creates DB entry (`status: pending`), generates presigned PUT URL
3. Client uploads directly to OVH S3 (multipart for files > 100MB)
4. Client → `POST /assets/confirm/{fileId}`
5. Backend does HEAD request on S3 to verify → `status: completed`

**Reconciliation cron** (every 5 min):
- `pending` > 5 min + file exists on S3 → `completed`
- `pending` + presigned URL expired + no file → `expired`
- Multipart not finalized > 2h → `AbortMultipartUpload` + `failed`

**CORS configuration required on OVH bucket:**
```json
{
  "CORSRules": [{
    "AllowedOrigins": ["https://your-domain.be"],
    "AllowedMethods": ["PUT", "POST"],
    "AllowedHeaders": ["*"],
    "MaxAgeSeconds": 3600
  }]
}
```

### NGSI-LD Implementation

We implement the ETSI NGSI-LD spec directly — **no FIWARE/Orion dependency**. NGSI-LD is an open standard.

#### Package Structure

```
packages/ngsi-ld/src/
├── mapper/
│   ├── entity_mapper.ts         → DataRecord ↔ NGSI-LD Entity conversion
│   ├── property_mapper.ts       → Fields → Property/Relationship
│   └── context_manager.ts       → @context JSON-LD management
├── endpoints/
│   ├── entities.ts              → CRUD /ngsi-ld/v1/entities
│   ├── subscriptions.ts         → CRUD /ngsi-ld/v1/subscriptions
│   └── types.ts                 → GET /ngsi-ld/v1/types
├── subscriptions/
│   ├── subscription_store.ts    → PostgreSQL persistence
│   ├── subscription_cache.ts    → Redis cache (active subscriptions)
│   ├── subscription_matcher.ts  → Condition evaluation on data write
│   └── notification_sender.ts   → Webhook dispatch via BullMQ
├── cache/
│   └── entity_cache.ts          → Redis cache for entity last-state
├── models/
│   └── ...                      → Smart Data Model templates
└── index.ts
```

#### API Endpoints to Implement

```
GET/POST        /ngsi-ld/v1/entities
GET/PATCH/DELETE /ngsi-ld/v1/entities/{entityId}
PATCH           /ngsi-ld/v1/entities/{entityId}/attrs
GET             /ngsi-ld/v1/types
POST/GET        /ngsi-ld/v1/subscriptions
GET/PATCH/DELETE /ngsi-ld/v1/subscriptions/{id}
```

Query parameters: `type`, `q` (e.g. `pm25>30;temperature<10`), `attrs`, `georel/geometry/coordinates` (future).

#### Subscription & Notification Flow

```
1. Client POST /ngsi-ld/v1/subscriptions → saved in PostgreSQL + cached in Redis
2. Collector writes data → EventBus emits "data:written"
3. SubscriptionMatcher reads Redis cache → evaluates conditions
4. If match + throttling OK → enqueue notification in BullMQ
5. Worker POSTs webhook payload to subscriber endpoint (with retry)
```

**Redis structure for subscriptions:**
```
SET   "subs:type:AirQualityObserved"  → [sub_1, sub_7, sub_12]
HASH  "sub:sub_1"                     → { endpoint, q, watchedAttributes, throttling, lastNotifiedAt }
```

**Redis structure for entity last-state cache:**
```
HASH  "entity:urn:ngsi-ld:AirQualityObserved:sensor-3" → { pm25: 63.2, no2: 28.1, observedAt: "..." }
```

- Last-state queries → served from Redis (sub-millisecond)
- Historical queries → served from PostgreSQL
- Raw files → served from S3

#### NGSI-LD Entity Format

```json
{
  "id": "urn:ngsi-ld:AirQualityObserved:sensor-42",
  "type": "AirQualityObserved",
  "@context": "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld",
  "pm25": {
    "type": "Property",
    "value": 63.2,
    "observedAt": "2026-02-28T14:32:00Z"
  }
}
```

---

## Testing Framework

Uses **Japa** (not Jest):
- Test files: `tests/**/*.spec.ts` or `packages/*/tests/**/*.spec.ts`
- Run: `pnpm test`
- Timeout: 10 seconds
- Context setup: `tests/context.ts`

---

## Code Generation

```bash
node dt make:collector WeatherCollector --description "Weather data collector"
node dt make:handler ApiHandler --method post
node dt make:harvester DataProcessor --source weather-collector
node dt make:assets-manager ImageManager --content-type "image/jpeg"
node dt make:tileset-manager BuildingTilesets
node dt make:map-manager CityMaps
```

---

## Database Schema

### User Management (existing)

```sql
CREATE TABLE users (
                       id INTEGER PRIMARY KEY,
                       keycloak_id VARCHAR(255) UNIQUE NOT NULL,
                       created_at TIMESTAMP,
                       updated_at TIMESTAMP
);

CREATE TABLE roles (
                       id INTEGER PRIMARY KEY,
                       name VARCHAR(100) UNIQUE NOT NULL,
                       created_at TIMESTAMP
);

CREATE TABLE user_roles (
                            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                            role_id INTEGER REFERENCES roles(id) ON DELETE CASCADE,
                            created_at TIMESTAMP,
                            PRIMARY KEY (user_id, role_id)
);
```

### NGSI-LD Subscriptions

```sql
CREATE TABLE ngsi_ld_subscriptions (
                                       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                                       name VARCHAR(255),
                                       description TEXT,
                                       entity_types TEXT[],
                                       watched_attributes TEXT[],
                                       q VARCHAR(1000),
                                       notification_endpoint VARCHAR(500) NOT NULL,
                                       notification_format VARCHAR(50) DEFAULT 'normalized',
                                       throttling INTEGER DEFAULT 0,
                                       expires_at TIMESTAMP,
                                       is_active BOOLEAN DEFAULT true,
                                       last_notification_at TIMESTAMP,
                                       last_success_at TIMESTAMP,
                                       times_sent INTEGER DEFAULT 0,
                                       times_failed INTEGER DEFAULT 0,
                                       created_at TIMESTAMP DEFAULT NOW(),
                                       updated_at TIMESTAMP DEFAULT NOW()
);
```

---

## Dependencies

### Runtime

```
ultimate-express          HTTP server
bullmq + ioredis          Queue management + Redis
knex                      Database query builder (PostgreSQL, SQLite)
@aws-sdk/client-s3        OVH Object Storage (S3-compatible)
@aws-sdk/s3-request-presigner  Presigned URL generation
multer                    File upload handling (legacy, replaced by presigned URLs for large files)
jsonwebtoken              JWT validation
@vinejs/vine              Input validation
jszip                     ZIP handling for tilesets
cors                      CORS middleware
lodash/debounce           Utility
```

### Development

```
typescript 5.8+           Strict typing
eslint + prettier          Linting and formatting
@japa/runner              Testing framework
tsx                       TypeScript execution
```

---

## Git Workflow

This project follows **Git Flow**.

### Branch Strategy

```
main        → Production-ready. Merges trigger npm publish pipeline. Never commit directly.
develop     → Integration branch. All feature PRs target develop.
feat/xxx    → Feature branches off develop (e.g. feat/presigned-urls, feat/ngsi-ld-mapper)
fix/xxx     → Bugfix branches off develop
release/x.y → Release prep branches (develop → main)
hotfix/xxx  → Emergency fixes off main, merged back to both main and develop
```

### Publishing

Packages are published to npm **only via the main branch pipeline**. Never publish manually. The flow is:
1. Feature branches merge into `develop` via PR
2. When ready for release, create `release/x.y` from `develop`
3. Merge `release/x.y` into `main` → pipeline publishes to npm automatically
4. Merge `main` back into `develop`

### Commits

- **Format**: Conventional Commits — `type(scope): description`
- **Types**: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`, `style`
- **Scopes**: `shared`, `core`, `cli`, `create`, `engine`, `collector`, `harvester`, `handler`, `assets`, `auth`, `storage`, `queue`, `db`, `ngsi-ld`, `subscriptions`
- Atomic commits (one logical change per commit)
- Messages in English

### Strict Rules

- **Commit messages and code comments never mention AI tools.** No `Co-Authored-By`, no "generated by". AI use is disclosed once, in the PR description checklist, by the human author (see CONTRIBUTING.md, "AI-Assisted Contributions").
- Never commit directly to `main` or `develop`
- Always create PR towards `develop`

---

## Code Style

- **No `any`** — use proper types. `TypedRequest` for HTTP requests, generics where needed.
- **No `export *`** — explicit named exports in every `index.ts`.
- **No auth duplication** — use `AuthMiddleware` from `@cepseudo/auth`.
- **No direct Knex access outside database package** — always go through `DatabaseAdapter` or `UserRepository`.
- Concise variable names in implementation, descriptive names for public APIs.
- Prefer `import type` for cross-package type-only imports.
- Error handling: use the custom error hierarchy from `@cepseudo/shared/errors`.
- Async: use `safeAsync`/`tryAsync`/`retryAsync` from `@cepseudo/shared/utils`.