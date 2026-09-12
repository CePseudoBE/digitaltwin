# Roadmap

Goal of the 2.0 line: make the framework usable by people who are not us. Authentication against any OpenID Connect provider instead of gateway headers, no vendor names in code or configuration, one way of doing each thing, and a five-minute path from clone to running app.

The roadmap is tracked in **GitHub Issues and Milestones**, not in this file:

- Milestones: https://github.com/CePseudoBE/digitaltwin/milestones
- Every roadmap issue carries the `roadmap` label, a milestone, a list of files to start from, and acceptance criteria that define done.

## Milestones

| # | Milestone | Outcome |
|---|-----------|---------|
| 0 | Stabilize | Blocking bugs and security holes from the September 2026 audit fixed. No breaking changes. |
| 1 | HTTP layer (Fastify) | `ultimate-express` replaced by Fastify 5 + TypeBox per [ADR 0001](docs/adr/0001-http-framework.md): framework-neutral `TypedRequest`, official plugins for multipart, CORS, compression and OpenAPI, VineJS replaced by TypeBox. |
| 2 | Auth 2.0 (OIDC) | Async `AuthProvider`, `OidcAuthProvider` with JWKS discovery, generic opt-in trusted-headers mode, fail-closed defaults, `keycloak_id` → `subject`. |
| 3 | Provider-neutral naming | `OvhStorageService` → `S3StorageService`, `S3_*` env vars, no APISIX / OVH / Keycloak / ULB assumptions anywhere. |
| 4 | Remove legacy | `digitaltwin-core` shim, Knex adapter, hand-rolled YAML and other dead code deleted. |
| 5 | Onboarding experience | `docker-compose.dev.yml` with a demo Keycloak realm, `examples/smart-city`, README and CONTRIBUTING rewritten for strangers, scaffolder generating 2.0 projects, e2e OIDC test, development mode without Redis. |
| 6 | Release 2.0 | Migration guide, changelog, working publish pipeline, `2.0.0` on npm. |
| — | Backlog | Real bugs and improvements that do not block the 2.0 line. |

Architecture decisions that shape a milestone are recorded in `docs/adr/`. Milestones are worked in order. Inside a milestone, issues are independent unless their body says `Depends on:`.

## Process

1. Pick an unblocked issue from the earliest open milestone.
2. Branch `feat/<slug>` or `fix/<slug>` from `develop`.
3. Implement to the acceptance criteria, with tests in the touched package.
4. PR to `develop` with `Closes #<n>` in the body. Merging the PR closes the issue.
5. When a milestone's issues are all closed, close the milestone.

Release: `release/2.0` from `develop` → `main` → publish pipeline → merge back.

Engineering rules that apply to every roadmap PR: green build, tests and lint; one issue per PR; root-cause fixes; no `any`, no `export *`; Japa tests in the touched package; `git mv` for moves.
