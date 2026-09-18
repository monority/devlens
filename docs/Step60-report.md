# Step 60: Scan Result Summary

## Status: COMPLETE

## Objective

Verify that the Scan Detail page presents a compact factual summary of scan
results — target, status, scan date/time, technology count, evidence count, and
highest confidence — derived deterministically from the existing
`ScanDetailResponse`, without inventing any aggregate "overall score".

## Key Finding: Summary Already Implemented

During inspection, it was determined that the compact factual summary required
by Step 60 was **already implemented** in prior steps:

- **`getScanOverview()`** — pure function in `apps/web/src/lib/scan-overview.ts`
  (99 lines). Computes:
  - `target` — preserved exactly from `scan.target`
  - `hostname` — preserved exactly from `scan.hostname`
  - `status` — preserved exactly from `scan.status`
  - `id` — preserved exactly from `scan.id`
  - `createdAt` — preserved exactly from `scan.createdAt`
  - `completedAt` — null for non-completed scans, otherwise from `scan.completedAt`
  - `technologyCount` — unique technology IDs via `Set` (deduplicated)
  - `evidenceCount` — total evidence entries across all detections (not deduplicated)
  - `highestConfidence` — max of existing per-detection confidence values (or
    `null` when zero detections)

- **`ScanOverview`** component — pure presentation component
  (`apps/web/src/components/ScanOverview.tsx`, 157 lines). Renders:
  - Scan ID header: `Scan #{id}`
  - Status badge (text + color): `Completed` / `Failed` / `Running` / `Pending`
  - Target URL (human-readable)
  - Hostname
  - `<time>` elements for `createdAt` and `completedAt` (machine-readable via
    `dateTime` attribute, human-readable via `formatDate()` using UTC)
  - Metrics row: `Technologies: N`, `Evidence: N`, `Highest confidence: N%` (or
    `—` when zero detections)

- **`ScanSummary`** component — for non-completed scans (pending/running/failed)
  (`apps/web/src/components/ScanSummary.tsx`, 115 lines). Renders target,
  hostname, status badge, timeline (`created`/`started`/`completed`/`failed`),
  and error code/message.

- **Wiring** — `ScanDetailView` (`apps/web/src/components/ScanViews.tsx`,
  line 302-306) renders `<ScanOverview>` for completed scans and
  `<ScanSummarySection>` for non-completed scans. `ScanOverview` is also used in
  the `ScanComparison` header (`apps/web/src/components/ScanComparison.tsx`).

- **CSS** — all classes already present in `ScanCard.module.css` (`.scanOverview`,
  `.overviewHeader`, `.overviewTarget`, `.overviewHostname`, `.overviewMeta`,
  `.overviewMetrics`, `.overviewMetricValue`, `.overviewMetricLabel`,
  `.statusBadge`, `.statusCompleted`, `.statusFailed`, `.statusRunning`,
  `.statusPending`).

## Step 0: Inspection Findings

### 1. What scan-level metadata is available in the response?
- `scan.id`, `scan.target`, `scan.hostname`, `scan.status`, `scan.createdAt`,
  `scan.startedAt`, `scan.completedAt`, `scan.failedAt`, `scan.error`
- `snapshot` — null for failed scans, populated for completed scans
- `detections` — array of `DetectionResponse` with `{ technology, confidence,
  evidence }`

### 2. What counts can be derived from the response?
- `detections.length` — raw detection count (shown in page subtitle)
- `getScanOverview()`: `technologyCount` (unique IDs), `evidenceCount` (total
  evidence entries), `highestConfidence` (max, or null)

### 3. Is there already a summary component?
- Yes: `ScanOverview` (completed scans, in `ScanDetailView`) + `ScanSummary`
  (non-completed scans)

### 4. Is there an existing score/confidence aggregation?
- `getScanOverview()` computes `highestConfidence` = `Math.max(...)` of existing
  per-detection confidence values. This is a **passthrough max**, not a computed
  aggregate score — it does not average, weight, or invent a new overall score.

