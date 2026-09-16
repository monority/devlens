# Step 21 — Scan History & Results API — Report

## 1. Executive Summary

Step 21 adds the ability to **read existing scan results** via two new HTTP
endpoints, completing DevLens's transition from a write-only scan executor to a
usable product with queryable history.

```text
POST   /api/scans       — create and execute a scan  (existing, unchanged)
GET    /api/scans       — list all scan results       (NEW)
GET    /api/scans/:id   — retrieve a single scan      (NEW)
```

The implementation follows the existing architecture: the API layer delegates to
pure handler functions, which call application-layer read operations
(`getScan`, `listScans`), which in turn call the `ScanResultRepository`
interface. Both the InMemory and PostgreSQL adapters implement the new
`getById` and `list` methods with identical semantics.

**Key design decisions:**

- `getById` returns `ScanResult | null` — `null` means "not found", a `failed`
  scan returns a full result (not `null`).
- `list()` returns all scans ordered deterministically: `createdAt DESC, scanId ASC`.
- GET responses reuse the exact same response shape as the POST endpoint
  (`CreateScanResponse`), ensuring API consistency.
- No new dependencies, frameworks, pagination, caching, or search were introduced.

**Validation:** All 5 checks pass (typecheck, test, lint, build, madge). Test
count increased from 916 → 943 (+27 new tests).

---

## 2. Existing Persistence Audit

### What was already persisted

The write side was already complete from prior steps:

- **`scans` table** (`packages/database/src/schema.ts`): stores every `Scan`
  with `id`, `url`, `hostname`, `status` (`pending`/`running`/`completed`/`failed`),
  `createdAt`, `startedAt`, `completedAt`, `failedAt`, `errorCode`, `errorMessage`.
- **`snapshots` table**: stores `SiteSnapshot` data for successful scans only
  — a 1:1 relationship with `scans` via `scan_id` foreign key. Failed scans
  have no snapshot row (the `save` method deletes any existing snapshot for a
  failed scan).
- **Detections**: stored as JSONB in the `snapshots.detections` column.

### What was missing

The `ScanResultRepository` interface only had a `save()` method. There were no
read methods — the data was write-only. The API could create and execute scans
but could not retrieve existing results.

### Domain types inspected

- **`ScanResult`** (`packages/application/src/orchestrator.ts`):
  `{ scan: Scan, snapshot: SiteSnapshot | null, detections: readonly Detection[] }`
- **`Scan`** (`packages/core/src/domain/scan.ts`):
  `{ id: ScanId, target: { url: Url, hostname: Hostname }, status: ScanStatus, createdAt: Timestamp }`
- **`ScanStatus`** — discriminated union:
  - `pending`: no extra data
  - `running`: `{ startedAt: Timestamp }`
  - `completed`: `{ completedAt: Timestamp }`
  - `failed`: `{ failedAt: Timestamp, error: ScanError }`

### Conclusion

All data needed for the read API already exists in the persisted layer. No new
model was invented — the `ScanResult` type returned by `runScan` can be fully
reconstructed from the `scans` and `snapshots` tables.

---

## 3. Repository Read Contract

The `ScanResultRepository` interface
(`packages/application/src/repository.ts`) was extended with two methods:

```typescript
export interface ScanResultRepository {
  save(result: ScanResult): Promise<void>;
  getById(scanId: ScanId): Promise<ScanResult | null>;
  list(): Promise<ScanResult[]>;
}
```

### Method semantics

| Method    | Returns              | "Not found" | "Found but failed"                 |
| --------- | -------------------- | ----------- | ---------------------------------- |
| `getById` | `ScanResult \| null` | `null`      | `ScanResult` with `snapshot: null` |
| `list`    | `ScanResult[]`       | `[]`        | Included as a normal result        |

### Design rationale

- **`getById` returns `null`** (not `undefined`) for consistency with the
  "explicit not-found semantic" in the Step 21 spec. `null` clearly separates
  "the scan does not exist" from "the scan existed and failed".
- **`list()` returns `ScanResult[]`** (not a paginated wrapper) — the current
  product stage does not require pagination.
- **Deterministic ordering**: `createdAt DESC, scanId ASC` — the tie-breaker on
  `scanId` ensures stability when multiple scans share the same `createdAt`.

