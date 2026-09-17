# Step 43: Product Capability Audit & Next Product Slice

## Status

`COMPLETE`

This step is an **audit and planning step** — no source code was changed. Only the audit document was created. Repository validation confirms the codebase remains green.

---

## 1. Current product state

DevLens is a website analysis tool built on a clean, layered architecture:

```text
apps/web (Next.js UI)
  ├─ app/                            — Next.js routes (server + client components)
  │   ├─ /                           — Home page (links to tech catalog only)
  │   ├─ /scans                    — Scan history (server-rendered list + client filtering)
  │   ├─ /scans/new               — Scan creation form (POST /api/scans → redirect to detail)
  │   ├─ /scans/{id}             — Scan detail (server → client ScanLifecycle polling → ScanDetailView)
  │   └─ /scans/compare          — Scan comparison (reads ?left=&right= → compareScans → ScanComparison)
  ├─ components/                     — Pure presentation + 2 client components (ScanForm, ScanLifecycle)
  └─ lib/                            — Pure logic modules (types, api client, evidence presenter,
                                      detection-explainability, detection-coverage, scan-explainability,
                                      scan-overview, scan-insights, scan-detection-results, comparison,
                                      evidence-identity, technology-catalog, etc.)

packages/ (npm workspaces)
  ├─ core/                            — Domain model (Scan, ScanStatus, Evidence, Technology, etc.)
  ├─ crawler/                         — HTTP crawler + HTML parser + SSRF guard
  ├─ detectors/                       — Detection pipeline + evidence-key.ts (domain-level identity)
  ├─ application/                     — Orchestrator (runScan) + execute-scan + queries + repository interface
  ├─ database/                        — PostgreSQL repository (Drizzle ORM) — schema + persistence mappings
  ├─ config/                          — Shared config
  └─ validation/                      — Input validation

API surface:
  GET    /api/scans        — list all scans (deterministic: createdAt DESC, scanId ASC)
  POST   /api/scans        — create + execute a scan (synchronous: returns completed/failed result)
  GET    /api/scans/:id    — get a single scan by ID (200 / 404 / 500)
  (No DELETE, no rescan endpoint, no update endpoint)
```

The scan creation flow is **synchronous**: `POST /api/scans` runs the crawler + detectors + persistence in the request, then returns the complete `ScanDetailResponse`. This means scans complete before the user is redirected to the detail page (no real "queued" state — pending is transient).

The `ScanLifecycle` client component polls `/api/scans/:id` every 2.5s for non-terminal scans. For completed/failed scans, it renders `ScanDetailView` once (no polling).

Steps 37–42 established: technology catalog, detection explainability, detection coverage, dedup/sort determinism, and canonical evidence identity. The detection/explainability architecture is now consolidated.

---

## 2. End-to-end user journey

