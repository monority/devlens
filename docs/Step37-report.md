# Step 37: Scan Report Overview Header

## Goal
Add a compact at-a-glance overview header to completed scan reports. The
overview shows target, status, date, and key metrics (technology count,
evidence count, highest confidence) at the top of `/scans/{id}`.

## Architecture
Follows the same pure-presentation pattern as previous steps:

```
lib/scan-overview.ts          ← Pure module: getScanOverview() — derives metrics from ScanDetailResponse
components/ScanOverview.tsx   ← Pure presentation component (no hooks, no client state)
components/ScanViews.tsx      ← ScanDetailView (modified): renders ScanOverview for completed scans
```

### Overview model
`getScanOverview(result)` derives a `ScanOverview` object from the existing
`ScanDetailResponse`:

| Field               | Derivation                                           |
|---------------------|------------------------------------------------------|
| `target`            | `scan.target` (preserved exactly)                    |
| `hostname`          | `scan.hostname` (preserved exactly)                  |
| `status`            | `scan.status` (preserved exactly)                    |
| `id`                | `scan.id` (preserved exactly)                        |
| `createdAt`         | `scan.createdAt` (ISO 8601, preserved exactly)       |
| `completedAt`       | `scan.completedAt` (null for non-completed)          |
| `technologyCount`   | Unique technology IDs (deduplicated via Set)          |
| `evidenceCount`     | Total evidence entries across all detections          |
| `highestConfidence` | Max `detection.confidence` (or null for zero detections)|

### Purity
- Synchronous, deterministic, immutable
- No React, HTTP, DB, or browser dependencies
- Does not mutate the input `ScanDetailResponse`
- No random IDs or generated timestamps

### UI
`ScanOverview` is a pure presentation component that:
- Shows scan ID as `<h1>Scan #scan_001</h1>`
- Shows status as text + color badge (reuses existing CSS classes)
- Shows target URL and hostname
- Shows formatted date (deterministic UTC via `formatDate()`)
- Shows metrics row: Technologies, Evidence, Highest confidence
- For zero detections: highest confidence shows "—"

### Integration into ScanDetailView
For **completed scans**: `ScanOverview` replaces `ScanSummarySection`
(consolidated — no duplication of ScanSummary metadata).
For **pending/running/failed scans**: `ScanSummarySection` is preserved as-is.

### Interaction with Step 36 (detection filtering)
The overview is rendered **before** detection filters and results, so it:
- Remains visible when filters are active (`?q=react`)
- Shows **scan-level** metrics (not filtered subset)
- Is rendered outside the `DetectionFilterView` client boundary

```
ScanDetailView
  ├── ScanOverview (pure, completed scans only)
  ├── ScanInsights (pure, completed scans only)
  ├── Snapshot / ScanningState
  └── Detections section
      ├── DetectionFilterView (client, completed + initialQuery)
      └── DetectionList (fallback)
```

### Date formatting
Uses a deterministic `formatDate()` helper that formats via `getUTC*` methods:
`"Jun 1, 2025 at 12:00 UTC"`. The raw ISO string is preserved in the `<time
dateTime="...">` attribute for machine-readability. No existing date formatter
was present in the codebase.

### Lifecycle behavior
- **Completed**: Shows full overview with metrics
- **Failed**: Preserves existing ScanSummary (no misleading metrics)
- **Pending/Running**: Preserves existing ScanningState (no fake metrics)

## Files Created
| File | Tests | Description |
|------|-------|-------------|
| `lib/scan-overview.ts` | — | Pure: `getScanOverview()`, `ScanOverview` interface |
| `lib/scan-overview.test.ts` | 14 | Pure unit tests (metrics, uniqueness, immutability, determinism) |
| `components/ScanOverview.tsx` | — | Pure presentation component |
| `components/ScanOverview.test.tsx` | 14 | renderToString tests (target, status, metrics, semantics, zero state) |

## Files Modified
| File | Change |
|------|--------|
| `components/ScanViews.tsx` | Import `ScanOverview` + `getScanOverview`; render `ScanOverview` for completed scans instead of `ScanSummarySection` |
| `components/ScanViews.test.tsx` | +5 Step 37 integration tests (overview renders, non-completed scans, zero detections, filter stability, dual rendering) |
| `components/ScanCard.module.css` | +12 CSS classes for overview layout (`.scanOverview`, `.overviewHeader`, `.overviewTarget`, `.overviewHostname`, `.overviewMeta`, `.overviewMetrics`, `.overviewMetric`, etc.) |

## Key Design Decisions

### Consolidated header (not duplicate)
Step 37 replaces `ScanSummarySection` with `ScanOverview` for completed scans,
rather than rendering both. This avoids the "cards inside cards" anti-pattern
called out in the spec. For non-completed scans, `ScanSummarySection` is
preserved because it provides timeline/error details not in the overview.

### Unique technology count vs insights count
`getScanOverview().technologyCount` counts **unique** technology IDs
(deduplicated via `Set`). This differs from `getScanInsights().technologyCount`
which uses `detections.length` (all detection records). Both serve different
purposes — the overview gives an at-a-glance unique count, insights gives the
raw detection count.

### Deterministic date formatting
`formatDate()` uses `Date.getUTC*` methods to ensure the same ISO string
always produces the same formatted output regardless of the host timezone.
Tests can predict the output: `"Jun 1, 2025 at 12:00 UTC"`.

### Pure component (no client boundary)
`ScanOverview` is a pure function component — no `'use client'`, no hooks,
no state. It is rendered server-side by `ScanDetailView`. This means:
- No `next/navigation` mock needed in tests
- No additional client bundle size
- No hydration boundary

## Scope Constraints (all respected)
- ✅ No API contract changes
- ✅ No database schema changes
- ✅ No detector changes
- ✅ No scoring changes
- ✅ No crawler changes
- ✅ No evidence semantics changes
- ✅ No scan lifecycle changes
- ✅ No filtering semantics changes (Step 36 unchanged)
- ✅ No new dependencies
- ✅ No new API endpoints
- ✅ No client state
- ✅ No charts/gauges/animations

## Tests
- Pure: 14 tests in `scan-overview.test.ts`
- Component: 14 tests in `ScanOverview.test.tsx`
- Integration: 5 tests in `ScanViews.test.tsx`
- Total new: 33 tests
- No existing tests weakened or removed

## Validation

| # | Check | Command | Status |
|---|-------|---------|--------|
| 1 | Typecheck | `tsc --noEmit` | ✅ 0 errors |
| 2 | Tests | `vitest run` | ✅ All pass (1427 total) |
| 3 | Lint | `eslint .` | ✅ 0 errors |
| 4 | Prettier | `prettier --check .` | ✅ All formatted |
| 5 | Build | `next build` | ✅ Compiled successfully |
| 6 | Circular deps | `npx madge --circular --extensions ts packages apps` | ✅ No cycles |
| 7 | tsconfig | `grep jsx` | ✅ `"jsx": "preserve"` intact |

## Git
Commit: `Step 37: Scan Report Overview Header`
Push: Blocked (no GitHub credentials available)
