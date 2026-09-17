# Step 45 Audit

## Current state

### What exists

**Route**: `GET /scans/compare?left=<id>&right=<id>` — server component
(`apps/web/src/app/scans/compare/page.tsx`).

The page wraps `ScanComparison` in a `<main>` with a header that renders:

- `h1` "Scan Comparison"
- subtitle: `Comparing scan <code>{left}</code> with scan <code>{right}</code>`
- (on error): a back link "← Back to scan history"

**Component**: `ScanComparison`
(`apps/web/src/components/ScanComparison.tsx`) — pure presentation component
receiving a `ComparisonResult`. It renders:

1. `ComparisonHeader` — **duplicate** `h1` "Scan Comparison" + two-column
   layout: "Previous / Left" → `<ScanSummary>` (scan ID, status badge, target,
   hostname, created/started/completed/failed timestamps), "Current / Right"
   → `<ScanSummary>`.
2. `targetsDiffer` notice — amber callout listing both targets.
3. `leftFailed` / `rightFailed` notice — red callout: "Limited comparison",
   "Detection comparison is unavailable for failed scans."
4. `TechnologyChanges`:
   - If `!hasChanges`: "No detection changes" (gray box).
   - If `hasChanges`:
     - "Added (N)" — list of `<TechnologyComparisonItem>` (added badge +
       name + category)
     - "Removed (N)" — list (removed badge + name + category)
     - "Present in both (N)" — list (unchanged badge + name + category +
       score delta if changed + inline evidence changes)
     - "Score / confidence changes (N)" — table (Technology | Previous |
       Current | Change)
     - "Evidence changes" — flat table (Status | Type | Evidence) for ALL
       technologies, not per-tech
   - Each `TechnologyComparisonItem` also shows inline `<EvidenceChangeList>`
     when that specific technology has evidence changes.

**Error handling**:

- Missing params (`?left` or `?right` absent): `MissingParams` component —
  "Missing scan IDs" message + back link.
- API error (500): `ScansError` — "Unable to load scans."
- 404 (one or both scans not found): handled inside `ScanComparison` via
  `ComparisonError` — "Unable to compare scans: One or both of the requested
  scans could not be found: left scan and/or right scan" + "← Back to scan
  history" link.

### What is NOT present on the comparison page

- **No navigation bar** — no link to scan history in the header (only in
  error states). The page subtitle shows raw scan IDs in `<code>` tags.
- **No scan overview metrics** — `ScanSummary` (used in the header) shows
  target, hostname, timestamps, and error info — but NOT technology count,
  evidence count, or highest confidence. The richer `ScanOverview` component
  (which shows these metrics) is **not used** on the comparison page.
- **No link to scan detail** — cannot navigate from a technology in the
  comparison to its full detection detail on `/scans/{id}`.
- **No "Copy report link" or "Export JSON"** actions (available on scan
  detail but not comparison).
- **No responsive behavior** for the two-column side-by-side summary —
  uses `grid-template-columns: 1fr` (single column) on mobile,
  `1fr 1fr` (two columns) on `min-width: 768px`. No further responsive
  handling.

---

## Existing comparison model

### Input

`compareScans(left: ScanDetailResponse | null, right: ScanDetailResponse | null)`

Both inputs are nullable (404 produces `null`).

### What constitutes a comparison

A `ComparisonResult` object with:

| Field                            | Type                         | Meaning                                             |
| -------------------------------- | ---------------------------- | --------------------------------------------------- |
| `left` / `right`                 | `ScanDetailResponse \| null` | Raw scan results (null = not found)                 |
| `leftNotFound` / `rightNotFound` | `boolean`                    | 404 flags                                           |
| `hasBoth`                        | `boolean`                    | Both scans resolved                                 |
| `targetsDiffer`                  | `boolean`                    | Scan targets differ                                 |
| `leftFailed` / `rightFailed`     | `boolean`                    | Either scan has `status: 'failed'`                  |
| `technologies`                   | `TechnologyComparison[]`     | All technologies (union by ID)                      |
| `added`                          | `TechnologyComparison[]`     | In right but not left                               |
| `removed`                        | `TechnologyComparison[]`     | In left but not right                               |
| `unchanged`                      | `TechnologyComparison[]`     | In both                                             |
| `scoreChanges`                   | `TechnologyComparison[]`     | In both, confidence differs                         |
| `evidenceChanges`                | `EvidenceComparison[]`       | Flat list across all unchanged techs                |
| `hasChanges`                     | `boolean`                    | Any additions, removals, score, or evidence changes |