```text
1. Arrive at DevLens
   → User lands on / (home page)
   → Home page shows "DevLens" + "Website analysis tool — foundation phase"
   → ONLY link is "Technology catalog" → /technologies
   ✗ No link to /scans (scan history)
   ✗ No link to /scans/new (start a scan)
   → User must know or guess the URL /scans/new

2. Submit a URL
   → Navigate to /scans/new (must guess the URL from home page)
   → Enter target URL in form (URL input + "Start scan" button)
   → Form validates URL client-side (http/https scheme, non-empty)
   → On submit: shows "Starting scan…" (loading state)

3. Start a scan
   → Form POSTs { url } to /api/scans
   → Server: executes scan (crawl → detect → persist) synchronously
   → On success: redirects to /scans/{id} (client-side router.push)
   → On 400: shows error message in the form
   → On 500: shows "An unexpected error occurred."

4. Know scan is running
   → ScanDetailPage fetches scan by ID (server-side)
   → If status is pending/running: ScanLifecycle shows "Scanning in progress"
   → ScanLifecycle polls /api/scans/:id every 2.5s
   → Server renders initial state (no layout shift)

5. Know scan is complete
   → When poll returns terminal status: ScanLifecycle renders ScanDetailView
   → ScanDetailView shows full scan detail (overview, insights, coverage, detections)

6. Access result
   → ScanDetailView renders:
     - ScanOverview: scan ID, target, hostname, timeline
     - ScanInsights: technology count, categories, evidence breakdown
     - DetectionCoverage: deduplicated evidence coverage
     - Snapshot: HTTP status, final URL, title, description
     - Detections: sorted by confidence DESC, name ASC

7. Understand detected technologies
   → DetectionList renders each DetectionItem
   → Each item shows: technology name, category, confidence %, detection ID
   → For completed scans: ordered by confidence DESC, then name ASC

8. Inspect evidence
   → Each DetectionItem shows EvidenceList (collapsible)
   → Evidence organized by type (HTTP Header, Meta Tag, Script URL, etc.)
   → Evidence fields shown via EvidenceItem (type-specific rendering)
   → Source descriptions from DetectionExplainability (Step 41)

9. Understand confidence/explanation
   → DetectionItem shows "Confidence: N%" (exact API value, no rounding)
   → Explanation summary: "Detected from {type1}, {type2} evidence."
   → Per-evidence source list: "HTTP header 'Server'" / "Script from '...'"
   → Evidence source type labels: "HTTP Header", "Meta Tag", "Script URL"
   → No subjective labels ("high"/"medium"/"low")

10. Return to previous scans
    → Back link on scan detail: "← Back to scan history" → /scans
    → Scan history page: list of scan cards (status badge + target + timestamp)
    → Search by URL target + status filter (pending/running/completed/failed)
    → Scan cards show: status, target, hostname, timestamp
       ✗ No detection count on card (requires clicking through to detail)
       ✗ No rescan button on card

11. Compare scans
    → Scan detail header has "Compare with another scan" link
       → Links to /scans/compare?left={current_scan_id}
       → But does NOT provide `right` parameter
       → Compare page shows "Missing scan IDs" error
    → Scan history page has "Compare two scans" link
       → Links to /scans/compare (no query params)
       → Compare page shows "Missing scan IDs" error
    → ONLY way to actually compare: manually construct URL
       /scans/compare?left=scan_a_id&right=scan_b_id
    → Compare page renders: scan summaries, technology changes (added/removed/unchanged),
       score/confidence changes, evidence changes
    ✗ Comparison is fully implemented but completely inaccessible to users

12. Start another scan
    → No "Rescan" or "New scan" button on scan detail page
    → User must navigate to /scans/new (via scan history or guessing URL)
    → Must re-enter the URL manually
    → OR: home page → technology catalog → /scans (history) → /scans/new
    ✗ No quick path to re-scan the same URL
```

---

## 3. Capability matrix

| Capability             | Status      | Notes                                                                                                                                                                    |
| ---------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Start scan             | implemented | `/scans/new` → form → POST `/api/scans` → redirect to `/scans/{id}`                                                                                                      |
| Scan lifecycle         | implemented | `ScanLifecycle` client component polls for non-terminal scans (2.5s interval). Completed/failed are terminal (no polling).                                               |
| Scan persistence       | implemented | PostgreSQL via Drizzle ORM. Scans + snapshots persisted atomically. Deterministic ordering (createdAt DESC, scanId ASC).                                                 |
| Scan history           | implemented | `/scans` lists all scans as cards. Search by URL + status filter.                                                                                                        |
| Scan detail            | implemented | `/scans/{id}` shows overview, insights, coverage, snapshot, detections. Client polling for in-progress scans.                                                            |
| Technology exploration | implemented | `/technologies` catalog with search + category filter. `/technologies/{id}` detail page.                                                                                 |
| Evidence exploration   | implemented | Collapsible EvidenceList in each DetectionItem. Type-specific EvidenceItem rendering. Copy report link.                                                                  |
| Explainability         | implemented | DetectionExplainability (Step 41): source descriptions, canonical identity, deduplication, deterministic ordering. Confidence passed through exactly.                    |
| Comparison             | **partial** | `compareScans()` pure logic ✓. `ScanComparison` component ✓. `/scans/compare` route ✓. **But: NO scan-selection UI — users must manually construct URLs with scan IDs.** |
| Rescan                 | **missing** | No "rescan" button anywhere. Must go to `/scans/new` and re-enter URL.                                                                                                   |
| Error handling         | implemented | Form validation errors (400), API errors (500), 404 (scan not found). Scan detail shows "Scan not found" / "Unable to load scans".                                       |
| Empty states           | implemented | "No scans yet" on history page. "No evidence details available" in DetectionItem. "No detection changes" in comparison.                                                  |
| Navigation             | **partial** | Ad-hoc back links on each page. NO navigation bar. Home page only links to technology catalog — no link to `/scans`.                                                     |
| API usability          | **partial** | GET/POST work well. But scan history cards show no detection count. Scan detail has no rescan action.                                                                    |
| Export                 | implemented | "Export JSON" button on scan detail. Downloads versioned JSON via browser Blob API.                                                                                      |
| Copy report link       | implemented | "Copy report link" button copies current page URL to clipboard via browser API.                                                                                          |

