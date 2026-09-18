# Step 53 Report — Technology Detail: Real Scan Usage

## Summary

The `/technologies/{id}` page now shows which existing scans detected the
viewed technology, derived from real persisted scan/detection data. The section
appears below the existing technology identity/description, preserving all prior
behavior including the `notFound()` for unknown IDs.

## Architecture Decision: Data Source

**Chosen approach:** Reuse the existing server-side `listScans()` application-layer
query from `@devlens/application`, called directly from the technology detail page
(server component). No new API endpoint, no new database table, no new query.

**Why not the existing HTTP API:** `GET /api/scans` returns `ScanSummary[]` (scan
metadata only — no detections). To find which scans detected a technology via the
API, the page would need to fetch all scan summaries, then call `GET /api/scans/:id`
for each — an N+1 pattern of N+1 network round-trips that the spec explicitly
rejects ("Do not blindly fetch every scan detail one by one").

**Why `listScans()` is the better query:** It returns `ScanResult[]` — the full
domain result including `detections[]` — in a single database round-trip. The
API route handler (`handleGetScans`) already calls this same function; it merely
strips the detections when serializing to JSON. The technology detail page is a
server component and can invoke `listScans` directly, bypassing the HTTP layer.

**New helper:** `apps/web/src/lib/scan-data.ts` wraps repository construction
(`PostgresScanResultRepository` + `createDatabaseClient`, identical to the API
route pattern) and exposes:
- `getAllScanResults()` — calls `listScans(repository)`, returns `ScanResult[]`
- `scanResultToSummary(result)` — maps `ScanResult` → `ScanSummary` (reuses the
  same status-field extraction logic as `resultToResponse` in the API handler)

This is a thin server-side convenience wrapper, not a new data source or new
persistence abstraction. It reuses `@devlens/application.listScans` and
`@devlens/database`'s existing repository.

## Completed Scans Semantics

**Chosen behavior:** Only completed scans can appear in the "Detected in scans"
section. This follows the existing domain/API semantics:

1. The `InMemoryScanResultRepository` and `PostgresScanResultRepository` both
   store detections **only when a snapshot exists** — i.e., only on successful
   (completed) scans. Failed scans clear detections; pending/running scans never
   have them.

2. Therefore `result.detections` is `[]` for `failed`, `pending`, and `running`
   scans. Filtering on `detections.some(d => d.technology.id === techId)`
   inherently excludes non-completed scans — no extra status check needed.

3. This is consistent with the existing API behavior: `GET /api/scans/:id` only
   returns detections for completed scans; the scan detail page only shows
   "X detections" for terminal (completed) scans.

No new status policy was invented. The empty state wording reflects this:
"No scans have detected this technology yet."

## Matching Semantics

- Technology identity is matched on the **canonical technology ID**
  (`Detection.technology.id`, a `TechnologyId` from `@devlens/core`).
- No fuzzy matching, no display-name matching, no URL inference, no category
  inference, no fabricated detections.
- The technology ID comes from `getTechnologyById(id)` (catalog lookup) and is
  compared directly against the `id` field stored on each `Detection.technology`.
- Detector behavior is unchanged.

## Files Created

| File | Purpose |
|------|---------|
| `apps/web/src/lib/scan-data.ts` | Server-side data-access helper (`getAllScanResults` + `scanResultToSummary`) |
| `apps/web/src/components/TechnologyDetectedInScans.tsx` | Pure presentation component for the "Detected in scans" section |
| `apps/web/src/components/TechnologyDetectedInScans.test.tsx` | 12 tests for the presentation component |

## Files Modified

| File | Change |
|------|--------|
| `apps/web/src/app/technologies/[id]/page.tsx` | Added server-side data fetch + `TechnologyDetectedInScans` section |
| `apps/web/src/app/technologies/[id]/page.module.css` | Added `.detectedSection`, `.detectedHeading`, `.detectedError`, `.detectedEmpty` styles |

## Presentation Component

`TechnologyDetectedInScans` is a pure component receiving `scans: ScanSummary[] | null`:

- **`null`** → error state: "Unable to load scan data for this technology."
  (the page catches database/infrastructure errors and passes `null`)
- **`[]`** → empty state: "No scans have detected this technology yet."
- **`[...]`** → heading "Detected in N scans" + `ScanCard` for each matching scan

Each scan card reuses the existing `ScanCard` from `ScanViews.tsx`, showing
target, hostname, status badge, date/time, and a "View details →" link to
`/scans/{id}`.

## Unknown Technology Behavior (Preserved)

Unchanged: `/technologies/{id}` for an unknown catalog ID calls `notFound()`.
No scan data is queried for unknown technologies.

## Out of Scope (Deliberately Not Changed)

- No changes to `@devlens/core`, detectors, crawler, domain model
- No changes to the API (`GET /api/scans`, `GET /api/scans/:id`, `POST /api/scans`)
- No changes to comparison logic, scoring, or persistence format
- No new dependencies, no backend changes, no schema changes
- No redesign of the technology catalog
- No analytics infrastructure

## Validation

| Check | Result |
|-------|--------|
| Vitest | 1625 passed (+12 new), 18 skipped ✅ |
| `tsc --noEmit` | 0 errors ✅ |
| ESLint | PASS ✅ |
| Prettier | All files use Prettier code style ✅ |
| `next build` | PASS (9 routes) ✅ |
| madge circular | No circular dependency found (85 files) ✅ |
| `jsx: "preserve"` | Intact ✅ |
