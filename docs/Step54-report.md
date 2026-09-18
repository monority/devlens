# Step 54 Report — Scan Creation → First Result UX

## Inspection Findings

### Actual current creation flow

Traced the full journey from form submission to final scan detail:

1. **`/scans/new`** (server component) renders a heading, subtitle, back link, and `ScanForm`.
2. **`ScanForm`** (client component) manages `url`, `isSubmitting`, and `error` state. On submit:
   - Client-side validation via `validateUrl(url)` — rejects empty, malformed, and non-http(s) URLs
   - Sets `isSubmitting = true` → button shows "Starting scan…", input disabled
   - Calls `createScan(url)` → `POST /api/scans`
   - The API call is **synchronous**: `handleCreateScan` → `executeScan` → `runScan` (crawl + detect) → `persistResult`. The scan reaches a terminal state (`completed` or `failed`) before the API returns 200.
   - On success: `router.push('/scans/${result.scan.id}')` — navigates to detail page
   - On error (400/500): shows error message, keeps user on form with input preserved
3. **`/scans/{id}`** (server component) fetches via `fetchScanById(id)`, renders `ScanLifecycle` which polls every 2.5s for non-terminal scans (pending/running only) and stops at terminal states.

### Actual redirect behavior
- Submit → `createScan()` → `POST /api/scans` → **synchronous** scan execution → 200 with full result → `router.push('/scans/{id}')`
- The scan is always complete (or failed) by the time the detail page renders. There is no actual "processing" state visible to the user — the scan goes from not-created to terminal in one synchronous API call.
- No false progress: the scanning UI (`ScanningState`) already correctly says "queued and waiting to start" or "currently running" without fake percentages.

### Existing processing/polling behavior
- `ScanLifecycle` polls `GET /api/scans/:id` every 2.5s when `isScanning(status)` is true (pending/running).
- Stops polling when `isTerminal(status)` is true (completed/failed) or on 404.
- Preserves last known state on transient errors.
- **No changes needed** — polling is correct and existing tests cover it.

### Existing error behavior
- Invalid input: client-side `validateUrl` catches empty/malformed/non-http(s) URLs immediately
- API failure: `ApiError` caught, `extractErrorMessage` extracts user-facing message
- Scan execution failure: returned as 200 with `status: "failed"` — user sees error code + message on detail page
- Missing scan: `ScanNotFound` component with "Back to scan history" link
- Unexpected server error: generic "An unexpected error occurred." message
- **No stack traces or internal details are exposed to the user**

### Concrete UX gap identified

The scan detail page (`/scans/{id}`) provides contextual navigation
("Back to scan history", "Compare with another scan", "Copy report link",
"Export JSON") but has **no "New scan" link**. After viewing scan results,
the user must:

1. Click "← Back to scan history" → lands on `/scans`
2. Click "+ New scan" → lands on `/scans/new`

This is two clicks to start over. The `create → result → create` loop
is broken when the user wants to create another scan immediately after
reviewing results.

Additionally, `ScanNotFound` only offers "← Back to scan history" with no
path to start a new scan.

The `/scans/new` form page subtitle ("Enter a target URL to start scanning.")
does not explain what happens after submission — there is no context about
the end-to-end journey.

---

## Implementation

### Changes made (smallest meaningful set):

1. **Added "New scan →" link to the scan detail page** (`apps/web/src/app/scans/[id]/page.tsx`)
   - Added alongside the existing "Back to scan history" link in all three header states:
     - Scan found (with result/lifecycle)
     - Scan not found (404 → `ScanNotFound`)
     - API/infrastructure error (500 → `ScansError`)
   - The link navigates directly to `/scans/new` — closing the create→result→create loop in one click

2. **Added "New scan →" link to `ScanNotFound`** (`apps/web/src/components/ScanViews.tsx`)
   - The pure component now renders both "← Back to scan history" and "New scan →"
   - Previously only had the back link — now users can start fresh from a 404 state

3. **Added helper text to `/scans/new` page** (`apps/web/src/app/scans/new/page.tsx`)
   - Text: "DevLens will crawl the target, analyze it for supported technologies, and take you to the results page."
   - Sets expectations about the journey (addresses "what happens after submission")

4. **Added CSS** (`apps/web/src/app/scans/[id]/page.module.css`)
   - `.newScanLink` — blue button-style link matching the existing `.backLink` pattern
   - `.helperText` in `apps/web/src/app/scans/new/page.module.css`

### Reused components/helpers
- `ScanCard` — reused for scan history display
- `ScanForm` / `ScanFormView` — unchanged
- `ScanLifecycle` — unchanged (polling preserved)
- `ScanDetailView` — unchanged
- `ScanNotFound` — extended with "New scan" link
- Existing CSS patterns: `.backLink` (blue border style) reused for `.newScanLink`

### Polling not modified
Polling was not modified — the existing `ScanLifecycle` component's behavior
(poll every 2.5s for non-terminal scans, stop at terminal) is correct for the
current architecture. The scan execution is synchronous, so by the time the
user reaches the detail page the scan is already complete. Polling remains
available for scans started by other mechanisms (e.g., the worker runtime).

---

## Tests

### New tests
- **`apps/web/src/app/scans/new/page.test.tsx`** (6 tests) — Tests the page
  structure with `ScanForm` mocked out:
  - Renders "New Scan" heading ✓
  - Renders subtitle ✓
  - Renders helper text explaining the journey ✓
  - Renders back link to scan history ✓
  - Renders the ScanForm component (via mock) ✓
  - Does not contain fake progress indicators ✓

### Updated tests
- **`apps/web/src/components/ScanViews.test.tsx`** — Extended `ScanNotFound` tests:
  - Existing: not-found message with scan ID ✓
  - Existing: back link to scan history ✓
  - New: renders "New scan" link to `/scans/new` ✓
  - New: renders both back link and new scan link ✓

### Full suite — 1633 passed (+12 new), 18 skipped

---

## Validation

| Check | Result |
|-------|--------|
| Vitest (full suite) | 1633 passed, 18 skipped ✅ |
| `tsc --noEmit` | 0 errors ✅ |
| ESLint | PASS ✅ |
| Prettier | All files use Prettier code style ✅ |
| `next build` | PASS (9 routes) ✅ |
| madge circular | No circular dependency found (85 files) ✅ |
| `jsx: "preserve"` | Intact ✅ |

---

## Scope

**Explicitly unchanged:**

- `@devlens/core` — domain model, scan lifecycle, value objects
- `@devlens/crawler` — crawl behavior, SSRF protection
- `@devlens/detectors` — detector pipeline, technology catalog, scoring
- `@devlens/application` — `executeScan`, `runScan`, `completeScan`, `failScan`
- `@devlens/database` — persistence schema, repository implementations
- Comparison logic (`compareScans`) — unchanged
- Technology catalog semantics — unchanged
- API contracts — unchanged (no new endpoints, no modified response shapes)
- Scan execution algorithm — unchanged
- `ScanForm`, `ScanFormView` — form validation and submission logic unchanged
- `ScanLifecycle` — polling behavior unchanged
- `ScanDetailView` — result rendering unchanged
- Global navigation (Step 52) — unchanged
- No new dependencies added

**New files:**
- `apps/web/src/app/scans/new/page.test.tsx`
- `docs/Step54-report.md`