---

## 4. Scan Detail architecture

```text
ScanDetailView  (pure orchestrator — 327 lines)
├── data acquisition: result passed as props (from ScanLifecycle)
├── loading: handled by ScanLifecycle polling + "in progress" UI
├── error: 404 via ScanNotFound, 500 via ScansError
├── completed state: ScanOverview + ScanInsights + DetectionCoverage + Snapshot + Detections
├── failed state: ScanSummary + DetectionList (zero detections)
├── overview: ScanOverview (scan ID, target, hostname, timeline, metrics)
├── insights: ScanInsights (tech count, categories, evidence coverage, tech list, evidence matrix)
├── coverage: DetectionCoverage (deduplicated evidence count + type breakdown)
├── detections:
│   ├── non-terminal: ScanningState ("in progress")
│   ├── completed + query filter: DetectionFilterView → DetectionFilters + ScanDetectionResults
│   ├── completed (no filter): ScanDetectionResults → DetectionList → DetectionItem
│   └── failed: DetectionList → DetectionItem (with evidence)
├── filters: DetectionFilterView (client, URL-synced: ?q=, ?category=)
├── explainability: built into DetectionItem (getDetectionExplainability)
└── evidence: EvidenceList → EvidenceItem (collapsible tree)
```

### Observations

**Correctly separated:**

- Server rendering (data fetch) → client polling (ScanLifecycle) → pure presentation (ScanDetailView)
- Pure logic modules (scan-detection-results, detection-explainability, detection-coverage, scan-insights, scan-overview) are independently tested
- `EvidenceList` / `EvidenceItem` are presentation-only, receiving typed data
- DetectionItem correctly delegates evidence dedup/sorting to the explainability model

**Duplicated / unnecessarily coupled:**

- `StatusLabel` function exists in BOTH `ScanViews.tsx` (lines 47-60) and `ScanSummary.tsx` (lines 20-33) — identical switch statement
- `statusClass` function exists in BOTH `ScanViews.tsx` (lines 63-78) and `ScanSummary.tsx` (lines 36-52) — identical switch statement
- `ScanDetailPage` passes `evidence` count via `result.detections.length` — doesn't use deduplicated count (minor inconsistency with DetectionCoverage which does dedupe)
- `comparison-api.ts` defines `fetchComparison` and `compareScanResults` but neither is imported anywhere — the compare page does its own fetch + compare inline

**Missing entirely:**

- No "Rescan" action on scan detail page (user cannot re-execute the same URL)
- No navigation bar (user must know/guess URLs or use ad-hoc back links)
- No link from home page to scan history or scan creation
- No scan selection UI for comparison (the biggest gap)

---

## 5. Persistence/API capabilities

**What exists:**

| Operation      | Endpoint / Method                   | Persistence                                         | Status                                   |
| -------------- | ----------------------------------- | --------------------------------------------------- | ---------------------------------------- |
| Create scan    | `POST /api/scans` (body: `{url}`)   | `executeScan()` → `runScan` + `persistResult`       | Implemented, synchronous                 |
| List scans     | `GET /api/scans`                    | `listScans()` → `repository.list()`                 | Implemented (createdAt DESC, scanId ASC) |
| Get scan by ID | `GET /api/scans/:id`                | `getScan()` → `repository.getById()`                | Implemented (200/404/500)                |
| Delete scan    | —                                   | —                                                   | Not implemented                          |
| Rescan         | —                                   | Would need to create a new Scan + runScan + persist | Not implemented                          |
| Compare scans  | `/scans/compare?left=...&right=...` | Uses existing GET-by-ID for both                    | Implemented (UI layer only)              |