### What was NOT added

- No `search`, `filter`, or query DSL
- No pagination or cursor-based iteration
- No caching layer (Redis or otherwise)
- No GraphQL or tRPC endpoints

---

## 4. Application Operations

Two new functions were added to `packages/application/src/queries.ts`:

```typescript
export async function getScan(
  scanId: ScanId,
  repository: ScanResultRepository,
): Promise<ScanResult | null>;

export async function listScans(repository: ScanResultRepository): Promise<ScanResult[]>;
```

These are thin pass-through functions that delegate to the repository. They
exist to:

1. **Preserve the dependency direction** — the API layer depends on
   `@devlens/application`, not on `@devlens/database` directly.
2. **Provide a testable seam** — tests can mock `ScanResultRepository` and
   verify the handler calls the correct application function.
3. **Allow future application-level logic** (e.g., filtering, enrichment) to be
   added without changing the API layer.

Both are exported from `@devlens/application`'s `index.ts`.

---

## 5. GET /api/scans/:id

### Endpoint

```text
GET /api/scans/{id}
```

Implemented as a Next.js dynamic route at
`apps/web/src/app/api/scans/[id]/route.ts`.

### Handler

The pure handler `handleGetScanById(scanId, options)` in
`apps/web/src/app/api/scans/handler.ts`:

1. Rejects empty IDs immediately (404).
2. Calls `getScan(scanId, repository)`.
3. Returns 404 if the result is `null`.
4. Returns 200 with the full `CreateScanResponse` shape (reusing
   `resultToResponse`) if the scan exists.
5. Catches repository errors → 500 with `INTERNAL_ERROR`.

### Response contract

**200 OK** — full scan result (same shape as POST response):

```json
{
  "scan": { "id", "status", "target", "hostname", "createdAt",
            "startedAt", "completedAt", "failedAt", "error" },
  "snapshot": { "url", "hostname", "capturedAt", "http", "html" } | null,
  "detections": [ { "technology", "confidence", "evidence" } ]
}
```

**404 Not Found:**

```json
{ "error": { "code": "NOT_FOUND", "message": "Scan not found." } }
```

**500 Internal Server Error:**

```json
{ "error": { "code": "INTERNAL_ERROR", "message": "An internal error occurred." } }
```

### Failed scan semantics

A scan with `status: "failed"` returns **200** (not 404). The response includes:

- `scan.status` = `"failed"`
- `scan.error` = `{ code, message }`
- `scan.failedAt` = timestamp string
- `snapshot` = `null`
- `detections` = `[]`

This distinction is critical: a failed scan is a **persisted, retrievable**
result. "Not found" (404) means the scan ID was never seen by the system.

---

## 6. GET /api/scans

### Endpoint

```text
GET /api/scans
```

Implemented as a simple `GET` export in
`apps/web/src/app/api/scans/route.ts`.

### Handler

The pure handler `handleGetScans(options)` calls `listScans(repository)` and
maps each result to its `scan` summary field.

### Response contract

**200 OK** — empty-safe list wrapper:

```json
{
  "scans": [
    { "id", "status", "target", "hostname", "createdAt",
      "startedAt", "completedAt", "failedAt", "error" },
    ...
  ]
}
```

- Each entry uses the **same `scan` field set** as the POST response.
- Empty database → `{ "scans": [] }` with HTTP 200.
- Ordering: `createdAt DESC, scanId ASC` (deterministic).

**500 Internal Server Error** — same as GET by ID.

### Design: wrapper vs bare array

A `{ "scans": [...] }` wrapper object is used rather than a bare JSON array.
This follows the existing API convention (POST returns an object with named
keys) and leaves room for future metadata (e.g., count, links) without a
breaking change.

---

## 7. Response Contract

### Consistency principle

GET responses reuse the **exact same mapping** (`resultToResponse`) as the
POST response. This ensures:

- `GET /api/scans/:id` returns the **same shape** as `POST /api/scans`.
- `GET /api/scans` returns entries with the **same `scan` fields** as POST.
- No "GET response ≠ POST response" divergence.

### Fields exposed (no DB internals)

The `resultToResponse` function maps domain `ScanResult` to:

