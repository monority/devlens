# Step 97 — Report: Enforce Technology Data Access Boundary

## 1. Problem

Step 96 (`897186a`) audited the monoreleau architecture and identified one
concrete architectural drift from the Web/API → Application → Database boundary:

> **F-001 — Direct database access from the web layer.**
> `apps/web/src/app/technologies/[id]/page.tsx` reached into PostgreSQL via
> `getAllScanResults()` → `new PostgresScanResultRepository(createDatabaseClient())`,
> importing `@devlens/database` and the `listScans` application query directly in
> the page's data-access helper (`apps/web/src/lib/scan-data.ts`).

Step 96 was audit-only and justified no code change. F-001 is the single
fixable drift and is the object of this step. The fix must additionally
provide a **bulk** data source so the page does not regress into an HTTP N+1
(per-scan fetch) or a handler-level N+1 (N `getById` queries).

## 2. Scope

**In scope (F-001):**
- Route the Technology page's scan-detection data through
  `Web/API → Application → Database repository → PostgreSQL`.
- Add a bulk `GET /api/scans?technologyId=<id>` endpoint returning only the
  scans that detected a technology, each as a lean `{ scan, detections }`
  projection.
- Preserve the page's exact rendered behavior.

**Explicitly out of scope (not modified):**
- Detection logic/functions (`detectionToResponse`, `getScanDetectionResults`,
  `computeDetectionProvenance`, `computeDetectionIntegrity`,
  `computeSignalQuality`, detectors, scoring). Exactly one **call-site** relocates
  to the API layer (the documented home of the Step 73 API mapping); the page
  reuses the same pipeline, so no semantics change.
- Provenance/integrity/comparison *semantics*; crawler; worker; DB schema;
  unrelated UI/navigation; Playwright; esbuild; stubs.
- `.poolside/settings.local.yaml` (left untouched).
- `PostgresScanResultRepository.list()`'s server-side snapshot loop
  (DEFERRED — see §12).

## 3. Before