### Technology classification

- **Identity**: by `technology.id` (stable string key, NOT display name, NOT
  array order).
- **Status**: `added` / `removed` / `unchanged` — determined by presence in
  left/right maps.
- **Score change**: `leftConfidence !== rightConfidence` for technologies
  present in both. Delta = `rightConfidence - leftConfidence`.
- **Ordering**: `compareScans()` uses `Set` iteration which follows insertion
  order (left-first, then right-only). The output order is deterministic.

### Evidence representation

- **Identity**: `getEvidenceIdentity(item)` — canonical key per evidence type
  (e.g. `http_header:Server`, `meta_tag:generator`).
- **Status**: `added` / `removed` / `unchanged` — matched by identity key.
- Evidence comparison is **only computed for technologies present in both**
  scans (unchanged status). Added/removed technologies have empty
  `evidenceChanges` arrays.

### Does the model have enough information for a good UI?

**Yes.** The model is rich enough:

- Full `ScanDetailResponse` objects (with detections + evidence) are passed
  through — nothing is lost.
- `added`, `removed`, `unchanged`, `scoreChanges` are pre-filtered.
- `evidenceChanges` has both left and right evidence items for each change.
- All counts are available via `.length` on the pre-filtered arrays.
- The `ComparisonResult` includes both scan objects, so any metadata
  (target, hostname, timestamps, metrics) is available.

**No model change is needed.** The gap is purely presentational.

---

## Existing reusable UI

### Components that can be reused directly

| Component             | Purpose                                                          | Reusability                                              |
| --------------------- | ---------------------------------------------------------------- | -------------------------------------------------------- |
| `ScanSummary`         | Scan metadata block (target, hostname, timestamps, error)        | Already used in `ComparisonHeader`                       |
| `ScanOverview`        | Compact metrics (tech count, evidence count, highest confidence) | **NOT used** on comparison page — available for reuse    |
| `EvidenceItem`        | Renders a single evidence item (type label, fields, URL link)    | Already used in `ScanComparison` via `EvidenceChangeRow` |
| `EvidenceList`        | Collapsible evidence tree                                        | NOT used in comparison — available                       |
| `DetectionList`       | Renders a ranked list of detections with `DetectionItem`         | NOT used in comparison — available                       |
| `DetectionCoverage`   | Evidence coverage summary (deduplicated count + type breakdown)  | NOT used in comparison — available                       |
| `ScanInsights`        | Technology category composition + evidence matrix                | NOT used in comparison — available                       |
| `evidenceTypeLabel()` | Maps evidence type → human label                                 | Already used in `ScanComparison`                         |
| `evidenceFields()`    | Extracts display fields from evidence item                       | Already used in `ScanComparison`                         |
| `getScanOverview()`   | Computes compact metrics from `ScanDetailResponse`               | NOT used on comparison page — available                  |

### CSS classes already available

From `ScanCard.module.css`:

- `.comparison`, `.comparisonHeader`, `.comparisonSides`, `.comparisonSide`
- `.comparisonError`, `.comparisonErrorLink`
- `.targetWarning`, `.targetList`
- `.failedNotice`
- `.techChanges`, `.changeList`, `.changeItem`
- `.changeBadge`, `.addedBadge`, `.removedBadge`, `.unchangedBadge`
- `.scoreTable`, `.evidenceTable`
- `.noChanges`, `.noEvidenceChanges`
- `.scanOverview`, `.overviewMetrics`, `.overviewMetric`

### What is NOT reusable without changes

- `ScanComparison` itself is the comparison renderer — it should remain the
  single source of truth.
- `ScanDetailView` is the scan detail orchestrator — it assumes a single
  scan, not a comparison pair. Not directly reusable.
- `ScanLifecycle` (polling) — not relevant for comparison.

---

## UX gaps

### MUST HAVE for Step 45

