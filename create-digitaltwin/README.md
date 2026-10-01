# create-digitaltwin

Creates a Digital Twin application on the [`@cepseudo/*` packages](https://github.com/CePseudoBE/digitaltwin).

```bash
npm init digitaltwin my-app
cd my-app
docker compose up -d
npm install
npm run dev
```

Requires Node.js 20.12 or later, and Docker for the local services.

## Questions

| Question | Choices | What it changes |
|---|---|---|
| Database | SQLite, PostgreSQL | `pg` or `better-sqlite3`, the `DB_*` variables, a `postgres` service |
| File storage | local directory, S3-compatible | `LocalStorageService` or `S3StorageService`, the `S3_*` variables, a `minio` service and its bucket |
| Authentication | `none`, `oidc`, `trusted-headers` | `AUTH_MODE` and its variables; `oidc` adds a mock issuer to the compose file |
| NGSI-LD API | yes, no | the `@cepseudo/ngsi-ld` plugin, which the engine loads when it is installed |
| docker-compose.yml | yes, no | Redis, plus the services the choices above need |
| Example collector | yes, no | `src/components/jsonplaceholder_collector.ts` |

Redis is always required: the engine runs its schedules on BullMQ.

## Without prompts

```bash
npx create-digitaltwin my-app --yes --database postgresql --storage s3 --auth oidc --ngsi-ld
```

| Flag | Values | Default |
|---|---|---|
| `-y, --yes` | skip the prompts | - |
| `--database <type>` | `sqlite`, `postgresql` | `sqlite` |
| `--storage <type>` | `local`, `s3` | `local` |
| `--auth <mode>` | `none`, `oidc`, `trusted-headers` | `none` |
| `--ngsi-ld` | add the NGSI-LD API | off |
| `--no-docker` | skip `docker-compose.yml` | - |
| `--no-examples` | skip the example collector | - |

The target directory must not exist or be empty.

## Generated project

```
my-app/
├── src/
│   ├── index.ts              # Storage, database and engine set up from .env
│   └── components/           # Example collector (optional)
├── .env                      # Development settings, matching docker-compose.yml
├── .env.example              # The same settings, without the generated secret
├── docker-compose.yml        # Local services (optional)
├── dt.js                     # node dt make:collector ... (digitaltwin-cli)
├── package.json
├── tsconfig.json
└── README.md
```

## Development

```bash
pnpm --filter create-digitaltwin build
pnpm --filter create-digitaltwin test
pnpm --filter create-digitaltwin dev my-app
```

The tests generate projects in `tests/generated/` and type-check them against the workspace packages.

## License

MIT © Hoffmann Axel
