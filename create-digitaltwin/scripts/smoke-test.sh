#!/usr/bin/env bash
# Generates a project with the given flags, installs it from the workspace packages packed as npm would
# publish them, starts its docker-compose services and the app, then checks /api/health. With AUTH_MODE=oidc
# and NGSI-LD, it also calls a protected endpoint with a token from the mock issuer.
# Needs `pnpm build` first, Docker and curl.
#
# Usage: bash create-digitaltwin/scripts/smoke-test.sh <project-name> [create-digitaltwin flags]
set -euo pipefail

root=$(cd "$(dirname "$0")/../.." && pwd)
work=$(mktemp -d)
name=$1
shift

for dir in packages/shared packages/database packages/storage packages/auth packages/components packages/assets packages/ngsi-ld packages/engine digitaltwin-cli; do
  (cd "$root/$dir" && pnpm pack --pack-destination "$work/tarballs" >/dev/null)
done

cd "$work"
node "$root/create-digitaltwin/dist/index.js" "$name" --yes "$@"
cd "$name"

# The generated package.json asks npm for ^2.0.0; point it, and every nested dependency on these packages, at the tarballs
node --input-type=module <<'EOF'
import fs from 'node:fs'
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
pkg.overrides = {}
for (const file of fs.readdirSync('../tarballs')) {
  const name = file.replace(/-\d+\.\d+\.\d+.*\.tgz$/, '').replace(/^cepseudo-/, '@cepseudo/')
  const deps = name in pkg.dependencies ? pkg.dependencies : name in pkg.devDependencies ? pkg.devDependencies : undefined
  if (deps) deps[name] = `file:../tarballs/${file}`
  pkg.overrides[name] = deps ? `$${name}` : `file:../tarballs/${file}`
}
fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2))
EOF

cleanup() {
  status=$?
  if [ -n "${app:-}" ]; then kill "$app" 2>/dev/null || true; fi
  if [ "$status" -ne 0 ] && [ -f app.log ]; then cat app.log; fi
  docker compose down -v >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker compose up -d
npm install --no-audit --no-fund
npm run build

# The app connects to the database and fetches the OIDC discovery document while starting
services=$(docker compose config --services)
if grep -qx postgres <<<"$services"; then
  timeout 60 bash -c 'until docker compose exec -T postgres pg_isready -q -h 127.0.0.1; do sleep 1; done'
fi
if grep -qx minio-bucket <<<"$services"; then
  [ "$(docker wait "$(docker compose ps -aq minio-bucket)")" = 0 ]
fi
issuer=$(sed -n 's/^OIDC_ISSUER=//p' .env)
if [ -n "$issuer" ]; then
  timeout 60 bash -c "until curl -sf $issuer/.well-known/openid-configuration >/dev/null; do sleep 1; done"
fi

node dist/index.js >app.log 2>&1 &
app=$!
timeout 60 bash -c 'until curl -sf http://localhost:3000/api/health/ready >/dev/null; do sleep 1; done'
health=$(curl -sf http://localhost:3000/api/health)
echo "$health"
grep -q '"status":"healthy"' <<<"$health"

if [ -n "$issuer" ] && grep -q '"@cepseudo/ngsi-ld"' package.json; then
  audience=$(sed -n 's/^OIDC_AUDIENCE=//p' .env)
  token=$(curl -sf -X POST "$issuer/token" -d grant_type=client_credentials -d client_id=smoke -d client_secret=smoke -d "scope=$audience" |
    node -pe 'JSON.parse(require("fs").readFileSync(0)).access_token')
  entity='{"id":"urn:ngsi-ld:Sensor:smoke","type":"Sensor","temperature":{"type":"Property","value":21}}'
  post() { curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' "$@" -d "$entity" http://localhost:3000/ngsi-ld/v1/entities; }
  without=$(post)
  with=$(post -H "Authorization: Bearer $token")
  echo "POST /ngsi-ld/v1/entities: $without without a token, $with with one"
  [ "$without" = 401 ] && [ "$with" = 201 ]
fi
