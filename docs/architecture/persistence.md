# Architecture: Persistence Boundary

## Context

After `runScan()` produces a `ScanResult`, the result must be stored so it
can be queried later (by the web app, by analyzers, by detectors). The
persistency mechanism, however, is an infrastructure concern, not a
domain concern.

## Database Decision

**Production:** PostgreSQL (accessed via Drizzle ORM + the `postgres`
driver). The connection string is supplied through the `DATABASE_URL`
environment variable (see `.env.example`).

**Testing:** The `@devlens/database` package provides an
`InMemoryScanResultRepository` — a zero-dependency, deterministic,
process-local adapter used by all unit tests. The production adapter is
exercised only by skip-guarded integration tests that activate when
`DATABASE_URL` is present.

```text
Production runtime  →  PostgresScanResultRepository  (Drizzle ORM)
Unit tests          →  InMemoryScanResultRepository  (Map-based)
```

## Why a boundary exists

The application layer orchestrates scans. It should never depend on a
concrete database. The persistence contract is an abstraction that the
application layer owns and consumes — infrastructure implements it.

```text
Application → abstraction     (ScanResultRepository)
Database    → implementation   (InMemoryScanResultRepository | PostgresScanResultRepository)
Core        → nothing          (infrastructure-agnostic)
```

## Contract location

**`@devlens/application`** defines the minimum contract it needs:

```typescript
interface ScanResultRepository {
  save(result: ScanResult): Promise<void>;
  getById(scanId: ScanId): Promise<ScanResult | null>;
  list(): Promise<ScanResult[]>;
}
```

This interface is intentionally domain-specific (not a generic
`Repository<T>`). It is driven by two use cases: persist a
`ScanResult` (write) and retrieve scan history (read).

## Read contract (Step 21)

The read side was added in Step 21 to expose scan history via the API:

| Method        | Returns              | Semantics                                                                     |
| ------------- | -------------------- | ----------------------------------------------------------------------------- |
| `getById(id)` | `ScanResult \| null` | `null` = no scan with that ID. A `failed` scan IS returned (not null).        |
| `list()`      | `ScanResult[]`       | All scans in deterministic order: `createdAt DESC, scanId ASC`. Empty → `[]`. |

Both adapters must implement identical semantics:

- **InMemory:** sorts the `Map` values by `createdAt` desc, then `scanId` asc.
- **PostgreSQL:** `SELECT … FROM scans ORDER BY created_at DESC, id ASC`,
  left-joining `snapshots` to reconstruct the full `ScanResult`.

The application layer does NOT access the database directly. It calls
`getScan(id, repository)` and `listScans(repository)` in
`@devlens/application`. The API layer depends on these application
operations, never on the repository directly.

## Why ScanResult-level persistence?

- `Scan` already has a stable identity (`id: ScanId`). Everything
  required for persistence (`id`, `target`, `url`, `hostname`, `status`,
  `createdAt`) is already in the domain.
- `SiteSnapshot` has **no** stable identity of its own (no `id`, no
  `ScanId` field). It is identified by its parent scan.
- `Detection[]` (technology detections) has no identity of its own
  either — it is associated with the snapshot and stored as a JSONB
  array within the `snapshots` table.
- `ScanResult` pairs the three: `{ scan: Scan, snapshot: SiteSnapshot | null, detections: readonly Detection[] }`.
  It is the unit of work returned by `runScan`.

A single `save(result)` call matches the model. No need for separate
`ScanRepository` and `SnapshotRepository` interfaces.

## Implementation location

**`@devlens/database`** hosts both adapter implementations:

### In-memory adapter (unit tests)

`InMemoryScanResultRepository` — dependency-free (no Drizzle, no
PostgreSQL driver), deterministic (process-local `Map`), used by all
unit tests.

### Production adapter (PostgreSQL)

`PostgresScanResultRepository` — backed by Drizzle ORM (`drizzle-orm`

- `postgres` driver). Constructed with a `Database` instance obtained
  from `createDatabaseClient()`, which reads `DATABASE_URL` from the
  environment.

| Concern           | In-memory           | PostgreSQL (Drizzle)         |
| ----------------- | ------------------- | ---------------------------- |
| Tables            | Two `Map` instances | `scans`, `snapshots`         |
| Transaction       | Sequential writes   | `db.transaction()` (atomic)  |
| Upsert            | Map overwrite       | `ON CONFLICT DO UPDATE`      |
| Snapshot deletion | `Map.delete()`      | `DELETE ... WHERE scan_id =` |
| Error propagation | Synchronous throws  | Drizzle/Postgres errors      |

## Schema

### `scans` table

