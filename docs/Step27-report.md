# Step 27: Scan History Filtering

## Objective

Make the scan history usable when the number of scans grows by adding client-side search and status filtering to the `/scans` page, with URL state persistence and no backend changes.

## Architecture

The filtering is performed client-side on the existing `GET /api/scans` result. No new API endpoints, database queries, or repository methods are added.

### Pipeline

```
GET /api/scans (server fetch)
    ↓
page.tsx (server component)
    ↓
ScanHistory (client component, 'use client')
    ├── ScanFilters (pure presentation, filter form + count + empty state)
    └── ScanCard (existing, per-scan card)
    ↓
filterScans() (pure function)
```

### Pure filtering module (`lib/scan-filter.ts`)

A pure TypeScript module with no React, HTTP, or database dependencies.

- **`filterScans(scans, filters)`** — applies search (case-insensitive substring on `scan.target`) and status (exact match on `scan.status`) filters. Returns results in original order — no re-sorting. Deterministic.
- **`isValidStatus(status)`** — returns `true` if status is one of `['pending', 'running', 'completed', 'failed']`. Invalid URL `status` values fall back to "All".
- **`SCAN_STATUSES`** — readonly tuple of the four lifecycle statuses.
- **`statusLabel(status)`** — human-readable label for a status.

### Presentation component (`components/ScanFilters.tsx`)

Pure presentation component (no React state, no router access). Receives `search`, `status`, `resultCount`, `totalScans`, and change callbacks as props. Renders:

- Search input (`<input type="search" id="scan-search">`) with associated `<label>`
- Status select (`<select id="scan-status">`) with native `<option>` elements for All, Pending, Running, Completed, Failed
- Reset button (only shown when a filter is active)
- Result count text: "12 scans" or '3 scans matching "example.com"'
- Empty state: "No scans yet." (when `totalScans === 0`) with "New scan" link, or "No scans match the current filters." (when `totalScans > 0` but `resultCount === 0`) with reset button

### Client component (`components/ScanHistory.tsx`)

Client component (`'use client'`) that bridges the server-fetched scans with the pure `ScanFilters` UI. Manages filter state and syncs to the URL:

- Reads `q` and `status` from URL via `useSearchParams()` (handles refresh and back/forward)
- Validates `status` via `isValidStatus()` — invalid values fall back to "All"
- Uses `useState` for smooth typing (no lag from URL sync)
- Syncs state → URL via `useRouter().replace()` (replaces current history entry, no per-keystroke history entries)
- Calls `filterScans()` for client-side filtering — no network request per keystroke
- Renders `ScanFilters` + `ScanCard` list (reusing existing `ScanCard` from `ScanViews.tsx`)

### Server component (`app/scans/page.tsx`)

Modified to:

1. Accept `searchParams: Promise<{ q?: string; status?: string }>` (Next.js App Router)
2. Fetch all scans via `fetchScans()` (existing `GET /api/scans`)
3. Pass scans to `ScanHistory` client component (which reads URL params for filtering)

The server component still handles the initial data fetch and error state. The client component handles all interactive filtering.

## Key Design Decisions

1. **Client-side filtering**: All scans are fetched once server-side via the existing API. Filtering happens in the browser using the pure `filterScans()` function — no additional network requests when the user types.

2. **URL state**: Filters are persisted in the URL query string (`/scans?q=example.com&status=completed`). Page refresh preserves filters (server reads `searchParams` on initial render). Copied URLs preserve filters. Uses `next/navigation`'s built-in `useRouter` — no external router/state library.

3. **No re-sorting**: `filterScans()` uses `Array.filter()`, which preserves the original ordering returned by the API.

4. **Invalid status handling**: The `isValidStatus()` function validates URL `status` parameters. Invalid values are silently ignored (treated as "All"), preventing broken states from manipulated URLs.

5. **Minimal client boundary**: Only `ScanHistory.tsx` is a `'use client'` component. The `ScanFilters` component is pure (no hooks), making it testable with `renderToString` from `react-dom/server` — consistent with the existing test infrastructure (no jsdom).

6. **Reused components**: `ScanCard` is reused from `ScanViews.tsx`. No new card components are created.

7. **No debounce library**: `router.replace()` is client-side (no network request), so no debounce is needed. The URL updates synchronously as the user types.

## Files Created

- `apps/web/src/lib/scan-filter.ts` — Pure filtering module (`filterScans`, `isValidStatus`, `SCAN_STATUSES`, `statusLabel`)
- `apps/web/src/lib/scan-filter.test.ts` — 11 tests (9 filtering + 2 constants/labels)
- `apps/web/src/components/ScanFilters.tsx` — Pure presentation component (filter form + count + empty state)
- `apps/web/src/components/ScanFilters.test.tsx` — 6 UI tests (search field, status selector, count, empty state, reset, links)
- `apps/web/src/components/ScanHistory.tsx` — Client component ('use client') managing filter state

## Files Modified

- `apps/web/src/app/scans/page.tsx` — Added `searchParams` prop, replaced `ScansHistory` with `ScanHistory` client component
- `apps/web/src/components/ScanCard.module.css` — Added filter UI CSS classes (`.scanFilters`, `.filterControls`, `.filterGroup`, `.filterLabel`, `.searchInput`, `.statusSelect`, `.resetButton`, `.resultCount`, `.filterEmpty`, `.emptyLink`)

## Test Coverage

### Pure filtering tests (`lib/scan-filter.test.ts`) — 11 tests

1. returns all scans when no filters are applied
2. filters by URL substring (case-insensitive)
3. search is case-insensitive
4. filters by status only
5. combines search and status filters
6. returns empty array when no scans match
7. invalid status falls back to "All" (via `isValidStatus`)
8. preserves original ordering (does not re-sort)
9. handles empty dataset
10. SCAN_STATUSES contains exactly the four lifecycle statuses
11. statusLabel returns human-readable labels

### UI component tests (`components/ScanFilters.test.tsx`) — 6 tests

1. renders the search field with associated label (`<input type="search" id="scan-search">`)
2. renders the status selector with all five options (All, Pending, Running, Completed, Failed)
3. renders the result count ("12 scans")
4. renders empty state when no scans exist ("No scans yet." + "New scan" link)
5. renders reset button when filters are active and no matches ("No scans match the current filters." + "Reset filters")
6. preserves links to scan detail pages and navigation ("New scan →" link to `/scans/new`)

## Validation Results

| Check                                                | Status  | Details                                           |
| ---------------------------------------------------- | ------- | ------------------------------------------------- |
| `pnpm typecheck`                                     | ✅ Pass | All 10 workspaces — `jsx: "preserve"` intact      |
| `pnpm test`                                          | ✅ Pass | 1126+17 = 1143 passed, 18 skipped                 |
| `pnpm lint`                                          | ✅ Pass | ESLint clean, Prettier all files match code style |
| `pnpm build`                                         | ✅ Pass | All packages build, including `apps/web`          |
| `npx madge --circular --extensions ts packages apps` | ✅ Pass | No circular dependency found                      |