### 5. Is scan status already clearly exposed?
- Yes: status badges with both color AND text labels on `ScanOverview` and
  `ScanSummary`. `ScanLifecycle` renders lifecycle text ("Queued", "Scanning
  in progress").

### 6. Can the desired summary be derived purely from ScanDetailResponse?
- Yes: `getScanOverview()` is a pure function of `ScanDetailResponse` with no
  API/database/network calls. No new data model or schema changes needed.

## What Was NOT Changed (Constraints Respected)

- `@devlens/core` — untouched
- Detector pipeline, crawler, scoring, evidence generation — untouched
- Comparison engine, persistence schema, scan execution — untouched
- `POST /api/scans` contract, `validateUrl()` — untouched
- No "overall score" introduced — `highestConfidence` is a max of existing
  values, explicitly labeled "Highest confidence" (not "Overall score")
- `jsx: "preserve"` — intact in `apps/web/tsconfig.json`

## Tests Added

### `apps/web/src/lib/scan-overview.test.ts` (+3 tests)
1. **`does not invent an overall/average score`** — verifies `highestConfidence`
   is `92` (max of {80, 45, 92}), not `72` (which would be the average).
2. **`highestConfidence is null for zero detections`** — verifies null (not 0 or
   NaN) for empty scan.
3. **`handles failed scans correctly`** — verifies target/status/counters preserved
   for failed scans with error info.

### `apps/web/src/components/ScanOverview.test.tsx` (+1 test)
1. **`does not invent an "overall score" label`** — verifies the component does
   NOT render "overall score", "Overall", or "Average", and DOES render
   "Highest confidence".

## Pre-existing Tests Covering Step 60 Requirements

All 14 spec testing requirements are covered by existing + new tests:

| # | Requirement | Test Location | Status |
|---|-------------|---------------|--------|
| 1 | Completed scan with multiple detections | `ScanOverview.test.tsx:131` | ✅ Existing |
| 2 | Zero detections | `ScanOverview.test.tsx:123` | ✅ Existing |
| 3 | Detection with multiple evidence items | `scan-overview.test.ts:117` | ✅ Existing |
| 4 | Detection with no evidence | `DetectionItem.test.tsx` | ✅ Existing |
| 5 | Failed scan | `ScanSummary.test.tsx:81` + new tests | ✅ Existing + New |
| 6 | Deterministic derived counts | `scan-overview.test.ts:235` | ✅ Existing |
| 7 | Summary renders correct target | `ScanOverview.test.tsx:56` | ✅ Existing |
| 8 | Summary renders correct status | `ScanOverview.test.tsx:72` | ✅ Existing |
| 9 | Summary does NOT invent overall score | new tests (both files) | ✅ NEW |
| 10 | Existing detection/evidence UI intact | All existing tests pass | ✅ Verified |

## Accessibility

- `ScanOverview` is purely presentational (no interactive elements) — no
  `:focus-visible` needed
- Status badges use both color AND text (screen-reader accessible)
- Metrics use semantic `<dl>`/`<dt>`/`<dd>` definition lists
- Timestamps use `<time>` elements with `dateTime` attributes (machine-readable)
- `:focus-visible` already added on `.evidenceSummary` in Step 59

## Validation Results

| Check | Result |
|-------|--------|
| `npx vitest run` | ✅ 1710 passed, 18 skipped (97 test files, 2 skipped integration/db) |
| `npx tsc --noEmit` | ✅ Clean |
| `npx eslint apps/web` | ✅ Clean |
| `npx prettier --check apps/web` | ✅ All matched files use Prettier code style |
| `npx next build` | ✅ Compiled successfully |
| `npx madge --circular --extensions ts,tsx src` | ✅ No circular dependency found |
| `jsx: "preserve"` | ✅ Intact |