| Column          | Type        | Nullable | Description                                         |
| --------------- | ----------- | -------- | --------------------------------------------------- |
| `id`            | text        | PK       | Domain `ScanId` (no DB-generated key)               |
| `url`           | text        | NN       | `ScanTarget.url`                                    |
| `hostname`      | text        | NN       | `ScanTarget.hostname`                               |
| `status`        | text        | NN       | `'pending' \| 'running' \| 'completed' \| 'failed'` |
| `created_at`    | timestamptz | NN       | `Scan.createdAt`                                    |
| `started_at`    | timestamptz | Y        | Present only for `running` status                   |
| `completed_at`  | timestamptz | Y        | Present only for `completed` status                 |
| `failed_at`     | timestamptz | Y        | Present only for `failed` status                    |
| `error_code`    | text        | Y        | `ScanError.code` (failed scans only)                |
| `error_message` | text        | Y        | `ScanError.message` (failed scans only)             |

### `snapshots` table

| Column              | Type        | Nullable | Description                                                                |
| ------------------- | ----------- | -------- | -------------------------------------------------------------------------- |
| `scan_id`           | text        | PK, FK   | References `scans.id` (ON DELETE CASCADE)                                  |
| `url`               | text        | NN       | `SiteSnapshot.url`                                                         |
| `hostname`          | text        | NN       | `SiteSnapshot.hostname`                                                    |
| `captured_at`       | timestamptz | NN       | `SiteSnapshot.capturedAt`                                                  |
| `http_status_code`  | integer     | NN       | `HttpObservation.statusCode`                                               |
| `http_content_type` | text        | NN       | `HttpObservation.contentType`                                              |
| `http_final_url`    | text        | NN       | `HttpObservation.finalUrl`                                                 |
| `html_title`        | text        | NN       | `HtmlObservation.title`                                                    |
| `html_description`  | text        | Y        | `HtmlObservation.description`                                              |
| `html_meta_tags`    | jsonb       | NN       | `HtmlObservation.metaTags` array                                           |
| `html_scripts`      | jsonb       | NN       | `HtmlObservation.scripts` array                                            |
| `headers`           | jsonb       | NN       | `HttpObservation.headers` array                                            |
| `resources`         | jsonb       | NN       | `SiteSnapshot.resources` array (Step 6H: content, httpStatus, contentType) |
| `detections`        | jsonb       | NN       | `ScanResult.detections` array (JSONB)                                      |

Migrations live in `packages/database/drizzle/` and are generated /
applied via `drizzle-kit`:

```bash
pnpm --filter @devlens/database db:generate   # generate migration from schema
pnpm --filter @devlens/database db:migrate    # apply migrations to PostgreSQL
```

## Persistence semantics

### Successful scan

Both `Scan` and `SiteSnapshot` are persisted, upserted by `scan.id`
inside a single transaction:

```text
ScanResult { scan: Scan (completed), snapshot: SiteSnapshot, detections: Detection[] }
  → INSERT scans ON CONFLICT (id) DO UPDATE
  → INSERT snapshots ON CONFLICT (scan_id) DO UPDATE
```

### Failed scan

Only `Scan` is persisted; any existing snapshot for the scan is deleted:

```
ScanResult { scan: Scan (failed), snapshot: null, detections: [] }
  → INSERT scans ON CONFLICT (id) DO UPDATE
  → DELETE snapshots WHERE scan_id = scan.id
```

A failed scan has no successful snapshot. The domain explicitly states:
_do not invent snapshots for failed scans._

### Reading scan history

The read path (`getById` / `list`) reconstructs domain objects from
persisted rows. For PostgreSQL this requires a row-to-domain mapper
(`rowToScan`, `rowToSnapshot`, `rowsToResult`) that reverses
`scanToRow` / `snapshotToRow`. A left join ensures failed scans
(no snapshot row) are still included in the result set.

## Timestamps

| Timestamp      | Set by         | Semantics                          |
| -------------- | -------------- | ---------------------------------- |
| `created_at`   | `createScan`   | Moment the scan object is created  |
| `started_at`   | `startScan`    | Moment `runScan` begins            |
| `completed_at` | `completeScan` | Real wall-clock time of completion |
| `failed_at`    | `failScan`     | Real wall-clock time of failure    |

The invariant `createdAt ≤ startedAt ≤ completedAt` is enforced:
`startedAt` uses the injected `now` (deterministic), while
`completedAt`/`failedAt` are generated via `new Date()` at the actual
moment of completion/failure. No single timestamp is reused across
different lifecycle events.

## Atomicity

Both the in-memory and PostgreSQL adapters wrap the scan + snapshot writes
in a single logical unit:

