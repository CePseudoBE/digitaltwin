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
| **JWT** | `jwt` | Standalone deployment without a gateway | Validates Bearer tokens from the `Authorization` header using HMAC or RSA/EC |
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
    mode: 'jwt',
    adminRoleName: 'admin',
    jwt: {
        secret: 'your-hmac-secret',
        algorithm: 'HS256',
        userIdClaim: 'sub',
        rolesClaim: 'roles',
    },
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
| `AUTH_MODE` | Authentication mode: `gateway`, `jwt`, or `none` | `gateway` |
| `AUTH_ADMIN_ROLE` | Name of the admin role | `admin` |
| `DIGITALTWIN_DISABLE_AUTH` | Set to `true` to disable auth (legacy, equivalent to `none`) | - |
| `DIGITALTWIN_ANONYMOUS_USER_ID` | User ID for anonymous access in `none` mode | `anonymous` |

### JWT Mode

| Variable | Description | Default |
|----------|-------------|---------|
| `JWT_SECRET` | HMAC secret key (required if no public key) | - |
| `JWT_PUBLIC_KEY` | RSA/EC public key content | - |
| `JWT_PUBLIC_KEY_FILE` | Path to public key file | - |
| `JWT_ALGORITHM` | Signing algorithm | `HS256` |
| `JWT_ISSUER` | Expected token issuer | - |
| `JWT_AUDIENCE` | Expected token audience | - |
| `JWT_USER_ID_CLAIM` | JWT claim containing the user ID | `sub` |
| `JWT_ROLES_CLAIM` | JWT claim containing roles (supports dot-paths like `realm_access.roles`) | `roles` |

## License

MIT
