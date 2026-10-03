# Step 97 — Technology Data Access Boundary

## Context

Step 96 (`docs/Step96-report.md`) completed an architecture audit of the monorepo
and identified a single concrete architectural violation:

> **F-001 — Direct database access from the web layer.**
> The technology detail page (`apps/web/src/app/technologies/[id]/page.tsx`)
> reaches into PostgreSQL via `getAllScanResults()` →
> `new PostgresScanResultRepository(createDatabaseClient())`, bypassing the
> Web/API → Application → Database boundary that every other page respects.

Step 96 was audit-only (no code change). Its proposed Step 97 remedy — a bulk
`GET /api/scans/with-detections` endpoint returning *all* scans — was left
deliberately vague because Step 96's constraint is "do not modify API contracts."
The Step 97 *implementation* tightens that proposal into a **technology-scoped**
bulk endpoint: `GET /api/scans?technologyId=<id>` returns only the scans that
detected a given technology, each reduced to the minimal projection the page
actually renders.

## Goal

Restore the boundary so the Technology page no longer knows about PostgreSQL,
Drizzle, the database client, or SQL — while preserving its exact rendered
behavior and avoiding any form of N+1 (neither HTTP per-scan fetch nor
per-scan DB query).

```
BEFORE                         AFTER

Technology page                Technology page
      ↓                              ↓
PostgreSQL                    Web/API (GET /api/scans?technologyId=)
                                  ↓
                          Application (listScansByTechnology)
                                  ↓
                          Database repository (list())
                                  ↓
                          PostgreSQL
```

## Before — current data flow

```
page.tsx (server)
 → fetchDetectedScans(id)                       [apps/web/.../technologies/[id]/page.tsx:87]
 → getAllScanResults()                          [apps/web/src/lib/scan-data.ts:38]
 → new PostgresScanResultRepository(createDatabaseClient())   [scan-data.ts:39-40]
 → listScans(repository)  →  listScans (application)  →  repository.list()   [postgres-repository.ts:354]
 → ScanResult[]  (ALL scans, each with full snapshot — even though the page only
   needs a scan summary + the technology's detections)
 → in-memory filter: r.detections.some(d => d.technology.id === techId)
 → scanResultToSummary(scans)        → ScanSummary[]   ("Detected in scans" cards)
 → technologyDetectionHistory(scans, id)  → TechnologyDetectionHistoryEntry[]  (timeline)
 → technologyDetectionHistorySummary(...) (Step 89 compact summary)
```

Two problems:
1. **Boundary violation** — `@devlens/database` (`createDatabaseClient`,
   `PostgresScanResultRepository`) is imported directly in the web layer.
2. **Over-fetch** — `listScans()` loads every scan's full `snapshot` (the entire
   crawled HTML) and every scan's full detections, even though the technology
   page only needs the matching scans' *scan summary* + *detections*.

## Design — minimal bulk API

A single endpoint on the **existing** collection route (no new route segment):

|                 | Value |
|-----------------|-------|
| Route           | `GET /api/scans?technologyId=<id>` (query param on the existing collection route) |
| Method          | `GET` |
| Parameters      | `technologyId` (string, query) |
| Validation      | Empty/whitespace-only `technologyId` → `200 { scans: [] }` (never 404) |
| Response 200    | `{ scans: Array<{ scan: ScanResponse; detections: Detection[] }> }` (lean) |
| Unknown technology | Handled **upstream** by the page (`getTechnologyById` → `notFound()` 404); the page never calls the endpoint with an unknown id |
| No scan detected | `200 { scans: [] }` (valid empty view) |
| Repository error | `500 { error: { code: 'INTERNAL_ERROR', message } }` (no DB internals leaked) |
| Ordering        | `createdAt DESC, scanId ASC` (inherited from `listScans` / the repository) |
| Pagination      | Not needed — a technology's detection history is bounded by the number of
                 | scans that detected it; no limit introduced here |
| Limit           | None |

