# Step 36: Scan Report Filtering & Deep Linking

## Goal
Add client-side detection filtering and URL deep linking to completed scan reports.
Allow users to filter detections by technology search (`q`) and category (`category`) on
`/scans/{id}`, with URL state that is bookmarkable, refresh-safe, and shareable.

## Architecture
Follows the exact same pattern as Step 31 (Technology Catalog filtering):

```
app/scans/[id]/page.tsx          ← Server component, reads searchParams, passes to ScanLifecycle
components/ScanLifecycle.tsx     ← 'use client', passes initialQuery/initialCategory to ScanDetailView
components/ScanViews.tsx         ← ScanDetailView (pure), conditionally renders DetectionFilterView
components/DetectionFilterView.tsx ← 'use client' (new), URL sync via useRouter/useSearchParams
components/DetectionFilters.tsx  ← Pure presentation (new), reuses ScanCard.module.css
lib/detection-filter.ts          ← Pure filtering (new): filterDetections, buildDetectionUrl, etc.
```

### Client boundary (minimal)
Only `DetectionFilterView.tsx` is a new `'use client'` component. It is rendered
only for **completed scans** when `initialQuery` is provided. All other scan states
(pending, running, failed) continue to use the existing `DetectionList`.

### Filtering pipeline (pure)
```
Detections[] → filterDetections({ query, category }) → ordered subset (no re-sort)
```

- **Search**: case-insensitive substring on `technology.name` + `technology.id` only
  (not evidence text, not raw JSON)
- **Category**: exact match against `detection.technology.category`
- Whitespace trimmed from query; empty query/category = no filter
- Invalid categories normalized to "All" via `isValidDetectionCategory()` (reuses catalog)

### URL state
- `router.replace()` (not `push`) — no history entries per keystroke
- Empty params removed from URL (`?q=` omitted when empty)
- Format: `/scans/{id}?q=<search>&category=<category>`
- Refresh-safe: server reads `searchParams` and passes to client as initial props

## Files Created
| File | Tests | Description |
|------|-------|-------------|
| `lib/detection-filter.ts` | 32 | Pure: `filterDetections`, `getDetectionCategories`, `isValidDetectionCategory`, `buildDetectionUrl` |
| `lib/detection-filter.test.ts` | 32 | Pure unit tests (filtering, URL, category validation) |
| `components/DetectionFilters.tsx` | — | Pure presentation, reuses `ScanCard.module.css` |
| `components/DetectionFilters.test.tsx` | 11 | renderToString tests (controls, labels, count, empty, reset) |
| `components/DetectionFilterView.tsx` | — | `'use client'` with URL sync |
| `components/DetectionFilterView.test.tsx` | 11 | renderToString tests (URL building, initialization, filtering) |

## Files Modified
| File | Change |
|------|--------|
| `components/ScanViews.tsx` | `ScanDetailViewProps` accepts `initialQuery`/`initialCategory`; renders `DetectionFilterView` for completed scans |
| `components/ScanLifecycle.tsx` | Accepts and forwards `initialQuery`/`initialCategory` props |
| `app/scans/[id]/page.tsx` | Reads `searchParams` (q, category), passes to `ScanLifecycle` |
| `components/ScanViews.test.tsx` | Added `next/navigation` mock + 10 Step 36 integration tests |
| `components/ScanLifecycle.test.tsx` | Added `next/navigation` mock for completed-scan rendering |

## Key Design Decisions

### `initialQuery !== undefined` as client boundary trigger
`ScanDetailView` checks `initialQuery !== undefined` to decide whether to render
`DetectionFilterView` vs `DetectionList`. This keeps existing tests (which don't pass
`initialQuery`) unaffected, while the real app always passes `initialQuery` (even as
empty string) from the server component.

### Category validation reused from Step 31
`isValidDetectionCategory()` is defined in `technology-filter.ts` (Step 31) and reused
via `getDetectionCategories()` from `technology-catalog.ts`. No hardcoded category lists.

### Pure `filterDetections()`
- Uses `Array.filter()` — no mutation, no reordering
- Deterministic for the same input
- No React, HTTP, or DB dependencies

## Validation (5 checks — ALL PASSING)
| # | Check | Command | Status |
|---|-------|---------|--------|
| 1 | Typecheck | `tsc --noEmit` | ✅ 0 errors |
| 2 | Tests | `vitest run` | ✅ 1394 passed, 18 skipped (76 files) |
| 3 | ESLint | `eslint . && prettier --check .` | ✅ 0 errors |
| 4 | Prettier | `prettier --check .` | ✅ All files formatted |
| 5 | Build | `next build` | ✅ Compiled successfully |
| 6 | tsconfig | `grep jsx` | ✅ `jsx: "preserve"` intact |

## Test Count Summary
- `detection-filter.test.ts`: +32 pure tests (filtering, URL, category validation)
- `DetectionFilters.test.tsx`: +11 presentation tests (controls, labels, count, empty, reset)
- `DetectionFilterView.test.tsx`: +11 URL state tests (building, initialization, filtering)
- `ScanViews.test.tsx`: +10 integration tests (filter rendering, non-completed scans, order, links)

## No Backend Changes
- No API endpoint changes
- No domain/entity changes
- No detector changes
- No scoring changes
- No evidence/crawler/persistence changes
- No new dependencies added

## Git Push Status
Push to GitHub remains blocked — no credentials available. Commit created locally:
```
git add -A
git commit -m "Step 36: Scan Report Filtering & Deep Linking"
```
