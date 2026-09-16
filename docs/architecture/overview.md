# Architecture Overview

## High-level diagram

```text
                ┌─────────────────────────────────┐
                │          Browser                │
                └──────┬─────────────────────┬────┘
                       │ HTTP                │ HTTP
                       ▼                     ▼
                ┌──────────────┐      ┌──────────────┐
                │  Web App    │      │  Worker      │
                │ (Next.js)   │      │ (Node.js)    │
                │ /api/scans  │      │              │
                └──────┬──────┘      └──────┬───────┘
                       │                    │
                       │                    │
               ┌───────▼────────────────────▼───────┐
               │         Packages layer              │
               │                                     │
               │  core  ·  analyzer  ·  crawler      │
               │  detectors  ·  database  ·  …       │
               └───────────────────────┬─────────────┘
                                       │
                              ┌────────▼────────┐
                              │   PostgreSQL      │
                              │   (Drizzle)       │
                              └───────────────────┘
```

The crawler package defines the **abstraction** (`Crawler` interface) and a
concrete `HttpCrawler` implementation using Node.js 24 native `fetch`. See
[Architecture: Crawler](crawler.md) for details.

## Components

### Web app (`apps/web`)

A Next.js 15 application using the App Router. It serves the public-facing
website analysis UI and the minimal scan API. The web app depends on the
`@devlens/*` packages but never on the worker.

#### HTTP API

The web app exposes a single HTTP endpoint for creating and executing scans:

```text
POST /api/scans
```

The route is a thin adapter — it validates the request at the HTTP boundary,
constructs domain objects, and delegates to `@devlens/application`
(`runScan` + `persistResult` via `executeScan`). No business logic lives
in the route. See [Architecture: API](api.md) for the full specification.

### Worker (`apps/worker`)

A standalone Node.js process that executes scan jobs. The worker is a thin
runtime entrypoint — it constructs dependencies (an `HttpCrawler`), creates
a demo scan, and delegates execution to `@devlens/application` (`runScan`).
It does not contain lifecycle logic (`startScan`/`completeScan`/`failScan`),
crawler logic, or persistence. Queue processing and job distribution are
intentionally deferred to a later step.

### Packages

| Package                | Layer                | May depend on                                    |
| ---------------------- | -------------------- | ------------------------------------------------ |
| `@devlens/core`        | Domain               | — (standalone)                                   |
| `@devlens/application` | Application layer    | `core`, `crawler`, `detectors`                   |
| `@devlens/analyzer`    | Analysis engine      | `core`                                           |
| `@devlens/crawler`     | Crawling abstraction | `core` (dependency)                              |
| `@devlens/detectors`   | Technology detection | `core`                                           |
| `@devlens/database`    | Data persistence     | `core`, `application`, `drizzle-orm`, `postgres` |
| `@devlens/validation`  | Input validation     | — (infrastructure)                               |
| `@devlens/config`      | Configuration        | — (infrastructure)                               |

### Dependency direction

```text
web / worker
 ↓         ↘
application  database   (implements ScanResultRepository)
 ↓  ↓      ↗
crawler  core
 ↓
core
```

The `database` package depends on `application` (it `implements` the
`ScanResultRepository` interface defined there). This is intentional
Dependency Inversion: the contract lives with the consumer, not the
implementation. There are no cycles — `application` does NOT depend on
`database`.

The `core` package is the dependency root and must remain free of any
framework, database-client, or Node-specific infrastructure dependencies.

### Crawler boundary

The crawler package (`@devlens/crawler`) defines the `Crawler`
interface — the contract between the DevLens domain and a future HTTP
crawling implementation. It depends on `@devlens/core` for domain types
(`ScanTarget`, `SiteSnapshot`, `Resource`) but contains no crawling logic
itself. The package also includes `HttpCrawler`, a concrete implementation
using Node.js 24 native `fetch`. The `HttpCrawler` performs controlled
same-origin resource observation (robots.txt, manifest.json, and same-origin
CSS) as part of Step 6H. See
[Architecture: Crawler](crawler.md) for details.

```typescript
interface Crawler {
  crawl(target: ScanTarget): Promise<SiteSnapshot>;
}
```

The crawler throws on failure; the application layer converts the error
into a `ScanError` and calls `failScan`. The `SiteSnapshot` returned by
`crawl()` is an independent artifact — it is not embedded in `ScanStatus`.
See [Architecture: Crawler](crawler.md) for details.

### Detector boundary