**Persistence capabilities already available:**

- ✅ Scans retrievable individually by ID
- ✅ Multiple scans retrievable (list all)
- ✅ Scans listed deterministically (createdAt DESC, scanId ASC)
- ✅ Enough persisted information for history + comparison (scan metadata, snapshot, detections + evidence)
- ✅ Scan results immutable after completion (upsert by ID, no update endpoint)
- ✅ Failed scans retained (returned as valid results with error info)
- ✅ All information available without re-running crawler (snapshot + detections persisted as JSON)

**What does NOT exist:**

- ❌ Delete scan (no DELETE endpoint)
- ❌ Rescan (no re-execution endpoint — would need to re-run crawler)
- ❌ Partial updates to scans

---

## 6. Existing comparison capability

### What `comparison.ts` does

`compareScans(left: ScanDetailResponse | null, right: ScanDetailResponse | null): ComparisonResult`

A pure function that compares two `ScanDetailResponse` objects (both nullable for 404 handling):

**Comparison dimensions:**

1. **Target difference** — flags when the two scans target different URLs
2. **Failed scan handling** — if either scan is `failed`, shows "Limited comparison" notice
3. **Technology status** (per technology ID):
   - Added (only in right/current scan)
   - Removed (only in left/previous scan)
   - Unchanged (in both)
4. **Score/confidence changes** — for technologies present in both: `rightConfidence - leftConfidence` delta + "changed" flag
5. **Evidence changes** — for technologies present in both: per-evidence `added`/`removed`/`unchanged` (matched by canonical `getEvidenceIdentity`)
6. **Overall** — `hasChanges` flag (true if any additions, removals, score changes, or evidence changes)

**Output shape (`ComparisonResult`):**

- `left`, `right` — the raw scan responses (or null)
- `leftNotFound`, `rightNotFound` — 404 flags
- `hasBoth`, `targetsDiffer`, `leftFailed`, `rightFailed` — boolean flags
- `technologies` — all technologies (added/removed/unchanged/scoreChanges)
- `added`, `removed`, `unchanged`, `scoreChanges` — filtered sub-arrays
- `evidenceChanges` — flat list of all evidence changes across all technologies
- `hasChanges` — true if any meaningful difference exists

### Who consumes it

- `apps/web/src/app/scans/compare/page.tsx` — imports `compareScans` and `ScanComparison`, fetches both scans via `fetchScanById`, calls `compareScans(left, right)`, renders `ScanComparison`
- `apps/web/src/lib/comparison-api.ts` — exports `fetchComparison()` (fetches + compares) and `compareScanResults()` (compares pre-fetched) — **BUT: neither is imported anywhere. Dead code.**
- `apps/web/src/app/scans/[id]/page.tsx` — links to `/scans/compare?left={id}` (pre-fills left only)
- `apps/web/src/app/scans/page.tsx` — links to `/scans/compare` (no params)

### Does comparison have a UI?

**Partially.** The `ScanComparison` component renders the full comparison report:

