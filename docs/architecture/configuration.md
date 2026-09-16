# Architecture: Configuration

This document explains how DevLens manages configuration across
environments.

## Sources of configuration

DevLens reads configuration from two sources:

1. **Environment variables** — read directly from `process.env` at the
   infrastructure boundary. The only required variable is `DATABASE_URL`.
2. **Constructor parameters** — operational parameters of `HttpCrawler`
   (timeout, max body size, max redirects, user-agent, etc.) are
   injectable via `HttpCrawlerOptions`, allowing the integration test
   to override the timeout for real network calls.

There is no configuration framework, no `.config.ts` loader, and no
runtime config service. The `@devlens/config` package is a reserved
stub (see §3 below).

## Environment variables

| Variable       | Consumer                              | Required         | Default       | Description                  |
| -------------- | ------------------------------------- | ---------------- | ------------- | ---------------------------- |
| `DATABASE_URL` | `packages/database/src/client.ts`     | Yes (production) | None (throws) | PostgreSQL connection string |
| `DATABASE_URL` | `packages/database/drizzle.config.ts` | Yes (CLI)        | None (throws) | Drizzle Kit CLI migrations   |
| `NODE_ENV`     | Next.js (native)                      | No               | `development` | Next.js dev/prod mode        |
| `PORT`         | Next.js (native)                      | No               | `3000`        | Web app listen port          |

### Validation

`createDatabaseClient()` in `packages/database/src/client.ts` validates
`DATABASE_URL` at call time:

```typescript
const url = databaseUrl ?? process.env.DATABASE_URL;
if (!url) {
  throw new Error(
    'DATABASE_URL is not configured. ' +
      'Set the DATABASE_URL environment variable to your PostgreSQL ' +
      'connection string, or pass the URL explicitly to createDatabaseClient(url).',
  );
}
```

The `!url` check catches both `undefined` (absent) and `''` (empty string).

`drizzle.config.ts` also validates and throws if `DATABASE_URL` is unset
— there is no silent fallback to a localhost URL.

## Crawler operational defaults

All crawler parameters are injectable via `HttpCrawlerOptions`. The
defaults are compiled constants in `packages/crawler/src/http-crawler.ts`.

| Parameter          | Default                                | Classification     |
| ------------------ | -------------------------------------- | ------------------ |
| `timeoutMs`        | `10_000` (10s)                         | Technical constant |
| `maxBodyBytes`     | `5_242_880` (5 MiB)                    | Technical constant |
| `maxRedirects`     | `10`                                   | Technical constant |
| `userAgent`        | `DevLens/0.1 (+https://devlens.local)` | Technical constant |
| `maxCssResources`  | `5`                                    | Technical constant |
| `maxResourceBytes` | `512 KiB`                              | Technical constant |

These values are not environment-variable driven — they are sensible
defaults for a web analysis crawler. They can be overridden per-call via
constructor options (used in integration tests for a longer timeout).

## `@devlens/config`

The `@devlens/config` package is a **reserved stub**:

```typescript
/**
 * @devlens/config — reserved for shared configuration and environment handling.
 */
export {};
```

It is not imported by any consumer. The audit determined that the only
real configuration need (`DATABASE_URL`) is handled directly at the
infrastructure boundary by `@devlens/database`. No central config package
is needed at the current scope.

Architecture:

```text
                        ┌─────────────────────────┐
                        │  @devlens/config (stub)  │  ← reserved, unused
                        └─────────────────────────┘
                                │
                                │ (would define interface)
                                │
                        ┌───────▼────────┐
                        │  DATABASE_URL   │  ← env var, read at boundary
                        └───────┬────────┘
                                │
            ┌───────────────────┼────────────────────┐
            │                   │                    │
      ┌─────▼─────┐      ┌──────▼───────┐     ┌─────▼──────┐
      │ apps/web  │      │ apps/worker  │     │ drizzle-kit │
      │ route.ts  │      │ main.ts      │     │ config.ts   │
      │ (per-req) │      │ (startup)    │     │ (CLI only)  │
      └───────────┘      └──────────────┘     └─────────────┘
```

## Runtime vs domain constants

| Category                  | Example                                        | Where                                  |
| ------------------------- | ---------------------------------------------- | -------------------------------------- |
| **Runtime configuration** | `DATABASE_URL`, crawler timeout                | `process.env`, `HttpCrawlerOptions`    |
| **Domain constants**      | `DEMO_TARGET_URL = 'https://example.com'`      | `apps/worker/src/main.ts`              |
| **Technical constants**   | `DEFAULT_TIMEOUT_MS`, `DEFAULT_MAX_BODY_BYTES` | `packages/crawler/src/http-crawler.ts` |

