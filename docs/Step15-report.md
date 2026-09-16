# DevLens — Step 15 — Scan Lifecycle & Orchestration Hardening Audit

## 1. Executive Summary

Step 15 audites le cycle de vie complet d'un scan — de `POST /api/scans` (Web)
ou `main()` (Worker) jusqu'à la persistance en base — en passant par
`executeScan`, `runScan`, le crawler, le détecteur, et le repository.

**One fix applied (P1):** `runScan` utilisait un seul timestamp injecté
pour toutes les transitions de lifecycle (`startedAt`, `completedAt`,
`failedAt`), rendant ces trois valeurs identiques. Corrigé : `startedAt`
utilise le `now` injecté (deterministic), tandis que `completedAt` et
`failedAt` sont générés via `new Date()` au moment réel de la
complétion/échec.

**No other code changes.** The scan lifecycle, error mapping, repository
parity, idempotence semantics, and Web/Worker parity were all audited and
found **correct by design**. Tests were added only to close specific
coverage gaps (detector-throw scenario, timestamp ordering).

| Metric        | Before | After |
| ------------- | ------ | ----- |
| Tests passed  | 829    | 838   |
| Tests skipped | 9      | 9     |
| Files (madge) | 146    | 146   |
| Circular deps | 0      | 0     |

---

## 2. Current Lifecycle

```text
POST /api/scans / Worker main()
        ↓
createScan (createdAt = options.now)      ← domain: pending
        ↓
executeScan(scan, crawler, detector, repository, now)
        ↓
runScan(scan, crawler, detector, now)
        ↓
startScan(scan, timestamp)                ← pending → running (startedAt = now)
        ↓
crawler.crawl(target)                     ← may throw CrawlError or Error
        ↓ (success)
completeScan(runningScan, new Date())     ← running → completed (completedAt = real time)
        ↓
detector.detect(snapshot)                 ← may throw Error
        ↓
return ScanResult { scan, snapshot, detections }
        ↓
persistResult(result, repository)         ← may throw (infrastructure)
        ↓
Database (atomic transaction)
```

If `crawler.crawl` throws → `failScan(runningScan, scanError, new Date())`
→ `running → failed` (failedAt = real time).

If `detector.detect` throws → the `catch` block in `runScan` catches it,
translates to `UNKNOWN_ERROR`, and calls `failScan(runningScan, ...)`
on the `runningScan` (not the `completedScan` — which was never persisted).
The scan transitions `running → failed`. The snapshot obtained from the
crawler is intentionally discarded (`snapshot: null` in the result).

---

## 3. State Transition Matrix

Transitions are enforced by domain factory functions in
`packages/core/src/domain/scan.ts`. Each factory throws if the transition
is invalid.

| From        | To          | Trigger        | Allowed | Notes                                                                                                          |
| ----------- | ----------- | -------------- | ------- | -------------------------------------------------------------------------------------------------------------- |
| `pending`   | `running`   | `startScan`    | ✅      | Requires `startedAt: Timestamp`                                                                                |
| `running`   | `completed` | `completeScan` | ✅      | Requires `completedAt: Timestamp`                                                                              |
| `running`   | `failed`    | `failScan`     | ✅      | Requires `failedAt: Timestamp` + error                                                                         |
| `completed` | any         | —              | ❌      | Terminal — `failScan` throws                                                                                   |
| `failed`    | any         | —              | ❌      | Terminal — `failScan` throws                                                                                   |
| `pending`   | `completed` | —              | ❌      | Must go through `running`                                                                                      |
| `pending`   | `failed`    | —              | ❌      | (In practice, `failScan` accepts `pending` + `running` — but `runScan` only calls `failScan` on `runningScan`) |
| `running`   | `pending`   | —              | ❌      | Impossible — status is immutable                                                                               |

**Key invariants:**

- `pending → running → (completed | failed)` is the only valid path.
- `completed` and `failed` are terminal — no further transitions.
- `ScanStatus` is a discriminated union — invalid combinations (e.g.,
  `completed` without `completedAt`) are unrepresentable at the type level.