The detectors package (`@devlens/detectors`) defines the `Detector`
interface — the contract between the crawler-produced `SiteSnapshot`
and the technology `Detection` objects.

```typescript
interface Detector {
  detect(snapshot: SiteSnapshot): Detection[];
}
```

The application layer calls `detector.detect(snapshot)` after a
successful crawl. The `Detector` implementation is injected into
`runScan`, making the pipeline fully testable without real detection
logic.

`@devlens/detectors` ships eleven exports:

- `NullDetector` — a no-op that returns `[]` (Null Object pattern)
- `HeaderDetector` — matches HTTP response headers against a table of
  known signatures (e.g. `Server: nginx` → nginx, `X-Powered-By: PHP` →
  PHP). See [Architecture: Detectors](detectors.md) for the supported
  signature table.
- `MetaTagDetector` — matches `<meta name="generator" content="...">`
  tags against known CMS/builder signatures (e.g. `WordPress` →
  WordPress, `Hugo` → Hugo). See
  [Architecture: Detectors](detectors.md) for the supported signature
  table.
- `ScriptUrlDetector` — matches external `<script src="...">` URLs
  against known technology signatures (e.g. `/_next/` → Next.js,
  `wp-content` → WordPress, `jquery` → jQuery). See
  [Architecture: Detectors](detectors.md) for the supported signature
  table.
- `ContentScriptDetector` — matches inline `<script>` content against
  known technology fingerprints (e.g. `__NEXT_DATA__` → Next.js,
  `react-dom` → React, `Vue.createApp` → Vue.js). See
  [Architecture: Detectors](detectors.md) for the supported signature
  table.
- `ResourceDetector` — matches observed resource bodies (robots.txt,
  manifest.json, same-origin CSS) against conservative technology
  signatures (e.g. `wp-admin` in robots.txt → WordPress,
  `gcm_sender_id` in manifest → Firebase, `--wp--preset--` in CSS →
  WordPress). See
  [Architecture: Detectors](detectors.md) for the supported signature
  table.
- `LinkDetector` — matches `<link>` tag URLs against known technology
  signatures using structured URL analysis (e.g. `cdn.shopify.com` →
  Shopify, `wp-content` path segment → WordPress, `fonts.googleapis.com`
  → Google Fonts). See
  [Architecture: Detectors](detectors.md) for the supported signature
  table.
- `CompositeDetector` — composes multiple `Detector` instances into a
  single detector, running each in order and concatenating results.
  Performs no deduplication (by design). See
  [Architecture: Detectors](detectors.md) for composition semantics.
- `DeduplicatingDetector` — a decorator that wraps another `Detector`
  and merges duplicate technology detections into one `Detection` per
  technology (highest-confidence representative, all evidence merged).
  See [Architecture: Detectors](detectors.md) for deduplication semantics.
- `DetectionScorer` (interface) + `ConfidenceScorer` (implementation) —
  the scoring boundary. Transforms a deduplicated `Detection` by computing
  a final confidence from the base confidence plus a diminishing-reward
  bonus for each independent evidence source type
  (`Evidence['type']`). See
  [Architecture: Detectors](detectors.md) for the scoring formula.
- `ScoringDetector` — a decorator that wraps a `Detector` (typically
  `DeduplicatingDetector`) and applies a `DetectionScorer` to each
  detection. This is the final pipeline stage that produces the
  confidence value persisted in `ScanResult.detections`.

The `@devlens/detectors` package also exports a centralized
**Technology Catalog** (`TECHNOLOGY_CATALOG`, `getTechnology`) — the
single source of truth for all technology metadata (id, name, category).
Detectors reference the catalog by ID instead of duplicating metadata
across signature tables. All 29 supported technologies are documented in
[Architecture: Detectors](detectors.md).

No concrete detectors live in `@devlens/core` — the domain only defines
the shape of `Detection`, `Technology`, and `Evidence`. Detection logic
is an infrastructure concern that depends upward on the domain, not
the other way around.

### Application layer

The application layer (`@devlens/application`) orchestrates the scan
lifecycle. It connects the domain lifecycle factories (`startScan`,
`completeScan`, `failScan`) with the crawler (`Crawler.crawl`) and the
detector (`Detector.detect`).

```text
scan (pending)
  → startScan → scan (running)
  → crawler.crawl(target) → SiteSnapshot | CrawlError
  → detector.detect(snapshot) → Detection[]
  → completeScan / failScan → scan (completed | failed)
```

