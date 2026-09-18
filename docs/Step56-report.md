# Step 56 Report — Re-scan Same Target

## Inspection

### How the existing form initializes its target

**Before Step 56:** `ScanForm` (`components/ScanForm.tsx`) initialized its URL state with
`useState('')` — no `initialUrl` prop existed. `NewScanPage` (`app/scans/new/page.tsx`)
was a synchronous server component that called `<ScanForm />` with no props. There was
no mechanism to pass an initial target URL from the URL query string.

### How the existing scan creation flow works

The scan creation flow is synchronous (documented in Step 54):
1. `NewScanPage` renders `<ScanForm />`
2. `ScanForm` manages `url` state, validates via `validateUrl()`, and on submit calls
   `createScan(url)` → `POST /api/scans`
3. The API synchronously crawls + detects + persists
4. On 200, `router.push('/scans/{result.scan.id}')`
5. On error, `setError(extractErrorMessage(e.body))` — user stays on form with input preserved

### Where the re-scan action was placed

In the contextual action area of the scan detail page header (`app/scans/[id]/page.tsx`),
alongside the existing "Back to scan history", "New scan →", "Compare with another scan",
"Copy report link", and "Export JSON" actions. The "Re-scan" link appears **only** in the
"scan found" state (when `result !== null`), and only when `result.scan.target` is non-empty.

### Target URL representation

`ScanDetailResponse.scan.target` is a `string` (required field in `ScanResponse`).
For both completed and failed scans, the target URL is always present — it's the URL
the user originally submitted. This means "Re-scan" is available for both completed and
failed scans.

### Query parameter handling

`NewScanPage` was extended to be an async server component that reads `searchParams`
for an optional `target` parameter. When present, it's passed to `ScanForm` as
`initialUrl`. The value is **not** auto-submitted — the form renders pre-filled and
waits for explicit user confirmation.

---

## Implementation

### Files changed

1. **`apps/web/src/components/ScanForm.tsx`** — Added optional `initialUrl` prop:
   - `{ initialUrl = '' }: { initialUrl?: string }` — defaults to empty string
   - `useState(initialUrl)` — uses the prop as initial state
   - All existing validation, submission, error handling, and redirect behavior preserved
   - JSDoc updated to document the new prop

2. **`apps/web/src/app/scans/new/page.tsx`** — Made async, reads `target` query param:
   - Now `async function NewScanPage({ searchParams }: { searchParams?: Promise<{ target?: string }> }): Promise<React.ReactElement>`
   - Reads `target` from `searchParams`, defaults to `''`
   - Passes `initialUrl={target}` to `ScanForm`
   - When `target` is absent/empty, form starts empty — identical to existing behavior
   - JSDoc updated to document re-scan support

3. **`apps/web/src/app/scans/[id]/page.tsx`** — Added "Re-scan" action:
   - In the "scan found" state, after the "New scan" link and before "Compare"
   - `<Link href={`/scans/new?target=${encodeURIComponent(result.scan.target)}`} className={styles.rescanLink}>Re-scan</Link>`
   - Conditionally rendered only when `result.scan.target` is truthy
   - The link uses `encodeURIComponent()` for safe URL encoding — no manual concatenation

4. **`apps/web/src/app/scans/[id]/page.module.css`** — Added `.rescanLink` style:
   - Same visual pattern as `.newScanLink` (blue border, padding, rounded corners)
   - `:hover` background, `:focus-visible` outline (matching existing accessibility
     styles from Step 55)

5. **`apps/web/src/components/ScanCard.module.css`** (Step 55 carryover):
   - `.techNameLink:focus-visible` — visible focus state for detection tech name links
   - `.techInsightLink:focus-visible` — visible focus state for insights tech links
   - `.compositionTechName:focus-visible` — visible focus state for composition/matrix links
   - `.newScanLink:focus-visible` — visible focus state for "New scan" links
   - All match the existing `GlobalNav.module.css` focus pattern:
     `outline: 2px solid #2563eb; outline-offset: 1px;`

### URL/query strategy

- The re-scan link navigates to `/scans/new?target=<URL-encoded-target>`
- `encodeURIComponent(result.scan.target)` ensures safe URL encoding
- `NewScanPage` reads `sp?.target ?? ''` — absent/undefined target yields empty string
- The target value is passed through verbatim as `initialUrl` — no re-validation or re-normalization during transport
- Form validation (`validateUrl`) remains authoritative — if the target in the query
  param is invalid, the form renders it as the initial value but validation will fire
  on submit

### Form initialization

`ScanForm` receives `initialUrl` and uses it as the initial `useState` value:
```tsx
const [url, setUrl] = useState(initialUrl);
```
The URL is pre-filled in the input field. When the user modifies the URL, `setUrl`
updates the state normally. When the user submits, `validateUrl(url)` runs on whatever
value is in the input — pre-filled or user-edited. The existing form behavior is fully
preserved.

### Confirmation behavior

The form is **NOT auto-submitted**:
- `ScanForm` initializes with `useState(initialUrl)` — no `useEffect` that triggers submission
- The submit button shows "Start scan" (not "Starting scan…") — no `isSubmitting` state
- The user must click "Start scan" to trigger `handleSubmit` → `validateUrl` → `createScan`
- This prevents accidental duplicate scans

