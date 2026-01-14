# Authentication System

## Overview

The Digital Twin framework uses Apache APISIX + Keycloak authentication by default, but can be disabled for development/testing purposes.

## Disabling Authentication

Set environment variables to disable authentication:

```bash
# Disable authentication completely
export DIGITALTWIN_DISABLE_AUTH=true

# Optional: Set custom anonymous user ID (default: "anonymous")
export DIGITALTWIN_ANONYMOUS_USER_ID=dev-user-123
```

## How it Works

When `DIGITALTWIN_DISABLE_AUTH=true`:

1. **ApisixAuthParser.hasValidAuth()** always returns `true`
2. **ApisixAuthParser.parseAuthHeaders()** returns anonymous user instead of parsing headers
3. **UserService.findOrCreateUser()** returns mock user without database operations
4. All components with authentication (AssetsManager, MapManager, TilesetManager) work normally

## Example Usage

```typescript
import { AuthConfig, ApisixAuthParser } from '@digitaltwin/core'

// Check if auth is disabled
console.log('Auth disabled:', AuthConfig.isAuthDisabled())

// Parse headers (returns anonymous user if auth disabled)
const user = ApisixAuthParser.parseAuthHeaders(req.headers)
console.log('User:', user) // { id: "anonymous", roles: ["anonymous"] }

// Check auth validity (always true if auth disabled)
const isValid = ApisixAuthParser.hasValidAuth(req.headers)
console.log('Valid auth:', isValid) // true
```

## Environment Variables

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `DIGITALTWIN_DISABLE_AUTH` | boolean | `false` | Disable authentication checks |
| `DIGITALTWIN_ANONYMOUS_USER_ID` | string | `"anonymous"` | User ID for anonymous access |

## Components Affected

- ✅ **AssetsManager** - Bypasses auth checks
- ✅ **MapManager** - Bypasses auth checks  
- ✅ **TilesetManager** - Bypasses auth checks
- ❌ **CustomTableManager** - No auth by default
- ❌ **Handlers** - No auth by default
- ❌ **Collectors/Harvesters** - No auth needed