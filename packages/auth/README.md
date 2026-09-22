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
| **Gateway** | `gateway` (default) | Production behind Apache APISIX or similar | Parses `x-user-id` and `x-user-roles` headers set by the API gateway |
| **OIDC** | `oidc` | Resource server for any OIDC issuer (Keycloak, Auth0, Entra, Zitadel, ...) | Validates `Authorization: Bearer <JWT>` against the issuer's JWKS, discovered from `/.well-known/openid-configuration` |
| **None** | `none` | Development and testing | Returns an anonymous user for every request, no credentials required |

## Usage

### Creating a provider with AuthProviderFactory

The factory reads environment variables to create the right provider:

```typescript
import { AuthProviderFactory } from '@cepseudo/auth'

// Auto-detect mode from AUTH_MODE env var (defaults to 'gateway')
const provider = AuthProviderFactory.fromEnv()

// Or configure explicitly
const provider = AuthProviderFactory.create({
    mode: 'oidc',
    oidc: {
        issuer: 'https://id.example.org/realms/city',
        audience: 'digitaltwin',
        rolesClaim: 'realm_access.roles',
    },
})

// Resolve discovery and signing keys up front so a misconfiguration stops start-up
await provider.ready?.()
```

### Using the AuthProvider interface

All providers implement the same `AuthProvider` interface, a single async method:

```typescript
const user = await provider.authenticate(req) // AuthenticatedUser | null: { subject, roles, claims? }
```

### Setting up AuthMiddleware

`AuthMiddleware` is the single source of truth for authenticating HTTP requests across all components. It combines header/token parsing with user record management:

```typescript
import { AuthMiddleware, AuthProviderFactory, UserService } from '@cepseudo/auth'
import type { UserRepository } from '@cepseudo/shared'

// UserRepository is injected (typically KyselyUserRepository from @cepseudo/database)
const userService = new UserService(userRepository)
const authMiddleware = new AuthMiddleware(AuthProviderFactory.fromEnv(), userService, { adminRole: 'admin' })
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
| `AUTH_MODE` | Authentication mode: `gateway`, `oidc`, or `none` | `gateway` |
| `AUTH_ADMIN_ROLE` | Name of the admin role | `admin` |
| `DIGITALTWIN_DISABLE_AUTH` | Set to `true` to disable auth (legacy, equivalent to `none`) | - |
| `DIGITALTWIN_ANONYMOUS_USER_ID` | User ID for anonymous access in `none` mode | `anonymous` |

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

## License

MIT