1. **Duplicate `<h1>` on the comparison page** — both `page.tsx` and
   `ComparisonHeader` render "Scan Comparison" as `h1`. The page-level
   `h1` should be the only one; the component-level `h1` inside
   `ComparisonHeader` is redundant and should be demoted to `h2` or
   removed.

2. **No scan metrics in the comparison header** — `ScanSummary` shows
   timestamps and target, but not technology count, evidence count, or
   confidence. Users comparing two scans can't quickly see which scan
   had more detections. `ScanOverview` + `getScanOverview()` exist and
   are ready to use.

3. **"No detection changes" is a dead end** — when `hasChanges` is
   false, the result is a gray box with "No detection changes" and no
   further information. There's no summary of what WAS detected, and
   no link to view either scan's full detail.

4. **Scan IDs in the page subtitle are raw** — "Comparing scan scan_a
   with scan scan_b" shows raw IDs in `<code>` tags. The target URLs
   or scan timestamps would be more useful.

5. **No back-to-history link in the success state** — the success
   path (both scans found) has no "← Back to scan history" link. Only
   the error/missing-state paths have it.

### SHOULD HAVE (later)

6. **Click-through to scan detail** from comparison technologies —
   not essential for a coherent comparison view, but would improve
   UX significantly.

7. **Evidence changes should be grouped per-technology** rather than
   a single flat table at the section level — currently the
   `TechnologyComparisonItem` does show inline evidence changes for
   that technology, but the section-level `EvidenceChangeList`
   duplicates this in a flat list. The section-level table could be
   removed or made collapsible.

8. **Copy/Share link for the comparison** — "Copy report link" button
   (available on scan detail) is not present on the comparison page.

9. **Export comparison as JSON** — not available on the comparison page.

### OUT OF SCOPE

10. Adding a new comparison engine, modifying `compareScans()` semantics,
    changing evidence identity, changing detection scoring.

11. Modifying the scan detail page itself.

12. Adding new API endpoints or persistence queries.

13. Rescan functionality.

14. Historical evolution over more than two scans.

15. Technology catalog integration in comparison.

16. Dashboard-level metrics or trend visualization.

---

## Proposed Step 45 scope

### Recommendation: Presentational polish of the existing comparison page

Add a **comparison summary bar** above the technology changes section,
and **fix the duplicate h1**, and **add `ScanOverview` metrics** to the
comparison header sides.

#### Concrete changes

1. **Demote the component-level `h1`** in `ComparisonHeader` to `h2`
   (or remove it — the page already has `h1` "Scan Comparison").
   _File_: `apps/web/src/components/ScanComparison.tsx` (line 94:
   `<h1>Scan Comparison</h1>` → remove or change to `h2`).

2. **Replace `ScanSummary` in `ComparisonHeader` with `ScanOverview`**
   (which wraps `ScanSummary` + metrics). This adds technology count,
   evidence count, and highest confidence to each side.
   _File_: `apps/web/src/components/ScanComparison.tsx` — import
   `ScanOverview` and `getScanOverview`, use on completed scans.
   _Precedent_: `ScanDetailView` already uses `ScanOverview` for
   completed scans (line 286 of `ScanViews.tsx`).

3. **Add a comparison summary bar** between the header and technology
   changes, showing counts from the `ComparisonResult`:
   - Added: N
   - Removed: N
   - Changed scores: N
   - Evidence changes: N
   - Has changes: Yes/No
     _File_: `apps/web/src/components/ScanComparison.tsx` — new
     `ComparisonSummary` sub-component.
     _Files_: CSS classes in `ScanCard.module.css`.

4. **Add "Back to scan history" link** on the success path.
   _File_: `apps/web/src/components/ScanComparison.tsx` (or the
   page wrapper in `page.tsx`).

#### What stays untouched

- `compareScans()` — semantics unchanged
- `comparison.ts` — no changes
- `evidence-identity.ts` — no changes
- `/scans/compare` page route — no structural changes
- Persistence, API, crawler — no changes

#### What gets reused

- `getScanOverview()` + `ScanOverview` component (already built, tested)
- Existing CSS classes (`.comparison`, `.comparisonHeader`, etc.)
- `changeList`, `changeItem`, `changeBadge`, `addedBadge`,
  `removedBadge`, `unchangedBadge` CSS classes