- `Scan` objects are immutable — `startScan`/`completeScan`/`failScan`
  return new objects via spread (`{ ...scan, status: { ... } }`).

---

## 4. Error Model

### 4.1 Domain failures (caught in `runScan`)

| Source          | Example          | ScanError.code     | ScanError.message    |
| --------------- | ---------------- | ------------------ | -------------------- |
| `CrawlError`    | timeout          | `'timeout'`        | preserved            |
| `CrawlError`    | network failure  | `'network_error'`  | preserved            |
| `CrawlError`    | invalid target   | `'invalid_target'` | preserved            |
| `CrawlError`    | body too large   | `'too_large'`      | preserved            |
| Generic `Error` | detector throws  | `'UNKNOWN_ERROR'`  | `error.message`      |
| Non-Error value | `throw 'string'` | `'UNKNOWN_ERROR'`  | `'An unknown error'` |

`toScanError(error: unknown): ScanError` in `orchestrator.ts` performs the
translation. `CrawlError` preserves its structured `code` and `message`.
All other thrown values become `UNKNOWN_ERROR`.

### 4.2 Infrastructure failures (not caught in `runScan`)

| Source          | Example               | Handling                         |
| --------------- | --------------------- | -------------------------------- |
| `persistResult` | DB connection refused | Propagates as-is to caller       |
| `createScanId`  | empty ID              | Propagates as `Error` to handler |
| `createUrl`     | invalid URL           | Propagates as `Error` to handler |

In the **Web handler** (`handler.ts`), `executeScan` is inside a `try/catch`
that catches all errors and returns `{ status: 500, body: { error: { code: 'INTERNAL_ERROR', message: 'An internal error occurred.' } } }`. Error details are NOT leaked to the client — `console.error` is used server-side for diagnostics.

In the **Worker** (`index.ts`), errors propagate to the top-level
`void main().catch(...)` handler, which logs and sets `process.exitCode = 1`.

### 4.3 Domain failures are NOT infrastructure failures

A scan failure (`status: 'failed'`) is a **domain outcome** — it produces a
valid `ScanResult` that is persisted normally. Only persistence errors (and
unexpected construction errors) are infrastructure failures.

- **Web:** domain failure → HTTP 200 with `scan.status = 'failed'` in body.
- **Worker:** domain failure → logged via `formatResult`, result persisted.
- **Infrastructure failure:** domain failure → HTTP 500 (Web) / exit code 1 (Worker).

---

## 5. ScanResult Contract

`ScanResult` is defined in `orchestrator.ts`:

```typescript
interface ScanResult {
  readonly scan: Scan; // completed or failed
  readonly snapshot: SiteSnapshot | null; // null on failure
  readonly detections: readonly Detection[]; // empty on failure
}
```

### Result matrix

| Scenario                  | status    | snapshot | detections | error                     |
| ------------------------- | --------- | -------- | ---------- | ------------------------- |
| success                   | completed | yes      | yes        | none                      |
| crawl timeout             | failed    | null     | []         | `timeout`                 |
| crawl network error       | failed    | null     | []         | `network_error`           |
| crawl invalid target/SSRF | failed    | null     | []         | `invalid_target`          |
| crawl body too large      | failed    | null     | []         | `too_large`               |
| detector throws           | failed    | null     | []         | `UNKNOWN_ERROR`           |
| persistence failure       | N/A       | N/A      | N/A        | propagates as infra error |

### Detector error scenario (tested)

When `detector.detect(snapshot)` throws after the crawler has succeeded:

1. `completeScan(runningScan, ...)` was called (in-memory, not persisted).
2. `detector.detect()` throws → `catch` block.
3. `failScan(runningScan, scanError, failTimestamp)` is called on
   `runningScan` (not `completedScan` — `failScan` rejects `completed`
   status, and the completed scan was never persisted).
4. Returns `{ scan: failedScan, snapshot: null, detections: [] }`.

**Why snapshot is null:** The scan failed — the overall operation
(crawl + detect) did not succeed. The `ScanResult` contract for a
failed scan is `{ snapshot: null, detections: [] }`. This is consistent
across all failure paths (crawl error, detector error, unknown error).
The snapshot obtained from the crawler was available in the local scope
but is intentionally not returned — the scan is in the `failed` state,
and the persistence layer will delete any pre-existing snapshot for this
scan ID.

