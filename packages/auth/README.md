# @cepseudo/auth

[![npm version](https://img.shields.io/npm/v/@cepseudo/auth)](https://www.npmjs.com/package/@cepseudo/auth)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

Authentication and user management for the Digital Twin framework.

## Installation

```bash
pnpm add @cepseudo/auth
```

**Peer dependency:** `@cepseudo/shared` (workspace)

## How authentication works

The framework is a **resource server**: it never logs anyone in. A client gets a token from your identity provider and sends it with each request; the framework checks it and turns it into a caller:

```typescript
{ subject: string, roles: string[], claims?: Record<string, unknown> }
```

- `subject` identifies the caller. Assets managers and custom tables authenticate their write routes, store the caller in the `users` table (created on its first request, roles synchronized into `roles` / `user_roles` on every request) and check ownership.
- Handlers receive the caller as `request.user` (undefined when anonymous) and decide themselves; nothing is stored.
- A request without valid credentials on a protected route gets `401`.

## Choosing a mode

`AUTH_MODE` selects how the caller is read:

| `AUTH_MODE` | Use it when | The caller comes from |
|-------------|-------------|-----------------------|
| `oidc` | Almost always: any deployment with an OIDC identity provider (Keycloak, Auth0, Microsoft Entra ID, Zitadel, ...) | `Authorization: Bearer <JWT>`, validated against the issuer's signing keys |
| `trusted-headers` | A gateway already authenticates every request and the application cannot be reached any other way | Headers set by that gateway (see [Running behind a gateway](#running-behind-a-gateway)) |
| `none` | Local development and tests | Nowhere: every request is the same anonymous user |

`AUTH_MODE` is required when `NODE_ENV=production`: the engine refuses to start without it. Elsewhere a missing value means `none`, with a warning. `gateway` is a deprecated alias of `trusted-headers` with fixed header names and no shared secret.

Prefer `oidc`, even behind a gateway: the application then checks every token itself instead of trusting whatever reaches it.

## OIDC

```env
AUTH_MODE=oidc
OIDC_ISSUER=https://id.example.org/realms/city
OIDC_AUDIENCE=digitaltwin
OIDC_ROLES_CLAIM=realm_access.roles
```

A token is accepted when:

- its signature matches a key of the issuer, fetched from `<OIDC_ISSUER>/.well-known/openid-configuration` (or from `OIDC_JWKS_URI` / `OIDC_PUBLIC_KEY`)
- `iss` is exactly `OIDC_ISSUER`, trailing slash included
- `aud` contains `OIDC_AUDIENCE`
- it is not expired and already valid, give or take `OIDC_CLOCK_TOLERANCE` seconds
- it has a `sub` claim, which becomes the subject

The discovery document is fetched when the engine starts, so a wrong or unreachable issuer stops start-up with a clear message instead of refusing every request later. The signing keys are fetched with the first token, cached, and refetched when a token carries an unknown `kid`, so key rotation at the issuer needs no restart.

**Roles.** `OIDC_ROLES_CLAIM` is a dot path into the token (`roles`, `realm_access.roles`, ...) that must lead to an array of strings. Each segment is a plain claim name, so a claim whose name contains a dot, such as a namespaced `https://example.org/roles`, cannot be read. A missing claim means no roles.

**Issuer reachability.** `OIDC_ISSUER` is the URL written in the tokens, usually the public one. If the application cannot reach it (a Docker network where the issuer is `http://keycloak:8080` inside but public outside), keep the public `OIDC_ISSUER` and point `OIDC_JWKS_URI` at the internal JWKS URL.

### Keycloak

```env
OIDC_ISSUER=https://id.example.org/realms/city
OIDC_AUDIENCE=digitaltwin
OIDC_ROLES_CLAIM=realm_access.roles
```

1. **Issuer**: `https://<host>/realms/<realm>` (`/auth/realms/<realm>` before Keycloak 17). Copy the `issuer` field of the realm's discovery document to be sure.
2. **Audience**: create a client for the API, for example `digitaltwin`, with no login flow enabled. Keycloak does not put it in access tokens by default: in the client your front end logs in with, open *Client scopes → <client>-dedicated → Add mapper → By configuration → Audience*, set *Included Client Audience* to `digitaltwin` and keep *Add to access token* on.
3. **Roles**: realm roles are in `realm_access.roles`. For roles of the `digitaltwin` client, use `resource_access.digitaltwin.roles` (the client id must not contain a dot).

### Auth0

```env
OIDC_ISSUER=https://your-tenant.eu.auth0.com/
OIDC_AUDIENCE=https://api.example.org/digitaltwin
OIDC_ROLES_CLAIM=digitaltwin_roles
```

1. **Issuer**: your tenant domain (or custom domain) **with** the trailing slash, as it appears in `iss`.
2. **Audience**: create an API under *Applications → APIs*; its *Identifier* is the audience. Clients must request tokens with `audience=<identifier>`, otherwise Auth0 returns a token meant for its own `/userinfo` endpoint.
3. **Roles**: Auth0 puts no roles in access tokens and reserves the `roles` claim name. Add a post-login Action that copies them into a claim of your own, without a dot in its name:

    ```javascript
    exports.onExecutePostLogin = async (event, api) => {
        api.accessToken.setCustomClaim('digitaltwin_roles', event.authorization?.roles ?? [])
    }
    ```

    Without an Action, you can instead enable *RBAC* and *Add Permissions in the Access Token* on the API and set `OIDC_ROLES_CLAIM=permissions`: permissions then play the part of roles, and `AUTH_ADMIN_ROLE` must name a permission.

### Microsoft Entra ID

```env
OIDC_ISSUER=https://login.microsoftonline.com/<tenant-id>/v2.0
OIDC_AUDIENCE=<application (client) ID of the API registration>
```

1. **Register the API** as an application and *Expose an API* with at least one scope, so clients can request tokens for it.
2. **Request v2 tokens**: in the API registration's manifest, set `requestedAccessTokenVersion` to `2`. The default v1 tokens carry `iss: https://sts.windows.net/<tenant-id>/`, which does not match the issuer above. In v2 tokens, `aud` is the API's application (client) ID.
3. **Roles**: define *App roles* on the API registration and assign them under *Enterprise applications → Users and groups*. They arrive in the `roles` claim, the default `OIDC_ROLES_CLAIM`.
4. **Single tenant only**: multi-tenant apps (`common`, `organizations`) get an issuer per tenant, which the exact `iss` check does not accept.

Entra's `sub` is unique per application: registering the API again gives every user a new subject, hence a new row in `users`.

## Who is admin

A caller is admin when its roles include `AUTH_ADMIN_ROLE` (default `admin`; the legacy `DIGITALTWIN_ADMIN_ROLE_NAME` is still read). In the assets managers (assets, tilesets, maps), an admin reads, updates and deletes every asset, including private assets owned by someone else. Everyone else only sees public assets and their own.

The anonymous user of `none` mode has the single role `anonymous`, so it is not admin unless you set `AUTH_ADMIN_ROLE=anonymous`.

## Running behind a gateway

The safest setup keeps `AUTH_MODE=oidc`: the gateway forwards the `Authorization` header untouched and the application validates the token itself. Nothing the gateway adds is trusted.

When the gateway must pass the identity in headers instead, use `AUTH_MODE=trusted-headers` and make all three of these true:

1. **The application is only reachable through the gateway**: no public port, a network policy or an internal interface.
2. **The gateway removes the identity headers sent by the client** (`AUTH_HEADER_SUBJECT`, `AUTH_HEADER_ROLES` and `x-auth-secret`) before setting its own.
3. **`AUTH_HEADER_SECRET` is set** and the gateway sends it in `x-auth-secret`, so a request that bypasses the gateway still cannot claim an identity.

```env
AUTH_MODE=trusted-headers
AUTH_HEADER_SUBJECT=x-user-id
AUTH_HEADER_ROLES=x-user-roles
AUTH_HEADER_SECRET=<long random value shared with the gateway>
```

The roles header is a comma-separated list. The engine prints a warning at start-up that repeats the first point, and says so when no secret is configured.

## Bring your own provider

Implement `AuthProvider` and pass it to the engine; `AUTH_MODE` and the `OIDC_*` / `AUTH_HEADER_*` variables are then ignored for reading the caller:

```typescript
import type { AuthProvider, AuthRequest } from '@cepseudo/auth'

class ApiKeyProvider implements AuthProvider {
    async authenticate(req: AuthRequest) {
        const key = req.headers['x-api-key']
        const client = typeof key === 'string' ? await lookUpApiKey(key) : undefined
        return client ? { subject: client.id, roles: client.roles } : null
    }

    // Optional: awaited before the server listens, to fail fast on missing configuration
    async ready() {}
}

new DigitalTwinEngine({ auth: new ApiKeyProvider(), ... })
```

Return `null` for a request without valid credentials. Admin is still decided by `AUTH_ADMIN_ROLE`.

The built-in providers (`OidcAuthProvider`, `TrustedHeaderAuthProvider`, `NoAuthProvider`) can be passed the same way to configure them in code rather than through the environment.

## Using the middleware in your own code

`createAuthProvider()` is the only place that reads the variables above. `AuthMiddleware` combines a provider with the user tables; every component goes through it rather than reading headers:

```typescript
import { AuthMiddleware, adminRoleFromEnv, createAuthProvider, UserService } from '@cepseudo/auth'

const provider = createAuthProvider() // reads process.env
await provider.ready?.()

// userRepository: typically db.getUserRepository() from @cepseudo/database
const authMiddleware = new AuthMiddleware(provider, new UserService(userRepository), { adminRole: adminRoleFromEnv() })

const result = await authMiddleware.authenticate(req)
if (!result.success) return result.response // 401, or 500 when the user record cannot be stored
const { user, isAdmin } = result // user: UserRecord { id, subject, roles, created_at, updated_at }
```

`authMiddleware.identify(req.headers)` returns the caller without touching the database, or `undefined`.

## Environment variables

### Every mode

| Variable | Description | Default |
|----------|-------------|---------|
| `AUTH_MODE` | `oidc`, `trusted-headers`, `none`, or the deprecated `gateway`. Required in production | `none` outside production, with a warning |
| `AUTH_ADMIN_ROLE` | Role that makes a caller admin | `admin` |

### `oidc`

| Variable | Description | Default |
|----------|-------------|---------|
| `OIDC_ISSUER` | Issuer URL; `iss` must match it exactly (required) | - |
| `OIDC_AUDIENCE` | Value `aud` must contain (required) | - |
| `OIDC_ROLES_CLAIM` | Dot path of the claim holding the roles | `roles` |
| `OIDC_CLOCK_TOLERANCE` | Accepted clock skew, in seconds | `5` |
| `OIDC_JWKS_URI` | JWKS endpoint to use instead of discovery | - |
| `OIDC_PUBLIC_KEY` | PEM public key to use instead of any JWKS (air-gapped setups) | - |

### `trusted-headers`

| Variable | Description | Default |
|----------|-------------|---------|
| `AUTH_HEADER_SUBJECT` | Header carrying the subject | `x-user-id` |
| `AUTH_HEADER_ROLES` | Header carrying the comma-separated roles | `x-user-roles` |
| `AUTH_HEADER_SECRET` | Secret the gateway must send in `x-auth-secret`; requests without it are refused | - |

### `none`

| Variable | Description | Default |
|----------|-------------|---------|
| `DIGITALTWIN_ANONYMOUS_USER_ID` | Subject of the anonymous user | `anonymous` |

## License

MIT