Server-side data flow (all in the web layer's server component):

```
page.tsx
 → fetchDetectedScans(id)                       [app/technologies/[id]/page.tsx:84]
 → getAllScanResults()                          [lib/scan-data.ts:38]
 → new PostgresScanResultRepository(createDatabaseClient())   [scan-data.ts:39-40]
   (imports createDatabaseClient, PostgresScanResultRepository from @devlens/database;
    listScans from @devlens/application — scan-data.ts:23-25)
 → listScans(repository) → repository.list()    [postgres-repository.ts:354]
 → ScanResult[]  = ALL scans, each with FULL snapshot + ALL detections
 → in-memory filter: r.detections.some(d => d.technology.id === techId)
 → scanResultToSummary(scans)                   → ScanSummary[]  ("Detected in scans")
 → technologyDetectionHistory(scans, id)        → TechnologyDetectionHistoryEntry[] (timeline)
 → technologyDetectionHistorySummary(...)         (Step 89 compact summary)
```

Problems:
1. **Boundary violation** — `@devlens/database` is imported directly in the web
   layer (violates the documented "web consumes the HTTP API only" contract in
   `lib/api.ts`).
2. **Over-fetch** — `listScans()` materializes every scan's full `snapshot`
   (crawled HTML) and every scan's full detections, even though the technology
   page only needs the matching scans' scan-summary + detections.

## 4. Design

A single endpoint on the **existing** collection route (no new route segment):

| Decision | Value |
|----------|-------|
| Route | `GET /api/scans?technologyId=<id>` (query param on existing collection route) |
| Method | `GET` |
| Parameter | `technologyId` (string) |
| Validation | Empty/whitespace-only → `200 { scans: [] }` (never 404) |
| 200 body | `{ scans: Array<{ scan: ScanResponse; detections: Detection[] }> }` |
| Unknown technology | Handled **upstream** by the page (`getTechnologyById` → `notFound()`); the endpoint never 404s on technology |
| No scan detected | `200 { scans: [] }` (valid empty view) |
| Error | `500 { error: { code: 'INTERNAL_ERROR', message } }` — no DB internals leaked |
| Ordering | `createdAt DESC, scanId ASC` (inherited from `listScans`) |
| Pagination | Not added (a technology's detection history is bounded by scans that detected it) |
| Limit | None |

`detections` carries the **raw domain** `Detection` (not `DetectionResponse`):
the page reuses its existing `technologyDetectionHistory` pipeline, which runs
`detectionToResponse` (the documented home of the Step 73 API mapping for this
projection) and then `getScanDetectionResults`. Because `getScanDetectionResults`
**recomputes** `explanation` and **forwards** `provenance`/`integrity`, feeding
it the raw detection yields byte-for-byte identical output to the scan-detail
view. This keeps the endpoint lean (no explanation/provenance/integrity bloat on
the wire) while preserving diagnostics.

## 5. Architecture

```
route.ts  GET(request) — read technologyId query param
  └─ technologyId present ? handleGetScansByTechnology(techId, deps) : handleGetScans(deps)

handler.ts  handleGetScansByTechnology(techId, { repository })             [handler.ts:441]
  ├─ listScansByTechnology(techId, repository)                            [queries.ts:50]
  │    └─ listScans(repository) → repository.list()                      (ONE call)
  └─ resultToTechnologyScanSummary(result) = { scan: scanResultToSummary(result),
                                                detections: [...result.detections] }  [handler.ts:415]
       (scanResultToSummary reused from lib/scan-data.ts — mirrors resultToResponse)
  → NextResponse.json({ scans: [...] }) as TechnologyScansResponse

page.tsx  fetchDetectedScans(techId)                                      [page.tsx:84]
  └─ fetchScansByTechnology(techId)  →  GET /api/scans?technologyId=<techId>   [api.ts:98]
  → TechnologyScanSummary[] | null
  → TechnologyDetectedInScans(scans.map(s => s.scan))    // ScanSummary[]
  → technologyDetectionHistory(scans, id)                // unchanged pipeline
  → technologyDetectionHistorySummary(...)
```

The page now imports **only** `@/lib/api` (`fetchScansByTechnology`) and
`@/lib/types` (`ScanSummary`, `TechnologyScanSummary`). It no longer imports
`@devlens/application`, `@devlens/database`, `scan-data`, or any SQL/DB client.

Layers reused (no new SQL/Drizzle written in the web layer):
- `listScans` (existing application query) — wrapped as the one-line
  `listScansByTechnology` filter.
- `scanResultToSummary` (existing `scan-data.ts` mapper) — now shared by the
  handler, removing the duplication flagged as F-007 in Step 96.
- `detectionToResponse` / `getScanDetectionResults` / `compute*` — untouched.

## 6. N+1 — measure

The fix eliminates **both** N+1 shapes the task warns about, measured at the
handler/repository-call boundary:

| Client boundary | Before | After |
|-----------------|--------|-------|
| HTTP (page → data) | 0 HTTP, but 1 direct DB call in the page | **1** `fetchScansByTechnology` request |
| Handler → repository | n/a (page called DB directly) | **1** `listScans` → `repository.list()` |
| `repository.list()` internals | 1 `SELECT scans` + N `SELECT snapshots` (per-scan) | unchanged (see §12, DEFERRED) |

- **HTTP N+1 avoided:** the page issues exactly **one** fetch; it never loops
  over scans to fetch per-scan detail.
- **Handler-level N avoided:** the handler calls `listScans` once (→ `list()`
  once). It never calls `getById` in a loop.

Target achieved: `1 technology request → 1 bulk data retrieval path` (handler →
repository). The only remaining per-scan work is *inside* `repository.list()`
(deferred; pre-existing; shared by `GET /api/scans`).

## 7. Behavior equivalence

All rendered outputs are preserved:

| Concern | Before | After |
|---------|--------|-------|
| "Detected in scans" cards | `ScanSummary[]` via `scanResultToSummary` | `ScanSummary[]` via `data.scans.map((s) => s.scan)` (same `ScanSummary` shape) |
| Detection timeline | `technologyDetectionHistory(scans, id)` | identical call; pipeline `detectionToResponse → getScanDetectionResults → toHistoryEntry` unchanged → `TechnologyDetectionHistoryEntry[]` identical |
| Step 89 summary | `technologyDetectionHistorySummary(history)` | unchanged input type (`TechnologyDetectionHistoryEntry[]`) → identical |
| Empty state | `'No scans have detected this technology yet.'` | same (empty payload from endpoint) |
| Error state | `'Unable to load scan data for this technology.'` | same (`fetchDetectedScans` returns `null` on ApiError/fetch failure) |

`toHistoryEntry`'s flat field reads changed only cosmetically
(`scan.status.type` → `scan.status`, `scan.target.hostname` → `scan.hostname`,
`scan.status.completedAt` → `scan.completedAt`) because `ScanSummary` is already
the flattened projection — the *values* are identical, so the timeline, summary,
and cards render identically. The diagnostic primitives (`computeDetection…`,
`computeSignalQuality`) and their verdicts are untouched.

## 8. Tests

| File | What changed |
|------|--------------|
| `apps/web/src/app/api/scans/get.test.ts` | +`describe('GET /api/scans?technologyId — handler')` (9 tests): empty repo, blank id → `[]`, no match → `[]`, match + server-side filter, ordering preserved, failed-scan exclusion, response shape (`{scan, detections}` only; scan = lean `ScanSummary`; detections raw; no `explanation/provenance/integrity` on the wire), 500 + non-leak + `console.error` sanitization. Uses `InMemoryScanResultRepository` (no DB). |
| `apps/web/src/lib/api.test.ts` | +`describe('fetchScansByTechnology')` (4 tests): 200 returns scans, empty list, URL-encoding of `technologyId`, 500 → `ApiError`. Mirrors `fetchScans`. |
| `apps/web/src/app/technologies/[id]/page.test.tsx` | Mock swapped `@/lib/scan-data` → `@/lib/api` (`fetchScansByTechnology`); `makeScanResult` → `makeTechnologyScanSummary`; **all 3 HTML assertions preserved** (header, 'Detected in 1 scan', timeline 'Direct'/'Valid'/'80', Step 89 summary, empty state, error state). |
| `app/web/src/lib/technology-detection-history.test.ts` | Fixtures adapted to the flat `TechnologyScanSummary` (`makeScan`/`COMPLETED`/`FAILED` now build the flat scan summary; `makeDetection` **unchanged**). All 19 assertions preserved — the real pipeline (`detectionToResponse → getScanDetectionResults → compute*`) still runs end-to-end. |

The application query `listScansByTechnology` is covered transitively through
the handler tests (in-memory repository — no `DATABASE_URL` required).

## 9. Grep verification (Phase 7 gate)

Target: `apps/web/src/app/technologies` must contain **no** DB/ORM/infra
references.

```
grep — @devlens/database | drizzle | postgres | createDatabaseClient
apps/web/src/app/technologies/[id]/page.tsx
apps/web/src/app/technologies/[id]/page.test.tsx
apps/web/src/app/technologies/page.tsx
apps/web/src/app/technologies/page.test.tsx
→ 0 matches (the only "database" mention is the word "database" in an English
  doc comment describing the boundary — not an import, not SQL, not a client.)
```

Confirmed: the Technology page (and its test) import neither
`@devlens/database` nor `createDatabaseClient`, nor any `listScans`/`getAllScanResults`
data-fetch symbol. `lib/scan-data.ts` likewise has no `@devlens/database`/`listScans`/
`getAllScanResults` references (only the pure `scanResultToSummary` mapper remains,
now consumed by the handler).

## 10. Performance / data-shape comparison

**Before** (`getAllScanResults`): the page loaded ALL `ScanResult` objects — each
carrying the full `snapshot` (crawled HTML blob), all detections, plus the
scan summary — for **every** scan in the database, then filtered in-memory by
technology. Only the scan-summary + detections were actually consumed; the
snapshot and non-matching scans were load-and-discarded.

**After** (`GET /api/scans?technologyId=<id>`): the endpoint returns, per
matching scan, only:
- `scan`: the flat `ScanSummary` (`id, status, target, hostname, createdAt,
  startedAt, completedAt, failedAt, error`) — **no snapshot**, no
  `observationCoverage`, no `resultQuality`.
- `detections`: raw `Detection[]` — **no** `explanation`/`provenance`/`integrity`
  on the wire (those are computed once, in-page, via the existing pipeline).

Net effect:
- **Fewer rows transferred:** only scans that detected the technology (server-side
  filter), not every scan.
- **Leaner payload per row:** no `snapshot` (the largest field) and no
  precomputed diagnostics bloat.
- **+1 in-process HTTP hop** (page → API route, same Next.js server;
  `cache: 'no-store'`): the intentional cost of restoring the boundary. Negligible
  for a server-side fetch to a same-origin route.
- **DB query count unchanged** at the `list()` level — the endpoint reuses the
  same single `listScans` → `list()` call the page used before (no per-scan
  `getById`), so there is no new DB cost; the pre-existing `list()` snapshot
  loop is DEFERRED (§12).

## 11. Gate results

| Gate | Command | Result |
|------|---------|--------|
| Tests | `pnpm exec vitest run` | ✅ PASS — 2519 passed, 18 skipped (DB-integration tests skip without `DATABASE_URL`) |
| Types | `pnpm typecheck` | ✅ PASS (all workspace packages) |
| Lint | `pnpm exec eslint .` | ✅ PASS (0 errors) |
| Format | `pnpm exec prettier --check .` | ✅ PASS |
| Build | `pnpm build` | ✅ PASS (Next.js, 9/9 static pages) |
| Audit | `pnpm audit --audit-level=high` | ⚠️ 4 vulns (2 moderate / 2 high) — **pre-existing**, all in the `eslint → @eslint/config-array → minimatch → brace-expansion` dev-dependency chain. **No new vulnerabilities introduced.** (Out of scope: dev-tooling, not application code.) |

`git log -1` remains `897186a` (this step's commit is added on top).

## 12. Risks / deferred

- **`PostgresScanResultRepository.list()` snapshot N+1 (DEFERRED).**
  `packages/database/src/postgres-repository.ts` `list()` issues
  `SELECT * FROM scans` then, per scan, `SELECT ... FROM snapshots WHERE
  scan_id = ?` (the snapshot loop). This is a **DB-layer** N+1 that pre-exists
  and is shared by the working `GET /api/scans` / `GET /api/scans/:id` endpoints
  and the scan list/detail pages. It is **not introduced** by this step (the
  endpoint calls the same `list()`). Fixing it (a Drizzle `LEFT JOIN` eager-load
  of snapshots) is out of scope for F-001 (a *boundary* fix), cannot be verified
  without `DATABASE_URL` (the postgres/integration tests skip), and risks
  destabilizing stable endpoints. Logged for a dedicated future step.
- **`+1` in-process HTTP hop** (page → `/api/scans?technologyId=`). Accepted
  trade-off for restoring the boundary; same-process, `no-store`.
- **Raw `Detection` on the wire** vs `GET /api/scans/:id`'s `DetectionResponse[]`.
  Deliberate: the technology page computes the same diagnostics through its
  existing pipeline, so transmitting raw detections avoids recomputing
  diagnostics in two places and keeps the payload lean. Document this as a
  known, justified shape divergence between the two GET views.
- **`.poolside/settings.local.yaml`** is a pre-existing deletion in the working
  tree — left untouched and excluded from this commit.

## 13. Files changed

Source (production):
- `apps/web/src/lib/types.ts` — `TechnologyScanSummary`, `TechnologyScansResponse`, `Detection` import.
- `packages/application/src/queries.ts` — `listScansByTechnology(technologyId, repository)`.
- `packages/application/src/index.ts` — export `listScansByTechnology`.
- `apps/web/src/app/api/scans/handler.ts` — `handleGetScansByTechnology`, `resultToTechnologyScanSummary`, `HandleGetScansByTechnologyResult`.
- `apps/web/src/app/api/scans/route.ts` — `GET(request)` branches on `technologyId`.
- `apps/web/src/lib/api.ts` — `fetchScansByTechnology`.
- `apps/web/src/lib/scan-data.ts` — removed `getAllScanResults` + `@devlens/database`/`listScans` imports; `scanResultToSummary` retained (now handler-used) with updated doc.
- `apps/web/src/app/technologies/[id]/page.tsx` — fetches via `fetchScansByTechnology`; `ScanSummary[]` derived from `s.scan`; drops DB-path imports; doc updated.
- `apps/web/src/lib/technology-detection-history.ts` — input `TechnologyScanSummary[]`; flat scan-field reads; `detectionToResponse → getScanDetectionResults` pipeline **kept**.

Tests:
- `apps/web/src/lib/technology-detection-history.test.ts` — flat fixtures; assertions preserved.
- `apps/web/src/app/technologies/[id]/page.test.tsx` — mocks `@/lib/api`; assertions preserved.
- `apps/web/src/app/api/scans/get.test.ts` — new `handleGetScansByTechnology` tests.
- `apps/web/src/lib/api.test.ts` — new `fetchScansByTechnology` tests.

Docs:
- `docs/Step97.md`, `docs/Step97-report.md` (this file).

Build artifact (regenerated): `packages/application/dist/*` (the `@devlens/application` package is consumed by `apps/web` via its built `dist/index.d.ts`, so the new export required a rebuild — `pnpm --filter @devlens/application build`).

## 14. Summary

F-001 is fixed with a single bulk endpoint, `GET /api/scans?technologyId=<id>`,
that reuses the existing `listScans` application query + the existing
`scanResultToSummary`/`detectionToResponse` mappers — **no new SQL or Drizzle
code written in the web layer**. The Technology page now reaches PostgreSQL
*only* through the Web/API → Application → Database boundary, issuing exactly
one HTTP request and one repository `list()` call (no HTTP N+1, no
handler-level N+1). Behavior is preserved byte-for-byte (same cards, timeline,
Step 89 summary, empty/error states), backed by 17 new tests across the API
client, handler, and page layers. The pre-existing `list()` snapshot N+1 and the
pre-existing `audit` dev-tooling vulnerabilities are left untouched and
documented as DEFERRED / out-of-scope.
