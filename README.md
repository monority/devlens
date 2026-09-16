# DevLens

DevLens is a modular TypeScript monorepo for website analysis. It provides a
Next.js web application, a Node.js worker for background jobs, and independent
analysis packages for crawling, detecting technologies, and analyzing results.

> **Status:** Foundation phase — only the repository scaffold, tooling, and
> minimal apps are implemented. No domain logic exists yet.

## Repository structure

```text
devlens/
├── apps/
│   ├── web/           # Next.js App Router application
│   └── worker/        # Node.js worker for background jobs
│
├── packages/
│   ├── core/          # Pure domain layer (no framework dependencies)
│   ├── analyzer/      # Analysis engine (future)
│   ├── crawler/       # Website crawling (future)
│   ├── detectors/     # Technology detectors (future)
│   ├── database/      # PostgreSQL / Drizzle infrastructure (in-memory + prod)
│   ├── validation/    # Zod schemas and input validation (future)
│   └── config/        # Shared configuration and environment handling (future)
│
├── docs/
│   ├── architecture/  # Architecture documentation
│   ├── decisions/     # Architecture Decision Records
│   └── product/       # Product specifications
│
├── .github/workflows/ # CI/CD pipelines
├── package.json       # Root package (workspace scripts)
├── pnpm-workspace.yaml
├── tsconfig.json      # Base TypeScript configuration
├── eslint.config.ts   # ESLint flat config
├── prettier.config.ts # Prettier config
├── vitest.config.ts   # Vitest config
└── playwright.config.ts # Playwright E2E config
```

## Quick start

### Prerequisites

- Node.js >= 20 (tested with Node.js 24, see `.nvmrc`)
- pnpm >= 11

> **Note:** The `packageManager` field is intentionally omitted from `package.json`.
> The standalone pnpm binary does not correctly validate its own version against
> that field, producing a hard error. Instead, ensure you have pnpm 11+ installed
> globally (`npm install -g pnpm@latest` or `corepack enable`).

### Install dependencies

```bash
pnpm install
```

### Development

```bash
# Start all dev servers (web + worker)
pnpm dev

# Start only the web app
pnpm dev:web

# Start only the worker
pnpm dev:worker
```

The web app runs on `http://localhost:3000`.

### Build, lint, test, and typecheck

```bash
pnpm build       # Build all packages and apps
pnpm lint        # Run ESLint and Prettier checks across the repository
pnpm typecheck   # Run TypeScript type checking across all packages
pnpm test        # Run the test suite with Vitest
pnpm check       # Run lint + typecheck + test
```

## Development commands

| Command           | Description                                  |
| ----------------- | -------------------------------------------- |
| `pnpm dev`        | Start all dev servers                        |
| `pnpm dev:web`    | Start the Next.js web app in dev mode        |
| `pnpm dev:worker` | Start the Node.js worker in dev mode         |
| `pnpm build`      | Build all packages and apps                  |
| `pnpm lint`       | Lint all files with ESLint + Prettier check  |
| `pnpm typecheck`  | Type-check all packages with TypeScript      |
| `pnpm test`       | Run Vitest test suites                       |
| `pnpm check`      | Run lint, typecheck, and test (quality gate) |

## Architecture principles

### Modular monolith + separate worker

DevLens is structured as a modular monolith with a separate Node.js worker
process. The web application handles HTTP requests and rendering, while the
worker handles long-running background jobs (crawling, analysis, detection).

Shared domain logic lives in `@devlens/core`, which has no dependencies on
React, Next.js, databases, or Node-specific infrastructure. This keeps the
domain layer portable and testable.

### Dependency direction

```text
web
 ↓
application/infrastructure packages
 ↓
core
```

The `core` package must remain independent — it must not depend on React,
Next.js, Drizzle, database clients, or Node-specific infrastructure.

### Workspace packages

| Package               | Responsibility                       |
| --------------------- | ------------------------------------ |
| `@devlens/core`       | Pure domain layer                    |
| `@devlens/analyzer`   | Analysis engine (future)             |
| `@devlens/crawler`    | Website crawling (future)            |
| `@devlens/detectors`  | Technology detectors (future)        |
| `@devlens/database`   | PostgreSQL / Drizzle infrastructure  |
| `@devlens/validation` | Zod schemas and input validation     |
| `@devlens/config`     | Shared configuration and environment |

## Tooling

- **Package manager:** pnpm workspaces
- **TypeScript:** strict mode with project references (TypeScript 5)
- **Linting:** ESLint 10 (flat config) with typescript-eslint
- **Formatting:** Prettier 3
- **Unit tests:** Vitest
- **E2E tests:** Playwright
- **CI:** GitHub Actions

See the [architecture overview](docs/architecture/overview.md) and
[ADR-001](docs/decisions/ADR-001-modular-monolith.md) for more detail.

## Current project status

The repository is in the **foundation phase**:

- ✅ Repository structure (monorepo with pnpm workspaces)
- ✅ TypeScript strict configuration
- ✅ ESLint + Prettier configured
- ✅ Minimal Next.js web app (App Router)
- ✅ Minimal Node.js worker
- ✅ Vitest configured with a passing test
- ✅ Playwright configured for future E2E
- ✅ GitHub Actions CI workflow
- ✅ Documentation (README, architecture, ADR)
- ❌ Crawler, analyzer, detectors — not implemented
- ❌ Database, validation, config — reserved, not implemented
- ✅ PostgreSQL + Drizzle persistence adapter (`PostgresScanResultRepository`)
- ❌ Authentication, billing, AI — not implemented