Why a query param on the existing route (rather than a dedicated sub-route)?
Minimality — the task says "the appropriate endpoint." The collection route
already serves scan listings; a `technologyId` query param selects a filtered,
lean projection. No POST collision: POST reads the request *body*, GET reads the
*query string*. The shape branches cleanly inside the route handler.

## Architecture — layers reused (no new SQL/Drizzle in the web layer)

```
route.ts  (GET request → read technologyId query param)
  → handler.ts: handleGetScansByTechnology(technologyId, { repository })
      → application/queries.ts: listScansByTechnology(techId, repo)
          → repository.list()                      (ONE call)
      → resultToTechnologyScanSummary(result)      (pure mapping: scanResultToSummary + raw detections)
  → NextResponse.json({ scans: [...] })
      → page.tsx: fetchScansByTechnology(techId)   (lib/api.ts)
      → technologyDetectionHistory(scans, id)      (existing pipeline, untouched)
```

Reused building blocks (nothing new written in the web layer's data-access
plane):
- `listScans` (existing application query) — wrapped as the thin
  `listScansByTechnology` filter (one line).
- `scanResultToSummary` (already in `scan-data.ts`, already mirrors
  `resultToResponse`'s scan mapping) — now shared by the handler.
- `detectionToResponse` — **stays in `technology-detection-history`** (the page's
  presentation pipeline). The API supplies raw `Detection[]`; the page reuses its
  existing projection so provenance/integrity/signal-quality are computed once,
  identically to the scan-detail view. No detection *logic* moved.
- `getScanDetectionResults`, `computeDetectionIntegrity`,
  `computeDetectionProvenance`, `computeSignalQuality` — untouched.

## N+1 — why there is none

The fix eliminates **both** N+1 shapes the task warns about:

- **HTTP N+1** (page → fetch per scan): the page issues exactly **one**
  `fetchScansByTechnology(techId)` request. It never loops over scans to fetch
  detail.  ✓
- **Handler-level N** (`list()` once vs. N `getById` calls): the handler calls
  `listScansByTechnology` → `listScans` → `repository.list()` — a **single**
  repository read. It does not call `getById` in a loop.  ✓

Measured at the handler/repository-call boundary:

| Layer | Calls |
|-------|-------|
| HTTP (page → endpoint) | 1 |
| Application (`listScansByTechnology`) | 1 (`listScans`) |
| Repository (`list()`) | 1 |

**Deferred / pre-existing (out of scope for F-001):**
`PostgresScanResultRepository.list()` itself performs `SELECT * FROM scans`
followed by a per-scan `SELECT ... FROM snapshots WHERE scan_id = ?` loop
(`packages/database/src/postgres-repository.ts:354-369`). This N+1 exists
**independently of F-001** — it is shared by the working `GET /api/scans` and
`GET /api/scans/:id` endpoints, the integration tests that would cover it are
skipped (no `DATABASE_URL`), and fixing it (a Drizzle `LEFT JOIN`) is a DB-layer
change that risks stable endpoints. It is therefore **DEFERRED** to a dedicated
step, and is **not introduced** by this change (the before-flow already called
the same `list()`).

## Behavior equivalence

The migration preserves the page's exact behavior:

- "Detected in scans" cards — `TechnologyDetectedInScans` still receives
  `ScanSummary[] | null` (now derived as `data.scans.map((s) => s.scan)`).
- Detection timeline — `TechnologyDetectionTimeline` still receives
  `TechnologyDetectionHistoryEntry[]` from the **unchanged** pipeline
  (`detectionToResponse → getScanDetectionResults → toHistoryEntry`).
- Step 89 compact summary — unchanged (`technologyDetectionHistorySummary`).
- Empty state — `'No scans have detected this technology yet.'` (empty payload).
- Error state — `'Unable to load scan data for this technology.'`
  (endpoint 500 or fetch failure → `fetchDetectedScans` returns `null`).

`getScanDetectionResults` **recomputes** `explanation` (so the page-supplied
`DetectionResponse.explanation` is overwritten with an identical result) and
**forwards** `provenance`/`integrity` — which is why the API sends raw
`Detection[]` and the page re-runs `detectionToResponse` (the documented home
of the Step 73 API mapping for this projection). Net result: byte-for-byte
identical timeline entries.

## Tests

| New test site | Coverage |
|---------------|----------|
| `apps/web/src/app/api/scans/get.test.ts` | `handleGetScansByTechnology`: empty repo, blank id, no match, match + filter, ordering, failed-scan exclusion, response shape (only `{scan, detections}`, no snapshot/coverage/quality), 2× 500 sanitization. |
| `apps/web/src/lib/api.test.ts` | `fetchScansByTechnology`: 200 returns scans, empty list, URL-encoding of `technologyId`, 500 → `ApiError`. |
| `apps/web/src/app/technologies/[id]/page.test.tsx` | Regression (mock `@/lib/api`): header/cards/timeline rendered, empty state, error state — all assertions preserved. |
| `apps/web/src/lib/technology-detection-history.test.ts` | Adapted fixtures to the flat projection; `makeDetection` unchanged; all 19 existing assertions preserved (pipeline still runs end-to-end). |

The application query `listScansByTechnology` is covered through the handler
tests (in-memory repository, no `DATABASE_URL` needed).

## Files changed

- `apps/web/src/lib/types.ts` — add `TechnologyScanSummary`, `TechnologyScansResponse`, `Detection` import.
- `packages/application/src/queries.ts` — add `listScansByTechnology`.
- `packages/application/src/index.ts` — export it.
- `apps/web/src/app/api/scans/handler.ts` — `handleGetScansByTechnology` + `resultToTechnologyScanSummary` + result type.
- `apps/web/src/app/api/scans/route.ts` — branch `GET` on `technologyId`.
- `apps/web/src/lib/api.ts` — `fetchScansByTechnology`.
- `apps/web/src/lib/scan-data.ts` — remove `getAllScanResults` + `@devlens/database` imports; keep the pure `scanResultToSummary` mapper (now also used by the handler).
- `apps/web/src/app/technologies/[id]/page.tsx` — fetch via `fetchScansByTechnology`; drop DB-path imports.
- `apps/web/src/lib/technology-detection-history.ts` — input `TechnologyScanSummary[]` (flat scan fields); `detectionToResponse` pipeline kept.
- `apps/web/src/lib/technology-detection-history.test.ts` — flat fixtures; assertions preserved.
- `apps/web/src/app/technologies/[id]/page.test.tsx` — mock `@/lib/api`; assertions preserved.
- `apps/web/src/app/api/scans/get.test.ts` — new handler tests.
- `apps/web/src/lib/api.test.ts` — new client tests.

## Verification — gates

| Gate | Result |
|------|--------|
| `pnpm exec vitest run` | PASS (2519 passed, 18 skipped — DB-integration tests skip without `DATABASE_URL`) |
| `pnpm typecheck` | PASS |
| `pnpm exec eslint .` | PASS (0 errors) |
| `pnpm exec prettier --check .` | PASS |
| `pnpm build` | PASS |
| `pnpm audit --audit-level=high` | 4 vulns (2 moderate / 2 high) — **pre-existing**, all in the `eslint` → `minimatch` → `brace-expansion` dev-dep chain. **No new vulnerabilities.** |

Phase 7 grep — `apps/web/src/app/technologies` contains **zero** references to
`@devlens/database`, `drizzle`, `postgres`, or `createDatabaseClient` (only doc
comments describing the boundary).

## What was NOT touched (by design)

- Detection logic/functions (`detectionToResponse`, `getScanDetectionResults`,
  `computeDetectionProvenance` / `computeDetectionIntegrity` /
  `computeSignalQuality`, detectors, scoring). Only one call-site relocated to
  the API layer (its documented home: "Step 73 API mapping"); the page reuses it.
- Provenance/integrity/comparison semantics; crawler; worker; DB schema;
  unrelated UI/navigation; Playwright; esbuild; stubs; `.poolside/settings.local.yaml`.
- `PostgresScanResultRepository.list()` N+1 — DEFERRED (see above).
