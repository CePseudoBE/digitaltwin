# Contributing to Digital Twin Framework

Thank you for your interest in contributing to the Digital Twin Framework!

## Development Setup

```bash
# Clone the repo
git clone https://github.com/CePseudoBE/digitaltwin.git
cd digitaltwin

# Install dependencies (pnpm workspaces)
pnpm install

# Build all packages
pnpm build

# Run tests
pnpm test

# Lint
pnpm lint
```

## Project Structure

```
packages/
├── shared/       # Types, errors, utils, validation, env (layer 0)
├── database/     # DatabaseAdapter + Kysely implementation (layer 1)
├── storage/      # StorageService: local filesystem, S3 (layer 1)
├── auth/         # AuthProvider, UserService, AuthMiddleware (layer 1)
├── components/   # Collector, Harvester, Handler, CustomTableManager (layer 2)
├── assets/       # AssetsManager, TilesetManager, MapManager (layer 2)
├── ngsi-ld/      # Optional NGSI-LD plugin (layer 2)
├── engine/       # DigitalTwinEngine, scheduler, queues, loader (layer 3)
└── e2e/          # Integration tests against real Postgres / MinIO / Redis
digitaltwin-cli/      # Component generator
create-digitaltwin/   # Project scaffolding
```

A package may only import from lower layers. See `ROADMAP.md` for what is being worked on and in which order.

## Making Changes

1. Create a feature branch from `develop`:
   ```bash
   git checkout develop
   git pull origin develop
   git checkout -b feature/my-feature
   ```

2. Make your changes with atomic commits

3. Run tests and lint:
   ```bash
   pnpm test
   pnpm lint
   ```

4. Push and create a Pull Request to `develop`

## Commit Convention

We use [Conventional Commits](https://www.conventionalcommits.org/). Format:

```
type(scope): description
```

### Types

| Type | Description |
|------|-------------|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation only |
| `refactor` | Code refactoring (no feature change) |
| `test` | Adding or updating tests |
| `chore` | Maintenance, dependencies, config |
| `perf` | Performance improvements |
| `style` | Formatting, whitespace (no code change) |

### Scopes

| Scope | Package |
|-------|---------|
| `core` | digitaltwin-core |
| `cli` | digitaltwin-cli |
| `create` | create-digitaltwin |
| `engine` | DigitalTwinEngine |
| `collector` | Collector components |
| `harvester` | Harvester components |
| `handler` | Handler components |
| `assets` | Assets Managers |
| `auth` | Authentication system |
| `storage` | Storage services |
| `queue` | BullMQ / Redis |
| `db` | Database / Kysely |
| `ngsi-ld` | NGSI-LD plugin |
| `shared` | Shared types and utils |

### Examples

```bash
feat(core): add streaming ZIP extraction
fix(cli): handle spaces in project names
docs: update README with architecture diagram
test(core): add collector unit tests
chore(core): update dependencies
perf(engine): optimize parallel initialization
```

## Branch Naming

Git Flow: `feat/<slug>` or `fix/<slug>` off `develop`, `release/x.y` for releases, `hotfix/<slug>` off `main`. Never commit directly to `main` or `develop`.

## Pull Request Guidelines

- Target `develop` branch (not `main`)
- Include a clear description of changes
- Reference the issue it closes (`Closes #<n>`); roadmap work is tracked in GitHub milestones
- Ensure all tests pass
- Keep PRs focused and reasonably sized

## Code Style

- TypeScript strict mode
- ESLint + Prettier for formatting
- Meaningful variable and function names
- JSDoc comments for public APIs

## Testing

- Use [Japa](https://japa.dev/) testing framework (not Jest)
- Test files: `*.spec.ts`
- Run tests: `pnpm test`
- Aim for meaningful tests that verify behavior, not implementation

## AI-Assisted Contributions

We use AI coding tools on this project ourselves and you are welcome to use them too. Two things do not change because a tool wrote the first draft: you are the author, and reviewer time is the scarcest resource we have.

**You own every line.** You must be able to explain what your change does, why it is correct, and how it interacts with the rest of the framework without asking the tool. If you cannot, the change is not ready. Reviewers will ask you, not your tool.

**The decisions are yours.** Where a fix belongs, whether an abstraction is worth it, what a test should prove: make those calls yourself and state them in the PR description. A PR that reads as "the tool suggested this" will be sent back.

**Verify before asking for review.** Build, test and lint the packages you touched. Read the whole diff as if a stranger had written it. Remove anything the tool added that the issue did not ask for.

**Disclose.** Tick the box in the PR template and say which tool you used and roughly how much it did (a few lines, most of the code, most of the tests). This is not held against the PR; it tells reviewers where to look harder. Commit messages and code comments stay tool-free: the author is you.

**Not accepted:**

- PRs opened by an agent without a human having read the full diff.
- Issues, bug reports or security reports written by a tool and not reproduced by you.
- AI tools on issues labelled `good first issue`. Those exist for people to learn the codebase.
- Generated media (images, audio, diagrams rendered as images).

Rule of thumb, borrowed from the curl and LLVM policies: a contribution must be worth more to the project than the time it takes to review it.

## Questions?

Open an issue on GitHub for questions or discussions.