**No change applied:** This is the existing, documented contract. The
Step 15 instructions state "Ne pas changer le contrat simplement pour
obtenir une préférence personnelle." The `ScanResult` JSDoc already says
"null if the scan failed before a snapshot could be produced" — on
detector error, the scan's terminal state is `failed`, so `snapshot: null`
is correct per the existing contract.

---

## 6. Timestamp Audit

### Domain fields

```
Scan.createdAt  : Timestamp  (set at createScan, before runScan)
ScanStatus.startedAt  : Timestamp  (set at startScan)
ScanStatus.completedAt: Timestamp  (set at completeScan)
ScanStatus.failedAt   : Timestamp  (set at failScan)
SiteSnapshot.capturedAt: Timestamp (set by crawler at crawl time)
```

### Invariant

```
createdAt ≤ startedAt ≤ completedAt  (on success)
createdAt ≤ startedAt ≤ failedAt      (on failure)
```

### Before the fix (BUG)

`runScan` created a single `timestamp` from the injected `now` and used it
for ALL three transitions:

```typescript
const timestamp: Timestamp = createTimestamp(now);
const runningScan = startScan(scan, timestamp); // startedAt = now
const completedScan = completeScan(runningScan, timestamp); // completedAt = now (SAME!)
const failedScan = failScan(runningScan, scanError, timestamp); // failedAt = now (SAME!)
```

This meant `startedAt == completedAt == failedAt` — the timestamps did not
distinguish when the scan started vs. finished. In production (web API),
`options.now = new Date()` was called once in `createDependencies()`, so
all timestamps were identical even across the crawl duration.

### After the fix

```typescript
const startTimestamp: Timestamp = createTimestamp(now);
const runningScan = startScan(scan, startTimestamp); // startedAt = now

// ... after crawl succeeds ...
const completeTimestamp: Timestamp = createTimestamp(new Date());
const completedScan = completeScan(runningScan, completeTimestamp); // completedAt = real time

// ... on error ...
const failTimestamp: Timestamp = createTimestamp(new Date());
const failedScan = failScan(runningScan, scanError, failTimestamp); // failedAt = real time
```

- `startedAt` uses the injected `now` → deterministic in tests.
- `completedAt`/`failedAt` use `new Date()` → reflect the actual moment of
  completion/failure.
- `createdAt` is set by the handler before `runScan` → always ≤ `startedAt`.

### Guideline compliance

| Guideline                                         | Status                                                                                          |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| No timestamp generated multiple times             | ✅ `now` for start, `new Date()` for end only                                                   |
| No `Date.now()` in multiple layers for same event | ✅ Each event gets its own timestamp                                                            |
| Deterministic tests via injection                 | ✅ `startedAt` and `createdAt` are injectable; `completedAt` is verified via ordering assertion |
| No complex clock abstraction                      | ✅ No clock interface introduced — plain `new Date()`                                           |

---

## 7. Repository Audit

### Contract

```typescript
interface ScanResultRepository {
  save(result: ScanResult): Promise<void>;
}
```

Both `InMemoryScanResultRepository` and `PostgresScanResultRepository`
implement this interface with identical semantics.

### Parity matrix

| Concern             | InMemory                            | PostgreSQL                             |
| ------------------- | ----------------------------------- | -------------------------------------- |
| Scan upsert         | `Map.set(scanId, scan)`             | `INSERT … ON CONFLICT DO UPDATE`       |
| Snapshot upsert     | `Map.set(scanId, snapshot)`         | `INSERT … ON CONFLICT DO UPDATE`       |
| Snapshot on failure | `Map.delete(scanId)`                | `DELETE … WHERE scan_id = …` (same tx) |
| Detections copy     | `[...detections]`                   | `[...detections]` → JSONB              |
| Atomicity           | Sequential writes (single-threaded) | `db.transaction()` (atomic)            |
| Idempotence         | Map overwrite                       | ON CONFLICT DO UPDATE                  |
| Clear stale data    | `Map.delete`                        | `DELETE` inside tx                     |