The `runScan` function accepts a `Scan` (pending), a `Crawler`
implementation, a `Detector` implementation, and a `Date`. It returns a
`ScanResult` containing the updated `Scan` (in `completed` or `failed`
state), the `SiteSnapshot` (null on failure), and an array of
`Detection[]` (empty on failure). The snapshot and detections are
returned separately from the scan — they are not embedded in
`ScanStatus`.

`CrawlError` instances are translated to `ScanError` with the error code
preserved. Generic `Error` instances are wrapped as
`{ code: 'UNKNOWN_ERROR', message: error.message }`.

See [Architecture: Application](application.md) for details.

### Persistence boundary

The persistence boundary follows the Dependency Inversion Principle:
the application layer defines the contract, and the database package
provides the implementation.

```text
@devlens/application
  ↓  (defines)
  ScanResultRepository { save(result: ScanResult): Promise<void> }
  ↑  (implemented by)
@devlens/database
  InMemoryScanResultRepository    (unit tests, zero-dep)
  PostgresScanResultRepository    (production — Drizzle + PostgreSQL)
```

- **Contract**: `ScanResultRepository` with a single `save(result)` method
  lives in `@devlens/application`. The application layer depends only on this
  interface — never on SQL, any database driver, or Orm types.
- **Implementation (unit tests)**: `InMemoryScanResultRepository` stores scan
  results in process-local `Map` instances. It is dependency-free and used by
  all unit tests.
- **Implementation (production)**: `PostgresScanResultRepository` in
  `@devlens/database` persists to PostgreSQL via Drizzle ORM
  (`drizzle-orm` + `postgres` driver). It wraps both writes in a single
  `db.transaction()`, uses `ON CONFLICT DO UPDATE` upserts, and deletes stale
  snapshots when `snapshot` is `null`. Schema and migrations live in
  `packages/database/drizzle/`. See
  [Architecture: Persistence](persistence.md) for details.
- **Semantics**:
  - Completed scan → persists `Scan` + `SiteSnapshot`.
  - Failed scan → persists `Scan` only (no snapshot).
- **Error handling**: If persistence fails, the error propagates as an
  infrastructure error — it is **not** caught or transformed into a
  `ScanError`. A persistence failure means the result may not have been
  stored, but the scan lifecycle itself is already finalized.
- **API**: `executeScan(scan, crawler, detector, repository, now?)` is the
  combined use case — it calls `runScan` and then `persistResult`.
  `persistResult(result, repository)` is also available as a separate
  step — `runScan(scan, crawler, detector)` is unchanged.

### Worker boundary

`apps/worker` is a thin runtime entrypoint. It:

- constructs runtime dependencies (an `HttpCrawler`, a three-layer
  detector composition — `ScoringDetector(DeduplicatingDetector(CompositeDetector([HeaderDetector, MetaTagDetector, ScriptUrlDetector, ContentScriptDetector, ResourceDetector, LinkDetector])))`, and a
  `PostgresScanResultRepository` backed
  by PostgreSQL via Drizzle);
- creates a demo scan (using `@devlens/core` factories);
- delegates execution to `@devlens/application` (`runScan` with
  `CompositeDetector`);
- persists the result via `persistResult(result, repository)`;
- logs a structured result.

The worker obtains its database client via `createDatabaseClient()`
(which reads `DATABASE_URL`) and never imports Drizzle or the `postgres`
driver directly — all database plumbing is contained in
`@devlens/database`.

It does **not** contain lifecycle logic (`startScan`/`completeScan`/`failScan`
are called only inside `runScan`), crawler logic, or persistence business
rules. Queue processing and job distribution are intentionally deferred to a
later step.

## Tooling stack

| Concern     | Tool                |
| ----------- | ------------------- |
| Package mgr | pnpm workspaces     |
| Language    | TypeScript (strict) |
| Linting     | ESLint 10 (flat)    |
| Formatting  | Prettier 3          |
| Unit tests  | Vitest              |
| E2E tests   | Playwright          |
| CI          | GitHub Actions      |

## Test Summary

As of Step 13, the full test suite passes with **824 passed, 9 skipped**
across 44 test files (2 skipped files: `postgres-repository.test.ts` and
`route.integration.test.ts`). The crawler package alone contains 173 tests
across 7 test files including the 4 new Step 12 suites.

## Build and type-check model

Each project (apps and packages) has its own `tsconfig.json` that extends the
root `tsconfig.json`. The root config holds the shared strict compiler options.
Each library package uses `composite: true` so it can participate in project
references and emit declaration files for consumers.
