# Step 28: Shareable Scan Report

## Objective

Make individual DevLens scan results stable, shareable, and useful as standalone technical reports at `/scans/[id]`. Add report metadata (page title/description), a "Copy report link" action, a detection count in the header, and ensure URL-safe sharing with no backend changes.

## Architecture

### Preferred structure

```
page.tsx (server)
  ↓
ScanLifecycle (client: 'use client', polling)
  ↓
ScanDetailView (pure presentation)
  ├── ScanSummary       (scan metadata: target, status, timeline)
  ├── Snapshot          (HTTP + HTML observations, for completed scans)
  └── DetectionList     (ranked detection list)
  ↓
CopyReportLink (client: 'use client', clipboard only — placed in page header)
```

Only two client boundaries exist: `ScanLifecycle` (polling, pre-existing) and `CopyReportLink` (clipboard, new). The detail view (`ScanDetailView`) remains pure and server-rendered.

### Metadata (`lib/report-metadata.ts`)

Pure module with no React, HTTP, or database dependencies. Derives page `<title>` and `<meta name="description">` from scan data:

- **`scanReportTitle(scan)`** → `DevLens — {target}` (target URL from API response)
- **`scanReportDescription(scan)`** → `Technology scan report from DevLens.` (generic, no scan-specific data)
- **`generateReportMetadata(result)`** → `{ title, description }` for a loaded scan
- **`generateDetailMetadata(result | null)`** → report metadata if scan exists, not-found metadata if null
- **`notFoundMetadata()`** → `{ title: "DevLens — Scan Not Found", ... }`
- **`errorMetadata()`** → `{ title: "DevLens — Error", ... }`

Security: no raw internal errors, database IDs beyond the existing scan ID, stack traces, or filesystem paths are included in metadata. Only the scan target (already visible in the API response) is used for the title.

### Clipboard (`lib/clipboard.ts`)

Pure utility wrapping the browser Clipboard API:

- **`copyToClipboard(text)`** → returns `true` on success, `false` on failure
- Checks for `navigator.clipboard?.writeText` availability
- Catches all errors — no exceptions thrown

### Copy button (`components/CopyReportLink.tsx`)

Tiny `'use client'` component:

- Renders a `<button type="button">` with `aria-label="Copy report link"`
- Uses `copyToClipboard()` from `lib/clipboard.ts`
- Copies `window.location.href` (full current page URL)
- Shows `CopyFeedback` (pure component) with `aria-live="polite"` for success/error
- `CopyFeedback` renders "Copied!" or "Copy failed. Please copy the link manually."
- No third-party clipboard dependency

### Page modifications (`app/scans/[id]/page.tsx`)

- Added `generateMetadata()` — fetches the scan, derives title from target, falls back to generic metadata on 404/error
- Added `CopyReportLink` in the detail header (alongside existing back/compare links)
- Added detection count in the subtitle for terminal-status scans: `Scan {id} · {N} detections`
- Uses `isTerminal()` from `scan-utils` to determine when to show the count

### Filter UI module (`lib/scan-filter.ts`) — from Step 27

Used by the `ScanHistory` client component on `/scans`. Not modified in Step 28.

## Key Design Decisions

1. **Server rendering preserved**: Only `CopyReportLink` (clipboard) and `ScanLifecycle` (polling) are client components. The scan report itself (`ScanDetailView`) remains server-rendered.

2. **Clipboard API only**: No third-party clipboard libraries. The `copyToClipboard` utility is a thin wrapper around `navigator.clipboard.writeText()`.

3. **Graceful clipboard fallback**: If the clipboard API is unavailable or throws, the component shows an error message with the report path for manual copying — no alerts.

4. **Metadata security**: The page title uses only the scan target (public-facing URL). Error codes/messages from failed scans are NOT included in metadata, though they remain visible in the report body (via `ScanSummary`).

5. **Detection count**: Shown only for terminal-status scans (completed/failed) where detections are meaningful. Pending/running scans show no count (detections not yet available).

6. **Report URL**: The copied URL is `window.location.href` — the full, shareable URL of the current page. No manual URL construction needed.

7. **No duplicate navigation**: The existing "back to scan history" and "compare with another scan" links are preserved. `CopyReportLink` is added as a complementary action, not a replacement.

## Files Created

- `apps/web/src/lib/report-metadata.ts` — Pure metadata generation functions
- `apps/web/src/lib/report-metadata.test.ts` — 6 tests (title, completed metadata, failed scan safety, not-found, error, description)
- `apps/web/src/lib/clipboard.ts` — Pure clipboard utility
- `apps/web/src/lib/clipboard.test.ts` — 3 tests (success, unavailable API, writeText throws)
- `apps/web/src/components/CopyReportLink.tsx` — Client component ('use client') with pure `CopyFeedback` sub-component
- `apps/web/src/components/CopyReportLink.test.tsx` — 4 tests (renders, clipboard success, clipboard failure, accessible feedback)
- `apps/web/src/components/ScanHistory.tsx` — Client component for `/scans` filtering (from Step 27)
- `apps/web/src/components/ScanFilters.tsx` — Pure presentation for filter UI (from Step 27)
- `apps/web/src/components/ScanDetailReport.test.tsx` — 9 tests (5 report + 4 regression)

## Files Modified

- `apps/web/src/app/scans/[id]/page.tsx` — Added `generateMetadata()`, `CopyReportLink`, detection count
- `apps/web/src/app/scans/page.tsx` — Uses `ScanHistory` client component (from Step 27)
- `apps/web/src/components/ScanCard.module.css` — Added filter UI + copy link + detection count styles

## Test Coverage

### Metadata tests (`lib/report-metadata.test.ts`) — 6 tests

1. derives page title from scan target
2. generates correct metadata for a completed scan
3. generates safe metadata for a failed scan (no error details leaked)
4. returns not-found metadata when scan is null
5. returns error metadata
6. scanReportDescription is generic (no scan data)

### Clipboard tests (`lib/clipboard.test.ts`) — 3 tests

1. returns true on successful clipboard write
2. returns false when clipboard API is unavailable
3. returns false when writeText throws

### CopyReportLink tests (`components/CopyReportLink.test.tsx`) — 4 tests

1. renders a copy button with an accessible label (`aria-label`)
2. clipboard success returns true (utility test)
3. clipboard failure returns false when clipboard is unavailable (utility test)
4. CopyFeedback renders accessible success feedback (`aria-live="polite"`)

### Report detail tests (`components/ScanDetailReport.test.tsx`) — 9 tests

**Report:**

1. scan ID is visible in the report
2. target URL is visible
3. status is visible
4. detection count is displayed for completed scans
5. existing navigation links remain present (CopyReportLink button, aria-label)

**Regression (lifecycle states):** 6. renders pending scan without errors 7. renders running scan without errors 8. renders completed scan without errors 9. renders failed scan without errors (error info visible in body, not in metadata)

## Validation Results

| Check                                                | Status  | Details                                           |
| ---------------------------------------------------- | ------- | ------------------------------------------------- |
| `pnpm typecheck`                                     | ✅ Pass | All 10 workspaces — `jsx: "preserve"` intact      |
| `pnpm test`                                          | ✅ Pass | 1143+22 = 1165 passed, 18 skipped                 |
| `pnpm lint`                                          | ✅ Pass | ESLint clean, Prettier all files match code style |
| `pnpm build`                                         | ✅ Pass | All packages build, including `apps/web`          |
| `npx madge --circular --extensions ts packages apps` | ✅ Pass | No circular dependency found                      |