- Scan headers (both scans' summaries side by side)
- Target difference warning
- Failed scan notice
- Technology changes (Added/Removed/Present in both sections, with score deltas)
- Evidence changes (table with status/type/evidence)

The component has **207 lines of test coverage** (7 tests covering: successful comparison, missing left, missing right, failed scan, identical scans, added/removed techs, score changes, evidence changes). The pure logic has **17 tests** in `comparison.test.ts`.

### Is comparison exposed to users?

**Yes but unusable.** The UI exists but there is NO way for a user to select which scans to compare:

1. Scan detail page: "Compare with another scan" → `/scans/compare?left={id}` — missing `right` param → "Missing scan IDs" error
2. Scan history page: "Compare two scans" → `/scans/compare` — no params → "Missing scan IDs" error
3. Only works if user manually constructs: `/scans/compare?left=scan_a&right=scan_b`

### Domain semantics

- Uses canonical `getEvidenceIdentity` (from Step 42) for evidence matching
- Re-exports `evidenceKey` as backward-compatible alias
- Technology identity is by `technology.id` (not name or order)
- Ordering changes are ignored (comparison is by ID, not position)

### Could it support a meaningful next product capability?

**Absolutely.** The comparison engine is fully built and tested. The ONLY missing piece is a scan-selection UI — a component that lets users pick two scans from the history list and navigate to `/scans/compare?left=...&right=...`.

---

## 7. Main product gap

### The largest missing capability: **Accessible Scan-to-Scan Comparison**

The scan comparison feature is approximately **80% implemented** but **100% unusable** by end users. The pure comparison logic (`compareScans`), the presentation component (`ScanComparison`), the route page (`/scans/compare`), and the CSS styling are all complete and tested. What is missing is a **scan-selection interface** that bridges the gap between "I want to compare two scans" and the comparison result.

### Why this is the most important gap:

1. **High product value** — Comparison is the only analytical feature that helps users understand what changed between scans. Without it, DevLens is a snapshot tool, not a monitoring/evolution tool.

2. **Near-complete infrastructure** — Everything needed exists:
   - `compareScans()` (pure, 17 tests)
   - `ScanComparison` component (7 tests)
   - `/scans/compare` route (with error/404/failed handling)
   - `fetchScanById` API client (for fetching individual scans)
   - Scan history data (already fetched on `/scans`)

3. **Small, coherent change** — The missing piece is a UI component (~100-150 lines): a list of completed scans with dual-selection, and a "Compare" button that navigates to the compare route. No backend changes, no API changes, no domain model changes, no persistence changes.

4. **User-facing** — Directly enables a meaningful user action: "compare these two scans."

### Alternative candidates considered and why they're lower priority:

| Candidate                            | Why not primary                                                                                                                                                                        |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Rescan**                           | Requires backend changes (new POST endpoint or re-execution of crawler). The scan creation flow is synchronous, so rescanning would block the request. More architectural work needed. |
| **Navigation bar**                   | Purely structural improvement, doesn't add a user-facing product capability.                                                                                                           |
| **Technology-driven scan discovery** | Requires linking technology catalog to scan results — more architectural change, and tech detail currently has no scan data context.                                                   |
| **Home page link to scans**          | Trivially easy, but doesn't constitute a product capability — just navigation wiring.                                                                                                  |
| **Delete scan history entries**      | No DELETE API endpoint exists; requires backend changes.                                                                                                                               |

---

## 8. Proposed Step 44

### Next vertical slice: **Scan Selection UI for Comparison**

```text
User action:
  On /scans (scan history), user clicks "Compare two scans"

    ↓
UI (new component: ScanComparisonSelector):
  Renders the scan history list with dual checkboxes/radio selections.
  "Compare" button navigates to /scans/compare?left=ID&right=ID
  (or uses router.push with the selected scan IDs)

    ↓
API / application layer:
  None needed — reuses existing fetchScans() on the page,
  and existing fetchScanById() on the compare page.

    ↓
Domain:
  None — compareScans() is already pure and tested.

    ↓
Persistence:
  None — existing GET /api/scans + GET /api/scans/:id.

    ↓
Result:
  /scans/compare?left=ID&right=ID renders ScanComparison component.

    ↓
UI feedback:
  Comparison report with technology changes, score changes,
  and evidence changes (already implemented by ScanComparison).
```

### Goal

Make scan-to-scan comparison **discoverable and usable** by adding a scan selection UI that lets users pick two scans from history and view their comparison.

### User story

> As a DevLens user, when I am on the scan history page, I want to select any two completed scans and see a side-by-side comparison of their detected technologies, confidence changes, and evidence changes, so that I can understand what changed between two points in time.

### Current reusable infrastructure

- `compareScans(left, right)` — pure comparison function (17 tests)
- `ScanComparison` component — full comparison report rendering (7 tests)
- `/scans/compare` route page — handles left/right query params, fetches both scans, renders comparison
- `fetchScans()` — API client for listing all scans (already called on `/scans` page)
- `fetchScanById(id)` — API client for fetching a single scan
- `ScanCard` component + CSS — existing card styling for scan list
- `evidenceKey`/`getEvidenceIdentity` — canonical identity (Step 42)
- `evidenceTypeLabel`, `evidenceFields` — evidence presentation helpers

### Required changes

| Layer                 | Changes                                                                                                                                                        |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **New component**     | `ScanComparisonSelector` — client component that renders a selectable scan list (dual radio/checkbox selection) + "Compare" button. Reuses `ScanCard` styling. |
| **New test**          | `ScanComparisonSelector.test.tsx` — tests selection, navigation, validation (can't select same scan twice, etc.)                                               |
| **Scan history page** | Update `/scans/page.tsx` to render `ScanComparisonSelector` when user clicks "Compare two scans" (or render it as the compare link's destination).             |
| **CSS**               | Add minimal styles for the selector (reuse existing `ScanCard.module.css` classes where possible).                                                             |
| **API**               | None — `fetchScans()` is already available.                                                                                                                    |

### Domain impact

None. No domain types, domain logic, or domain behavior changed.

### API impact

None. No endpoint changes. Uses existing `GET /api/scans` and `GET /api/scans/:id`.

### UI impact

- New client component `ScanComparisonSelector` (selects two scans)
- Updated scan history page flow (compare mode)
- Reuses `ScanComparison` component as the destination

### Persistence impact

None. No schema or repository changes.

### Tests

- New: `ScanComparisonSelector.test.tsx` (selection, validation, navigation)
- Existing: `comparison.test.ts` (17 tests), `ScanComparison.test.tsx` (7 tests) — unchanged
- Consumer tests updated if any existing test references the compare UI

### Acceptance criteria

1. User can click "Compare two scans" from the scan history page
2. User sees a list of all scans with dual selection controls
3. User selects two different scans (same scan can't be selected twice)
4. User clicks "Compare" → navigates to `/scans/compare?left=ID1&right=ID2`
5. The existing comparison report renders with correct data
6. User can cancel and return to scan history
7. Only completed scans are selectable (pending/running scans don't have results to compare)
8. If fewer than 2 completed scans exist, show appropriate message

### Non-goals

- No rescan capability
- No delete scan capability
- No new API endpoints
- No new domain models
- No persistence changes
- No navigation bar
- No dashboard or analytics views
- No new evidence types or detection logic

---

## 9. Exact Step 44 vertical slice

```text
User clicks "Compare two scans" on /scans
  ↓
ScanComparisonSelector renders (client component):
  - Title: "Compare Scans"
  - List of completed scans (reusing ScanCard styling)
  - Each card has a radio/checkbox to select as "left" or "right"
  - "Compare" button (disabled until 2 different scans selected)
  - "Cancel" link → /scans
  ↓
User selects two scans
  ↓
"Compare" button navigates to /scans/compare?left=ID1&right=ID2
  ↓
Existing ScanComparisonPage fetches both scans, calls compareScans(),
renders ScanComparison component (already fully implemented)
  ↓
User sees technology changes, score changes, evidence changes
```

**Files to create:**

- `apps/web/src/components/ScanComparisonSelector.tsx` (client component)
- `apps/web/src/components/ScanComparisonSelector.test.tsx` (tests)

**Files to modify:**

- `apps/web/src/app/scans/page.tsx` (render selector when in "compare selection" mode)
- `apps/web/src/app/scans/page.module.css` (minimal styles for selector)

**Files NOT modified:**

- `lib/comparison.ts` (already canonical, tested)
- `components/ScanComparison.tsx` (already complete, tested)
- `app/scans/compare/page.tsx` (already complete)

---

## 10. Files changed in Step 43

This step is an audit and planning step — **no source code was changed**.

| File                                      | Action                         |
| ----------------------------------------- | ------------------------------ |
| `docs/Step43-product-capability-audit.md` | Created (this document)        |
| `docs/Step43.md`                          | Read (spec only, not modified) |

No `.ts`, `.tsx`, or `.css` files were modified. No tests were modified. No API endpoints were added or changed.

---

## 11. Validation

Because no source code was changed, the repository remains in its post-Step-42 state (green):

| Check             | Status | Details                            |
| ----------------- | ------ | ---------------------------------- |
| Typecheck         | ✅     | 0 errors                           |
| Tests             | ✅     | 1532 passed, 18 skipped (84 files) |
| ESLint            | ✅     | 0 errors                           |
| Prettier          | ✅     | All source files formatted         |
| Build             | ✅     | Next.js build compiled             |
| Circular deps     | ✅     | No cycles                          |
| `jsx: "preserve"` | ✅     | Intact in `apps/web/tsconfig.json` |

Validation was run to confirm the audit introduced no regressions:

```bash
pnpm typecheck   → 0 errors
pnpm test        → 1532 passed, 18 skipped
pnpm lint        → ESLint PASS, Prettier PASS (source files only)
pnpm build       → ✅ Compiled successfully
npx madge        → No circular dependency found
```

**Note:** The audit itself did not modify any source files, so the validation simply confirms the repository remains green from Step 42 (commit `31baa67`).

---

## 12. Risks / unknowns

1. **Synchronous scan execution blocks POST /api/scans.** The scan creation endpoint runs crawler + detectors + persistence synchronously. For slow targets, the request may take a long time. This affects the "rescan" candidate (re-running would block) but does NOT affect the comparison selector proposal (comparison is read-only, uses existing persisted results).

2. **Dead code in `comparison-api.ts`.** The `fetchComparison` and `compareScanResults` functions are exported but never imported anywhere in the app. The compare page does its own fetch + compare. Step 44 should avoid importing from `comparison-api.ts` — use the existing pattern (fetch via `fetchScanById`, compare via `compareScans`).

3. **Scan history cards lack detection counts.** The `ScanCard` component only shows target, hostname, and timestamp — not detection count. The comparison selector will need to either show scan metadata or just IDs. This is a pre-existing limitation, not something Step 44 needs to fix.

4. **No navigation bar.** The home page only links to the technology catalog. Users must know/guess the `/scans` URL. This makes the product hard to discover. Step 44 should consider adding a "Back to scan history" link from the selector, but a full navigation bar is out of scope.

5. **Comparison only works for completed scans.** Comparing two scans where either is pending/running/failed shows limitations. The selector should only list completed scans (or clearly indicate non-completed scans are not selectable).

6. **No scan deletion.** Users cannot remove scans. If they accidentally compare the wrong scans, they can't clean up. This is a pre-existing limitation.

7. **`evidenceKey` re-export in `comparison.ts`** (from Step 42): `comparison.ts` still exports `evidenceKey` as a re-export of `getEvidenceIdentity`. The dead code in `comparison-api.ts` should eventually be cleaned up or removed, but that's out of scope for Step 43/44.

---

## 13. Why this is the next logical product capability

**Scan-to-scan comparison is the single most impactful missing feature** because:

1. **It's the only unfinished major workflow.** Every other core capability (scan creation, scan detail, technology catalog, evidence exploration, explainability, coverage) is fully implemented and presented. Comparison is the lone exception — the backend logic and rendering are complete, but there is no user-facing entry point.

2. **It completes the "scan → analyze → compare" loop.** Today, DevLens is a snapshot tool: you scan a site, you see what it detected. But you can't answer "what changed since last time?" — which is the fundamental question a website monitoring tool should answer.

3. **It's the smallest gap with the largest impact.** All the hard parts (comparison logic, evidence matching, rendering, error handling) are done. The remaining work is a selection UI — a client component that already has all the data it needs from the existing scan history endpoint.

4. **It reuses 100% of existing infrastructure.** No backend, API, domain, or persistence changes. No new dependencies. Just a new presentation component that wires existing pieces together.

5. **It moves DevLens toward a complete usable workflow.** The current product requires users to manually construct URLs to use comparison. Adding a selection UI makes the feature actually usable — transforming it from "hidden, broken" to "discoverable, functional."

No other candidate (rescan, navigation bar, technology-driven discovery) satisfies the same combination of user-facing value, architectural coherence, incremental implementability, and reuse of existing infrastructure.