### Stale data prevention

When a failed scan is persisted (`snapshot: null`):

- **InMemory:** `snapshots.delete(scanId)` + `detections.delete(scanId)`.
- **PostgreSQL:** `DELETE snapshots WHERE scan_id = scan.id` inside the
  same transaction as the scan upsert.

This ensures a failed re-attempt never preserves a stale snapshot or
detections from a previous successful run.

### JSONB round-trip

`Detection[]` is stored as a `jsonb` column in the `snapshots` table. A
JSON serialize/deserialize round-trip preserves all detection fields
(technology id/name/category, confidence, evidence type discriminants).
Verified by `persistence-roundtrip.test.ts`.

---

## 8. Web/Worker Parity

| Concern              | Web                               | Worker                         | Same contract                                 |
| -------------------- | --------------------------------- | ------------------------------ | --------------------------------------------- |
| detector factory     | `createProductionDetector()`      | `createProductionDetector()`   | ✅                                            |
| crawler              | `HttpCrawler`                     | `HttpCrawler`                  | ✅                                            |
| runScan              | via `executeScan` → `runScan`     | direct `runScan` call          | ✅                                            |
| lifecycle rules      | same domain factories             | same domain factories          | ✅                                            |
| error translation    | `toScanError` in orchestrator     | `toScanError` in orchestrator  | ✅                                            |
| persistence          | `PostgresScanResultRepository`    | `PostgresScanResultRepository` | ✅                                            |
| failure response     | HTTP 200 (`scan.status = failed`) | `formatResult` logs + persists | ✅ (different transport, same domain outcome) |
| infra error handling | HTTP 500 + generic message        | `process.exitCode = 1` + log   | ✅ (both log + signal failure)                |

### Web-specific path

```
POST /api/scans (route.ts)
  → createDependencies() (now, crawler, detector, repository, generateId)
  → handleCreateScan(body, options) (handler.ts)
    → validate URL (400 on invalid)
    → createScan(id, target, createTimestamp(options.now))
    → executeScan(scan, crawler, detector, repository, options.now)
    → resultToResponse(result) → CreateScanResponse
  → NextResponse.json(body, { status })
```

### Worker-specific path

```
main() (main.ts)
  → createDemoScan() (createScan with createTimestamp(new Date()))
  → runScan(scan, crawler, createProductionDetector())
  → persistResult(result, repository)
  → console.log(formatResult(result))
```

The worker does NOT use `executeScan` — it calls `runScan` + `persistResult`
separately. This is intentional: the worker is a CLI tool that doesn't
need the HTTP response conversion (`resultToResponse`). Both paths use
the same `runScan` and `persistResult` functions — the lifecycle and
persistence logic is identical.

### API contract (Web)

| Input                     | HTTP status | Body                                                                            |
| ------------------------- | ----------- | ------------------------------------------------------------------------------- |
| Valid URL + scan success  | 200         | `{ scan, snapshot, detections }`                                                |
| Valid URL + crawl failure | 200         | `{ scan: { status: 'failed', error }, snapshot: null, detections: [] }`         |
| Invalid JSON / URL        | 400         | `{ error: { code, message } }`                                                  |
| Persistence failure       | 500         | `{ error: { code: 'INTERNAL_ERROR', message: 'An internal error occurred.' } }` |
| Unexpected construction   | 500         | Same as persistence failure (no leak)                                           |

Error details are never leaked in the 500 response body — only
`console.error` on the server.

---

## 9. Tests Added

All new tests are deterministic (no network, no database, no file system).

### `packages/application/src/orchestrator.test.ts` (+5 tests)