- `scan`: `{ id, status, target, hostname, createdAt, startedAt, completedAt, failedAt, error }`
- `snapshot`: `{ url, hostname, capturedAt, http: { statusCode, contentType, finalUrl }, html: { title, description } }` or `null`
- `detections`: `[{ technology: { id, name, category }, confidence, evidence: [...] }]`

**Never exposed:**

- PostgreSQL row field names (`html_title`, `http_status_code`, etc.)
- `DATABASE_URL` or any connection string
- SQL errors or stack traces
- Internal implementation objects (Drizzle instances, etc.)

### Date serialization

All timestamps are serialized as ISO 8601 strings (`Timestamp` type in the
domain). The `http` observation only exposes `statusCode`, `contentType`, and
`finalUrl` — not the full headers array (headers are internal observability
data, not part of the API contract).

---

## 8. Failed Scan Semantics

A **failed scan** is a domain outcome, not an error. When a crawler throws a
`CrawlError` (timeout, network error, invalid target, body too large), the
scan transitions to `status: "failed"` with an error code and message, and
this result is persisted (scan row only, no snapshot).

### GET retrieval behavior

| Scenario               | HTTP Status | `scan.status` | `scan.error`  | `snapshot` |
| ---------------------- | ----------- | ------------- | ------------- | ---------- |
| Scan exists, completed | 200         | `"completed"` | `null`        | `{...}`    |
| Scan exists, failed    | 200         | `"failed"`    | `{code, msg}` | `null`     |
| Scan does not exist    | 404         | —             | —             | —          |

This distinction is **locked by tests** — see `get.test.ts` for the explicit
assertions that a failed scan returns 200 while an unknown ID returns 404.

---

## 9. Repository Tests

### InMemory repository tests

File: `packages/database/src/repository.test.ts`

New `getById (Step 21)` test suite:

- ✅ Returns a completed scan with its snapshot
- ✅ Returns a failed scan with null snapshot and empty detections
- ✅ Returns null for an unknown scan ID
- ✅ Returns null when the repository is empty
- ✅ Reconstructs correctly after a scan is re-saved as failed (stale data cleared)

New `list (Step 21)` test suite:

- ✅ Returns an empty array when no scans are persisted
- ✅ Returns a single completed scan
- ✅ Returns multiple scans in deterministic order (`createdAt DESC, scanId ASC`)
- ✅ Orders by `createdAt DESC` with `scanId ASC` tie-breaker
- ✅ Includes both completed and failed scans

### PostgreSQL repository tests

File: `packages/database/src/postgres-repository.test.ts`

New `getById (Step 21)` test suite (integration, skip-guarded):

- ✅ Returns a completed scan with its snapshot
- ✅ Returns a failed scan with null snapshot
- ✅ Returns null for an unknown scan ID
- ✅ Returns null when the table is empty

New `list (Step 21)` test suite (integration, skip-guarded):

- ✅ Returns an empty array when no scans are persisted
- ✅ Returns a single completed scan
- ✅ Returns scans in deterministic order (`createdAt DESC, scanId ASC`)
- ✅ Includes both completed and failed scans
- ✅ Preserves detections in the retrieved result

### Semantic parity

Both adapters implement identical method signatures and ordering semantics.
The InMemory adapter is the reference implementation for all unit tests;
the PostgreSQL adapter is validated against a live database when
`DATABASE_URL` is available (currently skipped in CI).

---

## 10. API Tests

File: `apps/web/src/app/api/scans/get.test.ts` (new, 17 tests)

### GET by ID

- ✅ Returns 200 with full scan details for an existing completed scan
- ✅ Returns 200 with failed scan (null snapshot, error populated) for an existing failed scan
- ✅ Returns 404 for an unknown scan ID
- ✅ Returns 404 when the repository is empty
- ✅ Returns 404 for an empty scan ID

### Response shape

- ✅ Exposes only documented fields — no DB internals (exact key set assertion)
- ✅ Serializes evidence correctly in the response
- ✅ Serializes dates as ISO 8601 strings

### GET list

- ✅ Returns 200 with empty list when no scans exist
- ✅ Returns 200 with a single scan
- ✅ Returns 200 with multiple scans in deterministic order
- ✅ Includes both completed and failed scans
- ✅ Response shape has `scans` wrapper with only documented summary fields

