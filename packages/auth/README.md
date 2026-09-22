# @cepseudo/auth

[![npm version](https://img.shields.io/npm/v/@cepseudo/auth)](https://www.npmjs.com/package/@cepseudo/auth)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

Pluggable authentication and user management for the Digital Twin framework.

## Installation

```bash
pnpm add @cepseudo/auth
```

**Peer dependency:** `@cepseudo/shared` (workspace)

## Auth Modes

| Mode | `AUTH_MODE` | Use case | How it works |
|------|------------|----------|--------------|
| **Trusted headers** | `trusted-headers` | Behind a reverse proxy or API gateway that authenticates the client and strips its identity headers | Reads the subject and roles from configurable headers; an optional shared secret in `x-auth-secret` proves the request came through the proxy |
| **Gateway (legacy)** | `gateway` | Same as trusted headers with fixed `x-user-id` / `x-user-roles` and no secret | Kept until the fail-closed defaults land; prefer `trusted-headers` |
| **OIDC** | `oidc` | Resource server for any OIDC issuer (Keycloak, Auth0, Entra, Zitadel, ...) | Validates `Authorization: Bearer <JWT>` against the issuer's JWKS, discovered from `/.well-known/openid-configuration` |
| **None** | `none` | Development and testing | Returns an anonymous user for every request, no credentials required |

## Usage

### Creating a provider from the environment

`createAuthProvider(env)` is the only place that reads auth variables. `AUTH_MODE` is required when `NODE_ENV=production`; elsewhere a missing value means `none`, with a warning.

```typescript
import { createAuthProvider } from '@cepseudo/auth'

const provider = createAuthProvider() // reads process.env

// Resolve discovery and signing keys up front so a misconfiguration stops start-up
await provider.ready?.()
```

To bypass the environment, instantiate a provider yourself and hand it to the engine:

```typescript
import { OidcAuthProvider } from '@cepseudo/auth'

new DigitalTwinEngine({
    auth: new OidcAuthProvider({ issuer: 'https://id.example.org/realms/city', audience: 'digitaltwin' }),
    ...
})
```

### Using the AuthProvider interface

All providers implement the same `AuthProvider` interface, a single async method:

```typescript
const user = await provider.authenticate(req) // AuthenticatedUser | null: { subject, roles, claims? }
```

### Setting up AuthMiddleware

`AuthMiddleware` is the single source of truth for authenticating HTTP requests across all components. It combines header/token parsing with user record management:

```typescript
import { AuthMiddleware, adminRoleFromEnv, createAuthProvider, UserService } from '@cepseudo/auth'
import type { UserRepository } from '@cepseudo/shared'

// UserRepository is injected (typically KyselyUserRepository from @cepseudo/database)
const userService = new UserService(userRepository)
const authMiddleware = new AuthMiddleware(createAuthProvider(), userService, { adminRole: adminRoleFromEnv() })
```

### Authenticating a request in a component

```typescript
const result = await authMiddleware.authenticate(req)

if (!result.success) {
    // result.response contains the appropriate error (401/500)
    return result.response
}

// result.user is the full UserRecord with id, keycloak_id, roles
// result.isAdmin is already decided from the configured admin role
const { user, isAdmin } = result
```

## Environment Variables

### General

| Variable | Description | Default |
|----------|-------------|---------|
| `AUTH_MODE` | Authentication mode: `oidc`, `trusted-headers`, `gateway` (legacy) or `none`. Required in production | `none` outside production, with a warning |
| `AUTH_ADMIN_ROLE` | Name of the admin role | `admin` |
| `DIGITALTWIN_ANONYMOUS_USER_ID` | Subject of the anonymous user in `none` mode | `anonymous` |

### OIDC Mode

| Variable | Description | Default |
|----------|-------------|---------|
| `OIDC_ISSUER` | Issuer URL; the token's `iss` must match it exactly (required) | - |
| `OIDC_AUDIENCE` | Audience the token must carry in `aud` (required) | - |
| `OIDC_ROLES_CLAIM` | Dot path of the claim holding the roles (Keycloak: `realm_access.roles`) | `roles` |
| `OIDC_CLOCK_TOLERANCE` | Accepted clock skew, in seconds | `5` |
| `OIDC_JWKS_URI` | JWKS endpoint to use instead of discovery | - |
| `OIDC_PUBLIC_KEY` | PEM public key to use instead of any JWKS (air-gapped setups) | - |

The subject is always the `sub` claim. Signing keys are cached and refetched when a token carries an unknown `kid`, so key rotation at the issuer needs no restart.

### Trusted Headers Mode (behind a gateway)

| Variable | Description | Default |
|----------|-------------|---------|
| `AUTH_HEADER_SUBJECT` | Header carrying the subject | `x-user-id` |
| `AUTH_HEADER_ROLES` | Header carrying the comma-separated roles | `x-user-roles` |
| `AUTH_HEADER_SECRET` | Shared secret the proxy must send in `x-auth-secret`; requests without it are refused | - |

Use this mode only when the application cannot be reached without going through the proxy that sets these headers, and make sure that proxy strips the same headers when they come from the client. The engine prints a warning at start-up to that effect. Set `AUTH_HEADER_SECRET` so a request that somehow bypasses the proxy still cannot claim an identity.

## License

MIT