- **Runtime configuration** is the set of values that vary between
  environments (dev/staging/prod). Currently only `DATABASE_URL`.
- **Domain constants** are business-logic values that are intentionally
  hard-coded (the demo target URL). They are not expected to change
  between deployments.
- **Technical constants** are implementation defaults (timeouts, limits).
  They are injectable via constructor options but do not need to be
  environment-variable driven.

## Web configuration

### `apps/web/next.config.mjs`

```typescript
/** @type {import('next').NextConfig} */
const nextConfig = {};
export default nextConfig;
```

Minimal Next.js configuration. No custom headers, rewrites, or redirects.
Next.js 15 applies security headers by default in production.

### Startup behavior

The web app validates `DATABASE_URL` **per-request**, not at startup.
`route.ts` calls `createDependencies()` which calls `createDatabaseClient()`
on each request:

```typescript
function createDependencies(): HandleCreateScanOptions {
  return {
    crawler: new HttpCrawler(),
    repository: new PostgresScanResultRepository(createDatabaseClient()),
    ...
  };
}
```

If `DATABASE_URL` is absent, each request returns HTTP 500. This is a
known limitation — a future step could move DB client creation to
startup (via `instrumentation.ts` or a middleware) for fail-fast behavior.

## Worker configuration

### Startup flow

```text
main()
  │
  ├─ createDemoScan()        ← constant, always succeeds
  ├─ new HttpCrawler()       ← defaults, always succeeds
  ├─ createDatabaseClient()  ← validates DATABASE_URL, throws if absent
  ├─ new PostgresScanResultRepository(db)  ← construction only
  ├─ runScan(...)            ← crawl + detect (domain failures handled)
  ├─ persistResult(...)      ← DB write (infra failures propagate)
  └─ console.log(formatResult(result))
```

- Configuration is validated when `createDatabaseClient()` is called
  inside `main()`.
- Startup failures (missing `DATABASE_URL`, DB unreachable) propagate
  to `index.ts` which sets `process.exitCode = 1`.
- Scan failures (crawl errors, detector errors) are domain outcomes —
  they do NOT cause the worker to exit with an error code.

### Entry point

`apps/worker/src/index.ts` is a thin wrapper:

```typescript
void main().catch((error: unknown) => {
  console.error('Worker encountered an unexpected error:', error);
  process.exitCode = 1;
});
```

## Database configuration

### Connection lifecycle

- `createDatabaseClient()` creates a `postgres` (postgres.js) client +
  Drizzle ORM wrapper. The connection is **lazy** — postgres.js connects
  on the first query, not at construction.
- The web app creates a new client **per request** (no pooling). This
  is inefficient for high-throughput but correct for the current scope.
- The worker creates a single client for the lifetime of the process.

### Persistence error handling

- `PostgresScanResultRepository.save()` performs all writes inside a
  single `db.transaction()`.
- Persistence failures propagate as infrastructure errors — they are
  NOT caught or transformed into `ScanError`.
- In the web handler, persistence failures are caught by the
  `try/catch` in `handleCreateScan()` and returned as HTTP 500 with a
  generic message.

### Migrations

- `packages/database/drizzle/` contains Drizzle migration files.
- CLI commands: `pnpm db:generate`, `pnpm db:migrate`, `pnpm db:push`.

## Secrets

| Secret                 | Source         | Exposed to client?    | Exposed in logs?                  |
| ---------------------- | -------------- | --------------------- | --------------------------------- |
| PostgreSQL credentials | `DATABASE_URL` | No — server-side only | No — connection string not logged |
| None                   | —              | —                     | —                                 |

- No `NEXT_PUBLIC_*` variables exist (nothing is exposed to the browser).
- No credentials are hard-coded in source code.
- `.env.example` provides a template with empty `DATABASE_URL`.
- The worker logs `scan.id`, `scan.status`, `error.code`, and
  `error.message` — no credentials or internal details.
- The web handler logs full errors server-side via `console.error` but
  returns a generic `INTERNAL_ERROR` message to the client.

## Startup order

```text
Startup
  ↓
Configuration load (DATABASE_URL)
  ↓
Validation (createDatabaseClient throws if absent)
  ↓
Dependencies constructed (crawler, detector, repository)
  ↓
Runtime (request processing / scan execution)
```

In the web app, the "runtime" phase is per-request — each request
reconstructs its dependencies. In the worker, the runtime phase executes
a single scan then exits.
