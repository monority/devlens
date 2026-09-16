# Application Architecture

## Overview

The `@devlens/application` package is the **application/orchestration layer**.
It bridges the domain lifecycle (`@devlens/core`), the crawler
(`@devlens/crawler`), and the detector (`@devlens/detectors`), connecting
them without any of them knowing about the other.

```text
Scan (pending)
  → startScan → Scan (running)
  → crawler.crawl(target) → SiteSnapshot | CrawlError
  → detector.detect(snapshot) → Detection[]
  → completeScan / failScan → Scan (completed | failed)
```

## Role

The application layer has one job: **orchestrate the scan lifecycle**.

Given a `Scan` in the `pending` state, a `Crawler` implementation, and a
`Detector` implementation, it:

1. Calls `startScan(scan, timestamp)` — transitions `pending` → `running`
2. Calls `crawler.crawl(scan.target)` — produces a `SiteSnapshot` or throws
3. On success: calls `detector.detect(snapshot)` — produces `Detection[]`
4. On success: calls `completeScan(runningScan, timestamp)` — `running` → `completed`
5. On failure: translates the error to a `ScanError` and calls
   `failScan(runningScan, scanError, timestamp)` — `running` → `failed`

It returns a `ScanResult` containing the updated `Scan`, the
`SiteSnapshot` (or `null` on failure), and an array of `Detection` objects
(or an empty array on failure). The snapshot is **not** embedded in
`ScanStatus` — it is returned as a separate artifact.

## Public API

### `runScan(scan, crawler, detector, now)`

```typescript
async function runScan(
  scan: Scan,
  crawler: Crawler,
  detector: Detector,
  now?: Date,
): Promise<ScanResult>;
```

- **`scan`** — a `Scan` in `pending` state. Throws if the scan is not
  pending (propagated from `startScan`).
- **`crawler`** — any implementation of the `Crawler` interface. Injected
  for testability; the application layer contains no HTTP logic of its own.
- **`detector`** — any implementation of the `Detector` interface. Injected
  for testability; the application layer contains no detection logic of its own.
- **`now`** — a `Date` used to produce the `startedAt` timestamp (the
  moment `runScan` begins). The `completedAt` / `failedAt` timestamps are
  generated fresh at the actual moment of completion / failure via
  `new Date()`, ensuring `startedAt ≤ completedAt` (and `startedAt ≤
failedAt`). Defaults to `new Date()`. In tests, a fixed `Date` is passed
  for deterministic `startedAt` output.

### Timestamp semantics

| Timestamp     | Set by                   | When                              |
| ------------- | ------------------------ | --------------------------------- |
| `createdAt`   | `createScan` (handler)   | Scan object creation              |
| `startedAt`   | `startScan` (runScan)    | `runScan` begins (injected `now`) |
| `completedAt` | `completeScan` (runScan) | After crawl + before detect       |
| `failedAt`    | `failScan` (runScan)     | At the point failure is caught    |

The invariant `createdAt ≤ startedAt ≤ completedAt` is guaranteed because
`startedAt` is injected (testable) and `completedAt`/`failedAt` are generated
at the real wall-clock time of completion/failure — which is always at or after
`now`.

### `ScanResult`

```typescript
interface ScanResult {
  readonly scan: Scan; // completed or failed
  readonly snapshot: SiteSnapshot | null; // null on failure
  readonly detections: readonly Detection[]; // empty on failure
}
```

## Error Translation

The application layer translates infrastructure-level errors into domain
`ScanError` objects:

| Error type      | ScanError.code    | ScanError.message             |
| --------------- | ----------------- | ----------------------------- |
| `CrawlError`    | `CrawlError.code` | `CrawlError.message`          |
| Other `Error`   | `'UNKNOWN_ERROR'` | `error.message`               |
| Non-Error value | `'UNKNOWN_ERROR'` | `'An unknown error occurred'` |

All four `CrawlError` codes (`invalid_target`, `timeout`, `network_error`,
`too_large`) are preserved as `ScanError.code`.

**Important**: HTTP 4xx/5xx responses do **not** cause scan failure. They
produce valid `SiteSnapshot` objects via the crawler. Only network-level
errors (`CrawlError` from `HttpCrawler`) or unexpected runtime errors
cause the scan to fail.

## What the Application Layer Does NOT Do

- Perform HTTP requests directly (delegates to the `Crawler`)
- Perform technology detection (delegates to the `Detector`)
- Validate scan input (handled by the `validation` package)
- Persist scans or snapshots to a database
- Manage job queues
- Handle HTTP requests (that's `apps/web`)
- Define new domain types (that's `@devlens/core`)

## Dependency Direction

```text
apps/web / apps/worker
      ↓
@devlens/application
      ↓        ↓         ↓
@devlens/crawler   @devlens/detectors   @devlens/core
      ↓                   ↓
@devlens/core      @devlens/core
```

The application layer depends on:

- `@devlens/core` — for domain types and lifecycle factories
- `@devlens/crawler` — for the `Crawler` interface and `CrawlError` class
- `@devlens/detectors` — for the `Detector` interface

`@devlens/core` has zero runtime dependencies. No circular dependencies
exist. No new npm packages were added.

## Testability

All tests are deterministic — no network access, no database, no file
system. The `crawler` parameter is a `Crawler` interface that can be
implemented by a mock object returning pre-canned snapshots or throwing
pre-configured errors.

Completion/failure timestamps (`completedAt`, `failedAt`) are generated
via `new Date()` at the actual moment of completion/failure. Tests that
need to verify temporal ordering assert `completedAt ≥ createdAt` rather
than a fixed value, keeping tests deterministic on the injected `now`
(which controls `startedAt`) while still exercising the real-time
completion path.

## File Structure

```text
packages/application/src/
├── index.ts             # Public API exports
├── orchestrator.ts      # runScan + ScanResult + toScanError
├── orchestrator.test.ts # tests (all deterministic, no network)
├── execute-scan.ts      # executeScan (runScan + persistResult)
├── execute-scan.test.ts # tests (all deterministic, no network)
├── repository.ts        # ScanResultRepository interface + persistResult
└── queries.ts           # getScan + listScans (Step 21 read operations)
```

## Read operations (Step 21)

In addition to the write path (`executeScan` → `runScan` + `persistResult`),
the application layer now exposes read operations:

```typescript
getScan(scanId: ScanId, repository: ScanResultRepository): Promise<ScanResult | null>;
listScans(repository: ScanResultRepository): Promise<ScanResult[]>;
```

- `getScan` returns `null` for unknown IDs; a `failed` scan returns
  a full `ScanResult` (with `snapshot: null`).
- `listScans` returns all scans in deterministic order:
  `createdAt DESC, scanId ASC`.

The API layer (`apps/web`) depends on these functions — never on the
repository directly. This preserves the dependency direction:

```text
apps/web
  ↓ (calls getScan / listScans)
@devlens/application
  ↓ (calls repository.getById / repository.list)
@devlens/database (implements ScanResultRepository)
```