- **In-memory:** two sequential `Map` writes — no rollback capability,
  but acceptable for testing (process-local, single-threaded).
- **PostgreSQL:** all writes occur inside `db.transaction(async (tx) => …)`.
  If any statement fails, the entire transaction is rolled back,
  ensuring the `scans` and `snapshots` tables never diverge.

## Worker integration

The worker constructs the production adapter at runtime:

```typescript
import { createDatabaseClient, PostgresScanResultRepository } from '@devlens/database';
import { createProductionDetector } from '@devlens/detectors';
import { runScan, persistResult } from '@devlens/application';

export async function main(): Promise<void> {
  const scan = createDemoScan();
  const crawler = new HttpCrawler();
  const detector = createProductionDetector();
  const db = createDatabaseClient(); // reads DATABASE_URL
  const repository = new PostgresScanResultRepository(db);

  const result = await runScan(scan, crawler, detector);
  await persistResult(result, repository);
  console.log(formatResult(result));
}
```

The worker never imports Drizzle, `postgres`, or any SQL directly. It
interacts with the database solely through `@devlens/database`.

## Error semantics

| Error type          | Origin           | Handling                                                                                  |
| ------------------- | ---------------- | ----------------------------------------------------------------------------------------- |
| `CrawlError`        | Crawler fails    | Translated to `ScanError`, scan → `failed` state (domain outcome)                         |
| Persistence failure | `save()` rejects | Propagates as infrastructure error — **not** caught, **not** transformed into `ScanError` |

A persistence failure propagates to `apps/worker/src/index.ts`:

```typescript
void main().catch((error: unknown) => {
  console.error('Worker encountered an unexpected error:', error);
  process.exitCode = 1;
});
```

## Concurrency & idempotence

### Idempotence

Both adapters are idempotent: saving the same `ScanResult` twice for the
same `scan.id` produces identical state (no duplication, no corruption).

- **In-memory:** `Map.set()` overwrites. A failed scan (`snapshot: null`)
  deletes the previous snapshot and detections via `Map.delete()`.
- **PostgreSQL:** `INSERT … ON CONFLICT DO UPDATE` overwrites the scan
  row; a `DELETE … WHERE scan_id = …` inside the same transaction removes
  stale snapshot rows.

This means a re-run of a completed scan or a retry after a crawl failure
is safe — the latest result wins.

### Concurrency limitations

- **No distributed locking.** Two concurrent scans that happen to share
  the same `scan.id` will race: both will `INSERT … ON CONFLICT DO UPDATE`,
  and the last writer wins. Row-level atomicity is provided by PostgreSQL's
  `ON CONFLICT`, but the overall scan+snapshot transaction does not prevent
  interleaving.
- **Independent scans targeting the same URL:** safe — each gets its own
  `scan.id` (UUID) and writes to a distinct row.
- **Same scan retried concurrently:** last-write-wins. No retry framework
  or queue system exists; this is a known limitation for a single-process
  worker. A production-grade queue (deferred to a later step) would
  serialize retries.

## Dependency graph

```text
apps/worker
  ↓ (runtime composition)
@devlens/application   ← @devlens/database (implements contract)
  ↓                        ↓
@devlens/crawler         @devlens/core (domain types)
  ↓                        ↑
@devlens/core             drizzle-orm + postgres (runtime only in database)
```

No cycles. The application layer defines the interface; the database
layer imports it (for `implements`). Core is untouched — `@devlens/core`
remains zero-dependency.

## Runtime validation (Step 5C)

The production adapter was validated against a real PostgreSQL 16.4
instance (temporary local instance, not committed infrastructure).
All 7 integration tests in
`packages/database/src/postgres-repository.test.ts` were executed and
passed against the live database. The worker's `main()` function was
also run end-to-end: it crawled `https://example.com`, obtained a
`completed` scan with a snapshot, and persisted both to PostgreSQL.

Validation environment:

- PostgreSQL 16.4 (no-installer Windows binary, port 5433, trust auth)
- `DATABASE_URL=postgresql://postgres@127.0.0.1:5433/devlens_test`
- Migration applied via `pnpm --filter @devlens/database db:migrate`

Runtime evidence:

- `scans` table populated: `scan_demo`, `https://example.com`,
  `completed`, with `created_at` and `completed_at` timestamps
- `snapshots` table populated: linked via `scan_id` FK, HTTP 200,
  `text/html` content type, `html_title = "Example Domain"`
- JSONB `headers` array (11 HTTP headers) and `resources` array
  round-tripped correctly, including the Step 6H extended Resource
  fields (`content`, `httpStatus`, `contentType`)
