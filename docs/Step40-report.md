# Step 40: Detection Coverage Summary

## Objective

Implement Step 40:

## "Detection Coverage Summary"

Improve the completed scan report with a compact, factual summary of the evidence and detection coverage.

The summary should help answer:

1. How many technologies were detected?
2. How much supporting evidence exists?
3. How many distinct evidence types contributed?
4. Which evidence types are represented?

This is a presentation/reporting feature.

It must NOT modify:
- detector behavior
- scoring
- crawling
- persistence
- API contracts
- evidence generation

## Phase 0 — Inspection Results

Inspected and found:

### `ScanOverview` (`lib/scan-overview.ts`)
- `technologyCount`: unique technology IDs (Set-based dedup) — **single source of truth for "how many technologies"**
- `evidenceCount`: raw sum of `detection.evidence.length` (NOT deduplicated)
- `highestConfidence`: max confidence value or null

### `ScanInsights` (`lib/scan-insights.ts`)
- `technologyCount`: `detections.length` (raw detection count, NOT unique — **intentionally different** from ScanOverview)
- `evidenceCount`: raw sum of `detection.evidence.length` (same formula as ScanOverview, NOT deduplicated)
- `evidenceTypes`: per-type counts (sorted by count DESC, type ASC) — with per-type item counts
- `technologyComposition`: grouped by category, deduplicated by ID
- `technologyEvidenceMatrix`: per-technology evidence types and counts (deduplicated via `evidenceIdentity`)

### `getScanDetectionResults` (Step 38)
- Deduplicates detections by technology ID
- Deduplicates evidence within each detection using canonical `evidenceIdentity`
- Sorts evidence deterministically (type label ASC, then canonical key ASC)

### `getDetectionExplainability` (Step 39)
- Provides per-evidence source descriptions and type labels
- Reuses `evidenceTypeLabel()` from `evidence-presenter.ts`

### `evidenceIdentity` (private in `scan-insights.ts`, replicated in `scan-detection-results.ts` and `detection-coverage.ts`)
- Canonical identity: type-specific primary identifier per evidence type
- Used for deduplication: `html:{selector}`, `http_header:{name}`, `script_url:{url}`, etc.

### Key finding
`ScanInsights` already exposes some of this information:
- `evidenceTypes` — per-type counts (sorted by count DESC)
- `evidenceCount` — raw sum of evidence items
- `technologyCount` — raw detection count (NOT unique)

However:
- The evidence count is NOT deduplicated — both `ScanOverview` and `ScanInsights` use the raw sum
- The evidence type list is sorted by count DESC, not alphabetically — no deterministic stable sort for type labels alone
- There is no compact, globally-stable coverage summary component in the UI
- `ScanInsights` shows evidence types with per-type counts (detailed) — it does NOT show evidence types as a compact label list

### Decision
Create a new `lib/detection-coverage.ts` module with `getDetectionCoverage()` that:
- Counts **unique** technology IDs (reusing Step 37 `ScanOverview` semantics — NOT the raw `ScanInsights.technologyCount`)
- Counts **deduplicated** evidence using the canonical `evidenceIdentity` (different from the raw sums in both `ScanOverview` and `ScanInsights`)
- Lists **unique evidence type labels**, sorted alphabetically ASC (deterministic stable order)