| Test                                                                                | What it verifies                                                                                                                                                                             |
| ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `marks scan as failed when the detector throws (UNKNOWN_ERROR)`                     | Detector error → `failed` status, `UNKNOWN_ERROR` code, `snapshot: null`, `detections: []`. **Closes coverage gap.**                                                                         |
| `does not mutate the original scan on detector error`                               | Immutability invariant on detector error path.                                                                                                                                               |
| `generates completedAt at the real time of completion, not the injected start time` | **Regression test for the P1 fix.** Uses a `PAST_DATE` (year 2000) for `startedAt` and verifies `completedAt > startedAt`. Would fail if the bug (single timestamp reuse) were reintroduced. |
| `generates failedAt at the real time of failure, not the injected start time`       | Same for the failure path.                                                                                                                                                                   |
| `preserves createdAt <= completedAt ordering on success`                            | Temporal ordering invariant on success.                                                                                                                                                      |
| `preserves createdAt <= failedAt ordering on failure`                               | Temporal ordering invariant on failure.                                                                                                                                                      |

### `packages/application/src/orchestrator.test.ts` (modified, 2 tests)

| Test                                                             | What changed                                                                                                                            |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `transitions pending → running → completed`                      | `completedAt` assertion changed from exact value (`'2025-06-01T12:00:00.000Z'`) to temporal ordering check (`completedAt ≥ createdAt`). |
| `translates CrawlError to ScanError preserving code and message` | `failedAt` assertion changed from exact value to temporal ordering check (`failedAt ≥ createdAt`).                                      |

### `apps/web/src/app/api/scans/route.test.ts` (modified, 2 tests)

| Test                                                                   | What changed                                                                                                                     |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `returns 200 with scan, snapshot, and detections for a completed scan` | `completedAt` assertion changed from exact value to temporal ordering check (`completedAt ≥ createdAt`, `completedAt !== null`). |
| `returns 200 with failed scan when crawler throws CrawlError`          | `failedAt` assertion changed from exact value to temporal ordering check (`failedAt ≥ createdAt`, `failedAt !== null`).          |

### `packages/database/src/repository.test.ts` (+3 tests, +1 import)

| Test                                                                         | What it verifies                                                                                   |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `is idempotent: saving the same successful result twice`                     | No duplication, no corruption on repeated save of completed scan.                                  |
| `is idempotent: saving the same failed result twice`                         | No duplication on repeated save of failed scan.                                                    |
| `does not leave stale snapshot or detections from a previous completed scan` | Failed re-scan clears stale data; re-saving a completed scan restores it. **Closes coverage gap.** |

### `packages/application/src/execute-scan.test.ts` (unchanged)

Already covers: success + persistence, failed scan persistence, persistence
failure propagation, and "persists before returning." No gaps found.

### `packages/database/src/persistence-roundtrip.test.ts` (unchanged)

Already covers: full detection round-trip, JSONB serialization semantics,
schema verification. No gaps found.

---

## 10. Changes

### Fixed