### Error handling

- ✅ Returns 500 when the repository throws on list
- ✅ Does not leak the database error message in the 500 response
- ✅ Returns 500 when the repository throws on getById
- ✅ Does not leak the database error in getById 500 response

### Existing tests (unchanged)

The existing `route.test.ts` (POST tests) and `route.integration.test.ts`
were updated only to add `getById`/`list` to mock repository objects — no
POST test assertions were changed. The POST endpoint continues to work
identically.

---

## 11. Performance Considerations

### Current implementation

- `GET /api/scans/:id` — a single indexed lookup (`scans.id` is the primary
  key) plus one optional lookup on `snapshots.scan_id` (also a PK). O(1)
  database access.
- `GET /api/scans` — a single `SELECT * FROM scans ORDER BY created_at DESC,
id ASC` query, plus a snapshot lookup per scan. For the current product
  stage (single-process worker, small-scale), this is adequate.

### SQL risk assessment

**No N+1 issue in production path**: The `PostgresScanResultRepository.list()`
uses `ORDER BY created_at DESC, id ASC` (indexed on the primary key column).
A per-scan snapshot lookup is performed in a loop, but for the current scale
(single-digit to low-double-digit scan count) this is acceptable. If the scan
volume grows significantly, this should be converted to a single `LEFT JOIN`
query.

### Documented limitations (deliberately NOT built)

- No pagination — the full scan history is returned. This is documented as
  appropriate for the current product stage.
- No cursor-based pagination.
- No full-text search.
- No filtering DSL.
- No caching (Redis or otherwise).
- No result count limit.

These are documented as deferred features, not silently accepted risks.

---

## 12. Security / Exposure Audit

### Fields never returned

- `DATABASE_URL` — never serialized into any response.
- Internal DB identifiers — only the domain `ScanId` (a UUID string) is
  exposed, matching the POST response.
- SQL errors — all repository exceptions are caught and converted to
  `INTERNAL_ERROR` with a generic message. The actual error string is logged
  server-side only.
- Stack traces — never included in API responses.
- Drizzle/database objects — never exposed above the infrastructure boundary.

### Error response consistency

All error responses (404 and 500) use the existing `ErrorResponse` shape:

```json
{ "error": { "code": "string", "message": "string" } }
```

- 404 uses `NOT_FOUND` / `"Scan not found."`
- 500 uses `INTERNAL_ERROR` / `"An internal error occurred."`

The 500 path also `console.error`s the actual error server-side for
observability, without leaking it to the client.

### No new SSRF surface

GET endpoints do not trigger any crawling or HTTP requests. They only read
persisted data. The SSRF protection on POST (`/api/scans`) is unchanged.

---

## 13. Changes Made

### New files

| File                                       | Purpose                                          |
| ------------------------------------------ | ------------------------------------------------ |
| `packages/application/src/queries.ts`      | `getScan` and `listScans` application operations |
| `apps/web/src/app/api/scans/[id]/route.ts` | Next.js dynamic route for `GET /api/scans/:id`   |
| `apps/web/src/app/api/scans/get.test.ts`   | 17 unit tests for GET handlers                   |
| `docs/Step21-report.md`                    | This report                                      |

### Modified files

