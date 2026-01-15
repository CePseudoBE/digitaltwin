# Authentication System

## Overview

The Digital Twin framework supports multiple authentication modes:

- **Gateway** (default): API gateway authentication (Apache APISIX, KrakenD) via headers
- **JWT**: Direct JWT token validation
- **None**: Disabled authentication for development/testing

## Authentication Modes

### Gateway Mode (Default)

Uses headers set by an API gateway after authentication:
- `x-user-id`: User identifier
- `x-user-roles`: Comma-separated roles

**No configuration needed** - this is the default behavior.

```bash
# Explicitly set gateway mode (optional, this is the default)
export AUTH_MODE=gateway
```

### JWT Mode

Validates JWT tokens directly from the `Authorization: Bearer <token>` header.

```bash
export AUTH_MODE=jwt

# For HMAC algorithms (HS256, HS384, HS512)
export JWT_SECRET=your-secret-key

# OR for RSA/EC algorithms (RS256, ES256, etc.)
export JWT_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----..."
# Or from file
export JWT_PUBLIC_KEY_FILE=/path/to/public.pem

# Optional configuration
export JWT_ALGORITHM=RS256                    # Default: HS256
export JWT_ISSUER=https://auth.example.com    # Validate token issuer
export JWT_AUDIENCE=my-api                    # Validate token audience
export JWT_USER_ID_CLAIM=sub                  # Claim for user ID (default: sub)
export JWT_ROLES_CLAIM=roles                  # Claim for roles (default: roles)
```

**Keycloak support**: The JWT provider automatically handles Keycloak's `realm_access.roles` format:

```bash
export JWT_ROLES_CLAIM=realm_access.roles
```

### No Auth Mode (Development/Testing)

Disables authentication completely. All requests are treated as authenticated.

```bash
# Option 1: Set AUTH_MODE
export AUTH_MODE=none

# Option 2: Legacy variable (still supported)
export DIGITALTWIN_DISABLE_AUTH=true

# Optional: Custom anonymous user ID
export DIGITALTWIN_ANONYMOUS_USER_ID=dev-user-123
```

## Environment Variables Reference

| Variable | Mode | Default | Description |
|----------|------|---------|-------------|
| `AUTH_MODE` | All | `gateway` | Authentication mode: `gateway`, `jwt`, `none` |
| `AUTH_ADMIN_ROLE` | All | `admin` | Role name for admin privileges |
| `DIGITALTWIN_DISABLE_AUTH` | None | `false` | Legacy: set to `true` to disable auth |
| `DIGITALTWIN_ANONYMOUS_USER_ID` | None | `anonymous` | User ID when auth disabled |
| `JWT_SECRET` | JWT | - | Secret key for HMAC algorithms |
| `JWT_PUBLIC_KEY` | JWT | - | Public key content for RSA/EC |
| `JWT_PUBLIC_KEY_FILE` | JWT | - | Path to public key file |
| `JWT_ALGORITHM` | JWT | `HS256` | JWT signing algorithm |
| `JWT_ISSUER` | JWT | - | Expected token issuer |
| `JWT_AUDIENCE` | JWT | - | Expected token audience |
| `JWT_USER_ID_CLAIM` | JWT | `sub` | Claim containing user ID |
| `JWT_ROLES_CLAIM` | JWT | `roles` | Claim containing roles |

## Programmatic Usage

### Using AuthProviderFactory (Recommended)

```typescript
import { AuthProviderFactory } from '@digitaltwin/core'

// Create provider from environment variables
const authProvider = AuthProviderFactory.fromEnv()

// In a handler
const user = authProvider.parseRequest(req)
if (!user) {
    return { status: 401, content: 'Authentication required' }
}

if (authProvider.isAdmin(req)) {
    // Admin-only logic
}
```

### Using ApisixAuthParser (Backward Compatible)

```typescript
import { ApisixAuthParser } from '@digitaltwin/core'

// Works with any auth mode configured via environment
const user = ApisixAuthParser.parseAuthHeaders(req.headers)
const isAdmin = ApisixAuthParser.isAdmin(req.headers)
```

### Creating Providers Directly

```typescript
import {
    GatewayAuthProvider,
    JwtAuthProvider,
    NoAuthProvider,
    AuthProviderFactory
} from '@digitaltwin/core'

// Gateway provider
const gateway = new GatewayAuthProvider('admin')

// JWT provider
const jwt = new JwtAuthProvider({
    mode: 'jwt',
    jwt: {
        secret: 'your-secret',
        algorithm: 'HS256'
    }
})

// No-auth provider
const noAuth = new NoAuthProvider('dev-user', ['developer'])

// Or use factory with explicit config
const provider = AuthProviderFactory.create({
    mode: 'jwt',
    jwt: { secret: 'your-secret' },
    adminRoleName: 'superadmin'
})
```

## Migration Guide

### From Previous Versions

**No changes required** if you're using Apache APISIX (gateway mode).

The framework defaults to gateway mode, which reads `x-user-id` and `x-user-roles` headers exactly as before.

### Adding JWT Support

To switch from gateway to JWT authentication:

1. Set `AUTH_MODE=jwt`
2. Configure `JWT_SECRET` or `JWT_PUBLIC_KEY`
3. Optionally configure issuer, audience, and claim names

Your API gateway can be removed or kept for other purposes (rate limiting, routing, etc.).

## Components Affected

| Component | Auth Required | Notes |
|-----------|---------------|-------|
| AssetsManager | Yes | Upload, update, delete require auth |
| MapManager | Yes | Upload, update, delete require auth |
| TilesetManager | Yes | Upload, update, delete require auth |
| CustomTableManager | Yes | Create, update, delete require auth |
| Handlers | No | Implement your own auth logic |
| Collectors/Harvesters | No | Server-side components |