---

## Files likely to change

| File                                              | Change                                                                                                       |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `apps/web/src/components/ScanComparison.tsx`      | Demote duplicate h1 → h2, use `ScanOverview` in header, add `ComparisonSummary` sub-component, add back link |
| `apps/web/src/components/ScanCard.module.css`     | Add `.comparisonSummary` class + summary bar styling                                                         |
| `apps/web/src/components/ScanComparison.test.tsx` | Update test for demoted h1 (if present in assertions), add tests for summary bar rendering                   |

No files need to be created. No domain, API, or persistence changes.

---

## Tests

### Existing tests (unchanged, still valid)

- `comparison.test.ts` — 17 tests for `compareScans()` ✓ (no changes needed)
- `ScanComparison.test.tsx` — 8 tests for presentation ✓ (one test asserts
  `'Scan Comparison'` text — this will still pass since the title text is
  unchanged, only the heading level changes. May need to update if a test
  checks `<h1>` specifically.)

### New tests to add

1. **Duplicate h1 removed**: verify `ScanComparison` renders exactly one
   `h1` (the page-level one is in `page.tsx`, outside the component).
   In the component, the header h1 should become h2 or be removed.

2. **Summary bar renders with correct counts**: create a `ComparisonResult`
   via `compareScans()` with known additions/removals/score changes, verify
   the summary bar shows "Added (N)", "Removed (N)", "Changed (N)".

3. **Summary bar shows "No changes" state**: when `hasChanges` is false,
   verify the summary shows "No changes" or similar.

4. **ScanOverview metrics in comparison header**: verify the completed
   scan sides show technology count, evidence count, highest confidence.

5. **Back to scan history link present on success**: verify a link to
   `/scans` exists in the success rendering.

### Test approach

Same as existing: `renderToString` from `react-dom/server` + `vitest`.
Mock `next/link` to render plain `<a>` (same pattern as
`ScanComparison.test.tsx` already uses).

---

## Validation

```bash
# Targeted (new + modified test files)
npx vitest run apps/web/src/components/ScanComparison.test.tsx
npx vitest run apps/web/src/lib/comparison.test.ts

# Full suite
npx vitest run

# TypeScript
npx tsc --noEmit -p apps/web/tsconfig.json

# ESLint
npx eslint .

# Prettier (source files only)
npx prettier --check apps/

# Build
cd apps/web && npx next build

# Circular dependency check
npx madge --circular --extensions ts apps packages

# Verify jsx:preserve preserved
grep '"jsx": "preserve"' apps/web/tsconfig.json
```

---

## Risk / compatibility

| Risk                                                           | Likelihood   | Mitigation                                                                                              |
| -------------------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------- |
| Duplicate h1 removal breaks existing test assertions           | Low          | Only 1 test checks 'Scan Comparison' text (not heading level)                                           |
| ScanOverview requires `getScanOverview()` call on server page  | Low          | `ScanOverview` is a pure component; `getScanOverview()` is pure and already imported in `ScanViews.tsx` |
| CSS class additions conflict with existing styles              | Low          | New `.comparisonSummary` class is namespaced; existing classes reused                                   |
| `ScanOverview` shows 0/— for zero-detection scans              | Low          | `ScanOverview` already handles `hasDetections = false` (shows '—' for confidence)                       |
| Comparison page fetches show raw scan objects (large payloads) | Not a change | Existing behavior — `fetchScanById` already returns full `ScanDetailResponse`                           |

**No backward-compatibility risk**: The `ComparisonResult` model is unchanged. All changes are additive (new summary bar) or corrective (duplicate h1 removal, metrics in header). Existing comparison tests remain valid.

---

## Summary of what Step 45 should do

**Goal**: Make the comparison page feel like a coherent DevLens surface by
adding a summary bar, showing scan metrics in the header, fixing the
duplicate h1, and adding a back link.

**Size**: ~50 lines of component changes + ~20 lines of CSS + ~3 test
additions. Small, safe, and builds entirely on existing infrastructure.

**Not needed**: Any new domain logic, API changes, or detection
modifications. The comparison engine is already complete.

READY FOR IMPLEMENTATION: YES
