# DevLens

DevLens is a modular TypeScript monorepo for website analysis. It provides a
Next.js web application, a Node.js worker for background jobs, and independent
analysis packages for crawling, detecting technologies, and analyzing results.

> **Status:** Production-grade scan engine. The domain layer, application
> layer, crawler, technology detectors, PostgreSQL persistence, Next.js web
> application, and worker are all implemented. Architecture documentation is
> in `docs/architecture/`. See `docs/` for the development step log.

## Repository structure

```text
devlens/
├── apps/
│   ├── web/           # Next.js App Router application
│   └── worker/        # Node.js worker for background jobs
│
├── packages/
│   ├── core/          # Pure domain layer (no framework dependencies)
│   ├── analyzer/      # Analysis engine (reserved stub)
│   ├── crawler/       # Website crawling (SSRF-guarded HTTP crawler)
│   ├── detectors/     # Technology detectors (29-technology catalog)
│   ├── database/      # PostgreSQL / Drizzle infrastructure (in-memory + prod)
│   ├── validation/    # Reserved stub (future)
│   └── config/        # Shared configuration and environment handling (reserved stub)
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

| Package               | Responsibility                         |
| --------------------- | -------------------------------------- |
| `@devlens/core`       | Pure domain layer                      |
| `@devlens/analyzer`   | Analysis engine (reserved stub)        |
| `@devlens/crawler`    | Website crawling (SSRF-guarded)        |
| `@devlens/detectors`  | Technology detectors (29-tech catalog) |
| `@devlens/database`   | PostgreSQL / Drizzle infrastructure    |
| `@devlens/validation` | Reserved stub                          |
| `@devlens/config`     | Shared configuration (reserved stub)   |

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

The repository is a **production-grade scan engine**:

- ✅ Repository structure (monorepo with pnpm workspaces)
- ✅ TypeScript strict configuration with project references
- ✅ ESLint + Prettier configured (formatting gate passing)
- ✅ Full Next.js 15 web application (App Router, API routes, 9 prerendered routes)
- ✅ Full crawler with SSRF guard (localhost, private IP, link-local, IPv6 blocked)
- ✅ Technology detectors (29-technology catalog with evidence, explainability, provenance)
- ✅ PostgreSQL + Drizzle persistence adapter (`PostgresScanResultRepository`) with in-memory test repository
- ✅ Node.js worker (one-shot demo with hardcoded target `https://example.com`)
- ✅ Vitest with 2500+ passing tests across domain, application, crawler, detectors, database, and web
- ✅ Playwright configured (no E2E tests yet — future work)
- ✅ GitHub Actions CI workflow (lint, typecheck, test, build, audit)
- ✅ Documentation (README, architecture overview, configuration, ADR-001)
- ❌ `@devlens/analyzer`, `@devlens/validation`, `@devlens/config` — reserved stubs, not yet implemented
- ❌ Authentication, billing — not implemented