### Failed-scan behavior

A failed scan's `scan.target` is always a `string` (required field in `ScanResponse`).
The target was the URL the user submitted, which was accepted by the API (the failure
happened during crawling/detection, not during submission). Therefore, "Re-scan" is
available for failed scans — it creates a **new** scan via the normal creation flow,
not a retry of the existing scan.

For the not-found (404) and error (500) states, there is no `result.scan.target`
available (the scan doesn't exist or the API is unreachable), so "Re-scan" is not
rendered. This prevents creating broken re-scan URLs.

---

## Tests

### New tests

1. **`apps/web/src/app/scans/new/page.test.tsx`** (5 new tests, 11 total):
   - `passes the target query parameter as initialUrl to ScanForm` — Verifies the
     `target` query param is passed as `initialUrl` to `ScanForm`
   - `absent target query parameter keeps empty-form behavior` — Empty form when
     no `target` param
   - `does not auto-submit when target is prefilled` — Form renders in default state,
     no loading/submission state
   - `target query parameter with special characters is passed through verbatim` —
     URL with `&` is passed correctly
   - `empty target query parameter keeps empty-form behavior` — Empty string target
     also yields empty form

2. **`apps/web/src/app/scans/[id]/page.test.tsx`** (7 new tests):
   - `renders a Re-scan link pointing to /scans/new with the target`
   - `URL-encodes the target in the re-scan link` — `&` → `%26`, etc.
   - `does not render a Re-scan link when target is empty`
   - `renders Re-scan for a failed scan (target is still available)`
   - `does not render a Re-scan link when scan is not found (404)`
   - `does not render a Re-scan link on API error (500)`
   - `preserves existing "New scan" link alongside the Re-scan link`

3. **`apps/web/src/components/DetectionItem.test.tsx`** (2 tests from Step 55):
   - `uses canonical technology ID in link (not display name)` 
   - `preserves detection information when technology is linked`

4. **`apps/web/src/components/DetectionList.test.tsx`** (1 test from Step 55):
   - `produces correct catalog links for each known technology`

5. **`apps/web/src/components/ScanViews.test.tsx`** (1 test from Step 55):
   - `renders correct catalog links for multiple detected technologies`

### Regression tests (all existing tests unchanged and passing)

- `ScanFormView.test.tsx` (12 tests) — form rendering, validation display, submission state
- `ScanViews.test.tsx` (57 tests) — scan detail view, all states, detection rendering
- `ScanLifecycle.test.tsx` — polling behavior unaffected
- `ScanComparison.test.tsx` (31 tests) — comparison unchanged
- `ScanInsights.test.tsx` — insights tech links unaffected
- Full suite: **1649 passed (+16 new), 18 skipped**

---

## Validation

| Check | Result |
|---|---|
| Vitest (full suite) | 1649 passed (+16 new), 18 skipped ✅ |
| `tsc --noEmit` | 0 errors ✅ |
| ESLint | PASS ✅ |
| Prettier | All files use Prettier code style ✅ |
| `next build` | PASS (9 routes, dynamic `/scans/[id]`) ✅ |
| madge circular dependency | No circular dependency found (85 files) ✅ |
| `jsx: "preserve"` | Intact ✅ |

### Complete flow verification

```
/scans/{id}  →  click "Re-scan"
  →  /scans/new?target=https%3A%2F%2Fexample.com%2F
  →  ScanForm pre-filled with the target URL
  →  user edits if needed, clicks "Start scan"
  →  POST /api/scans  →  /scans/{newId}  →  new result page
```

- The target is URL-encoded via `encodeURIComponent()` ✅
- The form does not auto-submit ✅
- Validation runs on the pre-filled value ✅
- No new API endpoint — uses existing `POST /api/scans` ✅

---

## Scope

**Explicitly unchanged (verified):**

| Component/Layer | Status |
|---|---|
| `@devlens/core` — domain model | Untouched |
| `@devlens/crawler` — crawl behavior | Untouched |
| `@devlens/detectors` — detector pipeline, technology catalog, scoring | Untouched |
| `@devlens/application` — `executeScan`, `runScan`, `persistResult` | Untouched |
| `@devlens/database` — persistence schema | Untouched |
| `executeScan` / `runScan` / `completeScan` / `failScan` | Untouched |
| `POST /api/scans` contract | Untouched (no change to request/response) |
| `GET /api/scans/:id` contract | Untouched |
| `ScanLifecycle` — polling behavior | Untouched |
| `ScanDetailView` — result rendering | Untouched |
| `ScanFormView` — form presentation | Untouched |
| `ScanForm` — validation, submission, error handling | Untouched (only added optional `initialUrl` prop) |
| `validateUrl` — validation logic | Untouched |
| Comparison engine | Untouched |
| Scanner execution algorithm | Untouched |
| Technology catalog definitions | Untouched |
| No new dependencies added | ✅ |

**The single scan creation path is preserved:** There is exactly one `POST /api/scans`
endpoint, one `createScan()` client function, one `ScanForm` component, and one
`ScanFormView` presentation component. "Re-scan" simply navigates to the existing
`/scans/new` flow with a pre-filled target — it does not create a second creation path.