This introduces a **deduplicated evidence count** — a new, semantically distinct metric that adds value. It does NOT duplicate existing metrics:
- Technology count = matches `ScanOverview.technologyCount` (unique IDs)
- Evidence count = deduplicated (different from raw sums in ScanOverview/ScanInsights)
- Evidence type count/labels = compact alphabetical list (different from ScanInsights' count-sorted breakdown)

## Presentation Boundary

Created **`lib/detection-coverage.ts`** — a pure module:

```ts
interface DetectionCoverage {
  technologyCount: number;     // unique tech IDs (matches ScanOverview)
  detectionCount: number;      // raw detection entries (matches ScanInsights)
  evidenceCount: number;       // deduplicated via evidenceIdentity (NEW)
  evidenceTypeCount: number;   // distinct evidence types
  evidenceTypes: string[];     // unique labels, sorted alphabetically ASC
}
```

- `getDetectionCoverage(detections: DetectionResponse[]): DetectionCoverage`
- Pure, deterministic, synchronous, immutable, React-free
- Reuses `evidenceTypeLabel()` from `evidence-presenter.ts` (no new label mapping)
- Reuses `evidenceIdentity` semantics from `scan-insights.ts` (replicated per existing pattern — no export to avoid modifying existing module boundary)

## Counting Semantics (documented)

| Metric | DetectionCoverage | ScanOverview | ScanInsights |
|--------|-------------------|--------------|--------------|
| Technology count | Unique tech IDs | Unique tech IDs | Raw detection count |
| Detection count | `detections.length` | N/A | `detections.length` |
| Evidence count | **Deduplicated** | Raw sum | Raw sum |
| Evidence types | Alphabetical, no counts | N/A | Count DESC, with counts |

The deduplicated evidence count in DetectionCoverage is intentionally different from both ScanOverview and ScanInsights (which use raw sums). This is the single authoritative meaning for deduplicated evidence coverage. The other two modules intentionally use raw counts for different purposes (ScanOverview for high-level summary, ScanInsights for detailed breakdown).

## UI Structure

Created **`components/DetectionCoverage.tsx`** — a pure presentation component:
- Receives `detections: DetectionResponse[]` (unfiltered — global scan data)
- Shows only evidence type count and labels + deduplicated evidence count
- Does NOT duplicate ScanOverview's technology count or raw evidence count
- Does NOT duplicate ScanInsights' per-type-count breakdown

Render hierarchy:
```text
ScanOverview
    ↓
ScanInsights
    ↓
Detection coverage       ← Step 40 (compact, global)
    └── Evidence types: N
    └── HTTP Header · HTML Element · Link
    └── Evidence items: N (deduplicated)
    ↓
Detection results (ScanDetectionResults / DetectionFilterView)
```

The coverage section is visually subordinate to ScanOverview — small, compact box with border.

## Evidence Type Distribution

Evidence types are shown as a compact, alphabetically-sorted list using existing `evidenceTypeLabel()` labels:

```
HTTP Header · HTML Element · JavaScript Global · Link · Meta Tag · Resource URL · Script Content · Script URL
```

For zero evidence (completed scan with no detections, or detections with empty evidence):
```
No evidence available
```

## Filtering

Coverage describes the **scan**, not the filtered subset:

```
ScanOverview
    └── global scan metrics (stable)

DetectionCoverage
    └── global scan evidence coverage (stable)

DetectionFilterView
    └── filtered presentation only
```

Applying a technology or category filter does NOT change:
- technology count
- evidence count
- evidence type count
- evidence type labels

This is verified by integration test "coverage data remains stable when filter is active."

## Accessibility Decisions

- Section has a meaningful heading: "Detection coverage"
- Metrics represented as text (not color-only)
- Evidence types readable as text content (in list items)
- No color-only communication (types are text in styled spans)
- No hover-only information
- Uses semantic `<section>`, `<dl>/<dt>/<dd>`, `<ul>/<li>` elements

## Empty States

| State | Behavior |
|-------|----------|
| Completed + detections | Render coverage with evidence types and counts |
| Completed + zero detections | "No evidence available" within coverage section |
| Pending/running | Coverage not rendered (same as ScanInsights) |
| Failed | Coverage not rendered (same as ScanInsights) |

## Files Created

| File | Tests | Description |
|------|-------|-------------|
| `lib/detection-coverage.ts` | — | Pure: `getDetectionCoverage()` — global deduplicated coverage summary |
| `lib/detection-coverage.test.ts` | 13 | Pure tests (zero, one, multiple, tech dedup, evidence dedup, types, type dedup, alphabetical sort, mixed, immutability, determinism, detectionCount vs techCount, all 8 types) |
| `components/DetectionCoverage.tsx` | — | Pure presentation component (renders coverage summary) |
| `components/DetectionCoverage.test.tsx` | 8 | Component tests (deduplicated count, type count, labels, empty state, semantic structure, no duplication, global stability) |

## Files Modified

| File | Change |
|------|--------|
| `components/ScanViews.tsx` | Added `DetectionCoverage` after `ScanInsights` for completed scans (4 lines) |
| `components/ScanViews.test.tsx` | +5 integration tests (coverage renders, non-completed excluded, failed excluded, filter stability, zero-detection empty state) |
| `components/ScanCard.module.css` | +33 lines for `.detectionCoverage`, `.coverageMeta`, `.coverageMeta dt/dd`, `.coverageEmpty`, `.evidenceTypeListCompact`, `.evidenceTypeItemCompact` |

## Tests

### Pure tests (`detection-coverage.test.ts`) — 13 tests:
1. Zero detections — all counts zero, empty types
2. One technology — correct counts
3. Multiple technologies — unique tech count
4. Duplicate technology IDs — technologyCount < detectionCount
5. Evidence deduplication — global identity-based dedup
6. Multiple evidence types — correct type count
7. Duplicate evidence types — types deduplicated
8. Alphabetical evidence type sorting
9. Multiple detections with mixed types
10. Immutability — input not mutated
11. Determinism — same input → same output
12. detectionCount vs technologyCount distinction
13. All 8 evidence types — correct sorted labels

### Component tests (`DetectionCoverage.test.tsx`) — 8 tests:
1. Renders deduplicated evidence count
2. Renders evidence type count
3. Renders evidence type labels
4. Renders empty state for zero evidence
5. Renders semantic section structure (`<section>`, `<dl>`, `<dt>`, `<ul>`)
6. Does not duplicate ScanOverview technology count
7. Does not duplicate ScanOverview raw evidence count
8. Global values stable under filters

### Integration tests (`ScanViews.test.tsx`) — 5 tests:
1. Completed scan renders coverage
2. Non-completed scans do not render coverage
3. Failed scans do not render coverage
4. Coverage stable when filter is active
5. Zero-detection scan shows coverage empty state

## Validation

| # | Check | Command | Status |
|---|-------|---------|--------|
| 1 | Typecheck | `tsc --noEmit` | ✅ 0 errors |
| 2 | Tests | `vitest run` | ✅ 1497 passed, 18 skipped (83 files) |
| 3 | ESLint | `eslint .` | ✅ 0 errors |
| 4 | Prettier | `prettier --check .` | ✅ All files formatted |
| 5 | Build | `next build` | ✅ Compiled successfully |
| 6 | Circular deps | `npx madge --circular --extensions ts` | ✅ No cycles |
| 7 | tsconfig | `grep '"jsx": "preserve"'` | ✅ `"jsx": "preserve"` intact |

### Test count change:
- Step 39 baseline: 1492 passed, 18 skipped
- Step 40 final: 1497 passed, 18 skipped
- Increase: **5 new tests** (5 integration tests in ScanViews.test.tsx)

Note: The `detection-coverage.ts` module, `DetectionCoverage.tsx` component, and their tests were created and committed as part of Step 39's commit (since the coverage module was developed alongside the explainability work). This Step 40 commit finalizes the integration by adding the ScanViews integration tests, creating the Step 40 report, and completing the full validation cycle.

## Regression Requirements (preserved)

- ✅ `ScanOverview` metrics outside filtering (unchanged)
- ✅ `ScanInsights` metrics (unchanged)
- ✅ Deterministic detection ordering from Step 38 (unchanged)
- ✅ Technology deduplication (unchanged)
- ✅ Evidence deduplication (unchanged)
- ✅ Existing `evidenceIdentity` (unchanged)
- ✅ Existing confidence values (unchanged)
- ✅ Pending/running/failed behavior (unchanged)
- ✅ URL-linked detection filtering (unchanged)
- ✅ Detector pipeline (unchanged)
- ✅ Scoring behavior (unchanged)
- ✅ `DetectionList` API-order test (not modified)
- ✅ `DetectionItem` explainability from Step 39 (unchanged)

## Known Limitations

- Coverage is computed from raw detections — it does NOT reflect evidence deduplication that happens at the per-detection level in `ScanDetectionResults` (Step 38). The global deduplication in `getDetectionCoverage()` uses the same `evidenceIdentity` but operates across all detections, which may produce a different count than the sum of per-detection deduplicated counts.
- Evidence type labels use English (e.g., "HTTP Header") — no internationalization.
- No progress bar or visual "coverage score" — intentionally, per the "no fake analytics" constraint.

## Non-Goals (explicitly NOT done)

- No detector algorithm changes
- No evidence generation changes
- No scoring formula changes
- No crawler changes
- No persistence changes
- No API contract changes
- No new dependencies
- No new API endpoints
- No "coverage score" or "health score"
- No confidence recalculation
- No new evidence identity algorithm (reuses existing `evidenceIdentity`)
- No broad refactor of existing modules
- No charts, gradients, or decorative elements

## Git

Commit: `Step 40: Detection Coverage Summary`
Push: Blocked (no GitHub credentials available)
