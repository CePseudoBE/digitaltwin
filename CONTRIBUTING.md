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
digitaltwin/
├── digitaltwin-core/      # Main framework
├── digitaltwin-cli/       # CLI code generator
├── create-digitaltwin/    # Project scaffolding
├── TODO/                  # Task tracking (pending)
├── VERIF/                 # Tasks awaiting verification
└── DONE/                  # Completed tasks
```

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
| `db` | Database / Knex |

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

Format: `type/todo-XX-description` or `type/description`

Examples:
- `feature/todo-12-performance-optimizations`
- `fix/null-pointer-handler`
- `docs/api-documentation`

## Pull Request Guidelines

- Target `develop` branch (not `main`)
- Include a clear description of changes
- Reference related TODO if applicable
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

## Questions?

Open an issue on GitHub for questions or discussions.