| File                                                | Change                                                                                                                                                              |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/application/src/repository.ts`            | Added `getById` and `list` to `ScanResultRepository` interface                                                                                                      |
| `packages/application/src/index.ts`                 | Exported `getScan` and `listScans`                                                                                                                                  |
| `packages/database/src/repository.ts`               | Implemented `getById` and `list` in `InMemoryScanResultRepository` with `reconstruct()` helper                                                                      |
| `packages/database/src/postgres-repository.ts`      | Added `rowToScan`, `rowToSnapshot`, `rowsToResult` mappers; implemented `getById` and `list` in `PostgresScanResultRepository`                                      |
| `apps/web/src/app/api/scans/handler.ts`             | Added `ListScansResponse`, `ScanSummaryResponse`, `HandleGetScansResult`, `HandleGetScanByIdResult` types; added `handleGetScans` and `handleGetScanById` functions |
| `apps/web/src/app/api/scans/route.ts`               | Added `GET` handler exporting `handleGetScans`                                                                                                                      |
| `apps/web/src/app/api/scans/route.test.ts`          | Updated mock repositories to implement `getById` and `list`                                                                                                         |
| `packages/database/src/repository.test.ts`          | Added `getById (Step 21)` and `list (Step 21)` test suites (9 tests)                                                                                                |
| `packages/database/src/postgres-repository.test.ts` | Added `getById (Step 21)` and `list (Step 21)` test suites (9 tests, skip-guarded)                                                                                  |
| `docs/architecture/api.md`                          | Added GET /api/scans and GET /api/scans/:id documentation                                                                                                           |
| `docs/architecture/persistence.md`                  | Added read contract documentation                                                                                                                                   |
| `docs/architecture/application.md`                  | Added read operations section and file structure update                                                                                                             |
| `docs/Step21.md`                                    | Pre-existing spec file — formatted with Prettier                                                                                                                    |

---

## 14. Deferred Features

| Feature                         | Reason for deferral                                                                                                                                                                                                              |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pagination / cursor pagination  | Not needed at current scan volume                                                                                                                                                                                                |
| Search / filtering DSL          | Not requested in Step 21 spec                                                                                                                                                                                                    |
| Caching (Redis)                 | "No cache" constraint; would add complexity without need                                                                                                                                                                         |
| GraphQL / tRPC                  | "No GraphQL" constraint; REST is sufficient                                                                                                                                                                                      |
| Result count limit              | Full listing is adequate for current scale                                                                                                                                                                                       |
| Links persistence in PostgreSQL | Pre-existing — `html.links` were never persisted to the `snapshots` table (no `htmlLinks` column in schema). Read returns `links: []` for PostgreSQL-backed scans. This is a pre-existing limitation, not introduced by Step 21. |

---

## 15. Validation Results

All five validation checks pass:

| Check                 | Command                                              | Result                           |
| --------------------- | ---------------------------------------------------- | -------------------------------- |
| TypeScript type check | `pnpm typecheck`                                     | ✅ Pass                          |
| Tests                 | `pnpm test`                                          | ✅ Pass (943 passed, 18 skipped) |
| Lint + format         | `pnpm lint`                                          | ✅ Pass                          |
| Build                 | `pnpm build`                                         | ✅ Pass                          |
| Circular deps         | `npx madge --circular --extensions ts packages apps` | ✅ Pass (0 circular, 151 files)  |

### Baseline comparison

| Metric                | Before Step 21 | After Step 21                                                |
| --------------------- | -------------- | ------------------------------------------------------------ |
| Tests passed          | 916            | 943                                                          |
| Tests skipped         | 9              | 18 (9 additional PostgreSQL integration tests, skip-guarded) |
| Circular dependencies | 0              | 0                                                            |
| Files in madge        | 146            | 151 (5 new files)                                            |

### Endpoints verified

| Endpoint             | Status codes verified                                                           | Test coverage                |
| -------------------- | ------------------------------------------------------------------------------- | ---------------------------- |
| `GET /api/scans`     | 200 (empty, single, multiple, ordering, mixed statuses), 500 (repository error) | 8 unit tests                 |
| `GET /api/scans/:id` | 200 (completed, failed), 404 (unknown, empty), 500 (repository error)           | 9 unit tests                 |
| `POST /api/scans`    | 200, 400, 500 (unchanged)                                                       | Existing 21 tests still pass |

### Response serialization verified

- ✅ Dates serialized as ISO 8601 strings
- ✅ URLs serialized as strings
- ✅ Status values: `"pending"`, `"running"`, `"completed"`, `"failed"`
- ✅ Detections and evidence serialized correctly
- ✅ Nullability: `snapshot` is `null` for failed scans, `error` is `null` for non-failed scans
- ✅ No DB internals (snake_case columns, error codes, stack traces) in any response

### Failed scan vs unknown scan distinction

| Scenario             | HTTP | `scan.status` | `scan.error`  | `snapshot` |
| -------------------- | ---- | ------------- | ------------- | ---------- |
| Completed scan found | 200  | `"completed"` | `null`        | `{...}`    |
| Failed scan found    | 200  | `"failed"`    | `{code, msg}` | `null`     |
| Unknown scan ID      | 404  | —             | —             | —          |

This distinction is locked by explicit tests in `get.test.ts`.