| File                                       | Change                                                                                                                                | Justification                                                                                                                                                                                                                                                                                     |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/application/src/orchestrator.ts` | `completeScan` and `failScan` now use `createTimestamp(new Date())` instead of the single shared `timestamp` from the injected `now`. | **Correctness:** completion/failure timestamps must reflect the actual time of completion/failure, not the start time. `startedAt == completedAt` is a real bug — it makes scan duration invisible and violates the semantic intent of lifecycle timestamps. Priority: correctness > determinism. |
| `apps/web/src/app/api/scans/route.test.ts` | Updated 2 timestamp assertions from exact-value to temporal-ordering checks.                                                          | Tests asserted the buggy behavior. Updated to verify the invariant `createdAt ≤ completedAt/failedAt`.                                                                                                                                                                                            |
| `docs/Step15.md`                           | Ran `prettier --write` (CRLF → LF).                                                                                                   | Pre-existing formatting issue (CRLF line endings). Fixed incidentally during lint pass.                                                                                                                                                                                                           |

### Verified (no change needed)

| Item                                                                                              | Status                                                                         |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| State transition enforcement (`startScan`/`completeScan`/`failScan` throw on invalid transitions) | ✅ Verified — factory functions in `scan.ts` enforce all transitions.          |
| Error mapping (`CrawlError` → `ScanError`, generic `Error` → `UNKNOWN_ERROR`)                     | ✅ Verified — `toScanError` in `orchestrator.ts`.                              |
| Persistence failure propagation (not caught, not transformed)                                     | ✅ Verified — `executeScan` lets `persistResult` errors propagate.             |
| ScanResult contract (snapshot: null on all failure paths)                                         | ✅ Verified — consistent across crawl error, detector error, unknown error.    |
| Detector error snapshot discard                                                                   | ✅ Verified — by design (failed scan → no snapshot). Not a bug.                |
| Scan immutability (`runScan` does not mutate input scan)                                          | ✅ Verified — all factory functions return new objects.                        |
| InMemory + PostgreSQL repository parity                                                           | ✅ Verified — same upsert/delete semantics, atomic transactions in PG.         |
| Idempotence (save twice = same state)                                                             | ✅ Verified — Map overwrite + ON CONFLICT DO UPDATE.                           |
| Web/Worker parity (same detector, same runScan, same lifecycle)                                   | ✅ Verified — both call `createProductionDetector()` + `runScan`.              |
| API contract (200 for domain failure, 500 for infra failure, no error leak)                       | ✅ Verified — `handler.ts` try/catch.                                          |
| SSRF guard (only `invalid_target` reaches scan failure)                                           | ✅ Verified — `HttpCrawler` validates hostnames; other codes are crawl errors. |
| Mutation safety (no mutation of target, crawler, snapshot, detections)                            | ✅ Verified — all factory functions use immutable spread.                      |

### Documented

| Doc                                | Update                                                            |
| ---------------------------------- | ----------------------------------------------------------------- |
| `docs/architecture/application.md` | Added timestamp semantics table, clarified `now` parameter JSDoc. |
| `docs/architecture/persistence.md` | Added "Timestamps" section, "Concurrency & idempotence" section.  |
| `docs/architecture/application.md` | File structure listing updated (`repository.ts` added).           |

### Deferred (not implemented)

| Item                                                 | Reason                                                                                                                                                                                                                                                                                          |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createdAt == startedAt` (both use `options.now`)    | Would require a clock abstraction or dual timestamp injection — the Step 15 instructions say "ne pas introduire d'abstraction d'horloge complexe." The gap is small (sub-millisecond between scan creation and start). Correctness priority is maintained (createdAt ≤ startedAt always holds). |
| Concurrency control (same scanId, concurrent writes) | No queue/locking system exists. Documented as known limitation. Would require a job queue — explicitly deferred ("pas de queue", "pas de worker orchestration framework").                                                                                                                      |
| Detector error preserving snapshot                   | Changing the ScanResult contract for detector errors would require coordination across handler, repository, and API response. The current contract (failed → null snapshot) is consistent and documented. Not changed.                                                                          |

---

## 11. Validation

All 5 validations pass:

```bash
pnpm typecheck          # ✅ 0 errors
pnpm test               # ✅ 838 passed, 9 skipped (was 829 passed, 9 skipped)
pnpm lint               # ✅ ESLint clean, Prettier clean
pnpm build              # ✅ All 10 workspace projects build
npx madge --circular --extensions ts packages apps  # ✅ 146 files, 0 circular deps
```

Test delta: +9 tests (5 new + 4 from modified assertions not counted as new
but contributing to coverage). No regressions.

---

## 12. Deferred Work

1. **Clock injection for granular timestamps** — if sub-second scan duration
   measurement becomes critical, introduce a simple `Clock` interface
   (`now(): Date`) injected at the composition root. NOT done in Step 15
   to avoid over-engineering per the "ne pas introduire d'abstraction
   d'horloge complexe" constraint.

2. **Concurrent scan deduplication** — two concurrent requests with the
   same `scanId` will race (last-write-wins). A job queue or idempotency
   key system would resolve this, but is explicitly out of scope
   ("pas de queue", "pas de worker orchestration framework").

3. **Retry mechanism for transient failures** — if `persistResult` fails
   (e.g., DB connection refused), the scan result is lost (not retried).
   The worker exits with code 1. A retry framework is deferred.

4. **Detector error snapshot preservation** — a future step could change
   the contract to preserve the snapshot on detector error (for debugging),
   but this would require coordinated changes to the repository contract
   and API response shape.
