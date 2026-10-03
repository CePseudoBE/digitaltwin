# Local services

`docker-compose.dev.yml` at the repository root runs what an application needs, for developing the framework and running the examples.

| Service | Address | Credentials |
|---|---|---|
| PostgreSQL 16 | `localhost:5432` (`DB_PORT`) | `digitaltwin` / `digitaltwin`, database `digitaltwin` |
| Redis 7 | `localhost:6379` (`REDIS_PORT`) | - |
| MinIO | API `http://localhost:9000`, console `http://localhost:9001` | `digitaltwin` / `digitaltwin-secret`, bucket `digitaltwin` created at start |
| Mock OIDC issuer | `http://localhost:8080/default` | the users below |

```bash
cp .env.example .env
pnpm dev:infra
```

`.env.example` holds the matching application settings (`DB_*`, `S3_*`, `REDIS_*`, `AUTH_MODE=oidc`, `OIDC_*`). When PostgreSQL or Redis already runs on your machine, change `DB_PORT` or `REDIS_PORT` in `.env`: the compose file reads them too.

Stop with `docker compose -f docker-compose.dev.yml down`, and add `-v` to delete the data.

## Users and tokens

The issuer is [mock-oauth2-server](https://github.com/navikt/mock-oauth2-server), configured in `oidc/config.json`. It accepts any password.

| User | Roles |
|---|---|
| `alice` | `admin`, `user` |
| `bob` | `user` |

Get a token with the password grant and send it as a Bearer token:

```bash
TOKEN=$(curl -s -X POST http://localhost:8080/default/token \
  -d grant_type=password -d username=alice -d password=any -d client_id=dev -d client_secret=dev \
  | node -pe "JSON.parse(require('fs').readFileSync(0)).access_token")
curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/<endpoint>
```

Any other user name gets a token without the `digitaltwin` audience, which the API refuses.

For a browser flow (authorization code), the issuer shows a login page at `http://localhost:8080/default/authorize`. The user mappings above do not apply there: type the user name, and in the claims field `{"aud": "digitaltwin", "roles": ["admin", "user"]}`.

Development only: anyone who reaches this issuer gets a token for any user and any role.
