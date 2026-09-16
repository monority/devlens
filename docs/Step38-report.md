# Step 38: Detection Results / Technology Evidence Report

## Objective
Implement deterministic ordering, deduplication, and evidence rendering for
detection results on `/scans/{id}`. This is a presentation/UX improvement
based exclusively on existing scan data — no detection behavior changes.

## Inspected Architecture

### Current rendering path (before Step 38):
```
ScanDetailView (pure orchestrator)
  ├── ScanOverview (Step 37 — compact header with metrics)
  ├── ScanInsights (Step 32 — technology insights for completed scans)
  ├── Snapshot / ScanningState
  └── Detections section
      ├── DetectionFilterView (Step 36 — client-side URL-linked filtering)
      │     ├── DetectionFilters (filter controls)
      │     └── DetectionList (renders filtered detections in API order)
      └── DetectionList (fallback for completed scans without initialQuery)
```

### Existing detection/evidence components:
- **`DetectionList`** — `<ol>` of `DetectionItem` or `EmptyDetections`
- **`DetectionItem`** — technology name (Link if known), category, confidence,
  explanation summary, evidence disclosure (`<details>`)
- **`EvidenceList`** — collapsible `<details>`/`<summary>` wrapper
- **`EvidenceItem`** — per-evidence-type rendering via `evidence-presenter`
- **`evidence-presenter.ts`** — `evidenceTypeLabel()`, `evidenceFields()`,
  `evidenceIsUrl()`, `evidenceUrl()` (pure, no React)
- **`detection-explanation.ts`** — `getDetectionExplanation()` (pure)
- **`scan-insights.ts`** — `getScanInsights()`, `getTechnologyEvidenceMatrix()`
  with private `evidenceIdentity()` and `deduplicateEvidence()` helpers

### Key observation
`DetectionList` renders detections in **API-returned order** (no sorting).
Evidence is rendered in API order (no deduplication in the detection list).
The `evidenceIdentity` canonical key exists in `scan-insights.ts` (private).

## Files Created
| File | Tests | Description |
|------|-------|-------------|
| `lib/scan-detection-results.ts` | — | Pure: `getScanDetectionResults()` — sorts (confidence DESC, name ASC, id ASC), dedupes by tech ID, dedupes + sorts evidence |
| `lib/scan-detection-results.test.ts` | 14 | Pure unit tests (empty, single, sorting, tie-breakers, dedup, immutability, determinism) |
| `components/ScanDetectionResults.tsx` | — | Pure presentation component — wraps `getScanDetectionResults()` + `DetectionList` |
| `components/ScanDetectionResults.test.tsx` | 11 | renderToString tests (tech name, confidence, evidence, sorting, empty state, semantics, dedup) |

## Files Modified
| File | Change |
|------|--------|
| `components/DetectionFilterView.tsx` | Replaced `DetectionList` with `ScanDetectionResults` (sorted results inside filters) |
| `components/ScanViews.tsx` | Completed scans without `initialQuery` now use `ScanDetectionResults` (sorted); failed scans keep `DetectionList` |
| `components/ScanViews.test.tsx` | +5 integration tests (overview metrics, non-completed, zero det, filter stability, dual rendering) |

## Presentation Model

`getScanDetectionResults(detections: DetectionResponse[]): DetectionResponse[]`

- **Input**: Already-filtered detections (from Step 36's `filterDetections`)
- **Output**: Same `DetectionResponse[]` type — no new model introduced
- **Rationale**: The existing `DetectionResponse` already contains all UI-required
  fields. The spec explicitly says "Do NOT blindly copy this structure if the
  existing domain models already provide a better boundary."

### Ordering rules (deterministic):
1. Confidence DESC (highest first)
2. Technology name ASC (alphabetical tie-breaker)
3. Technology ID ASC (final tie-breaker)

### Deduplication:
- **Detections**: by technology ID (first after sort wins = highest confidence)
- **Evidence**: by canonical `evidenceIdentity` key (same algorithm as
  `scan-insights.ts` `getTechnologyEvidenceMatrix` — reused, not duplicated)
- **Evidence ordering**: by type label ASC, then canonical key ASC

## Evidence Rendering Strategy

The existing `EvidenceItem` component is reused unchanged. Evidence is:
- Deduplicated using the same `evidenceIdentity` algorithm from `scan-insights.ts`
- Sorted by type label (alphabetical) then by canonical key (deterministic)
- Rendered via the existing `EvidenceList` → `EvidenceItem` pipeline
- All 8 evidence types handled (http_header, meta_tag, script_url, script_content,
  html, javascript_global, resource, link)

No new evidence rendering was introduced — the existing `EvidenceItem` already
handles all types safely.

## Filtering Behavior (Step 36 interaction)

- `filterDetections()` (Step 36) filters **without reordering** (preserves API order)
- `getScanDetectionResults()` sorts **after** filtering
- `ScanOverview` metrics are **unaffected** by filters (rendered outside `DetectionFilterView`)
- Clearing filters restores the exact deterministic result set
- No duplicate detections appear (deduplicated by tech ID)

### Updated rendering path (after Step 38):
```
ScanDetailView
  ├── ScanOverview (metrics stable regardless of filters)
  ├── ScanInsights
  ├── Snapshot / ScanningState
  └── Detections section
      ├── DetectionFilterView (Step 36)
      │     ├── DetectionFilters
      │     └── ScanDetectionResults (calls getScanDetectionResults on filtered list)
      └── ScanDetectionResults (fallback for completed scans without initialQuery)
      DetectionList (failed scans only — preserves existing behavior)
```

## Accessibility Decisions
- Semantic HTML: `<h2>` for section heading, `<ol>`/`<li>` for ordered list
- Status rendered as text + color badge (not color-only)
- Confidence displayed as text ("Confidence: 95%") — not color-dependent
- Evidence disclosure uses native `<details>`/`<summary>` (keyboard-operable)
- No ARIA attributes added (semantic HTML suffices)
- `<time>` elements with `dateTime` attribute for machine-readable dates
- No hover-only information

## Tests Added
### Pure tests (`scan-detection-results.test.ts`) — 14 tests:
1. Empty detections
2. Single detection
3. Sort by confidence descending
4. Alphabetical tie-breaker (name ASC)
5. Technology ID tie-breaker (id ASC)
6. Deduplicate by tech ID (keeps highest confidence)
7. Exact confidence preservation
8. Exact evidence value preservation
9. Evidence deduplication (existing domain semantics)
10. Multiple evidence types
11. Deterministic evidence ordering
12. Immutability (no input mutation)
13. Deterministic output
14. Detection ID/name/category preserved

### Component tests (`ScanDetectionResults.test.tsx`) — 11 tests:
1. Technology name renders
2. Confidence renders
3. Evidence count renders
4. Evidence values render
5. Evidence type renders
6. Multiple detections in confidence-descending order
7. Empty state for zero detections
8. Semantic headings and list elements
9. Accessible evidence disclosure
10. Non-completed scan behavior unchanged
11. Duplicate tech IDs deduplicated

### Integration tests (`ScanViews.test.tsx`) — 5 tests:
1. Overview metrics render for completed scans
2. Overview absent for non-completed scans
3. Zero-detection overview state
4. Overview metrics stable when filters active
5. Overview + detection list render together

## Validation Results

| # | Check | Command | Status |
|---|-------|---------|--------|
| 1 | Typecheck | `tsc --noEmit` | ✅ 0 errors |
| 2 | Tests | `vitest run` | ✅ **1452 passed**, 18 skipped (80 files) |
| 3 | ESLint | `eslint .` | ✅ 0 errors |
| 4 | Prettier | `prettier --check .` | ✅ All files formatted |
| 5 | Build | `next build` | ✅ Compiled successfully |
| 6 | Circular deps | `npx madge --circular --extensions ts packages apps` | ✅ No cycles |
| 7 | tsconfig | `grep '"jsx": "preserve"'` | ✅ `"jsx": "preserve"` intact |

## Security
- All scan-derived strings rendered via React escaping (no `dangerouslySetInnerHTML`)
- URL evidence rendered with `target="_blank" rel="noopener noreferrer"` (existing `EvidenceItem` pattern)
- No javascript:/data: URL navigation (existing `EvidenceItem` only links for URL-type evidence)
- No untrusted HTML injection

## Known Limitations
- Evidence deduplication uses the same algorithm as `scan-insights.ts` but is
  not shared via a common module — both implementations are identical copies.
  Extracted to avoid changing the existing module boundary (spec says "do not
  unnecessarily restructure").
- Date formatting uses UTC for determinism; user's local timezone is not
  reflected in the displayed date string.

## Non-Goals (explicitly NOT done)
- No API contract changes
- No database schema changes
- No detector modifications
- No scoring changes
- No crawler changes
- No evidence semantics changes
- No new filtering system
- No new dependencies
- No new API endpoints
- No charts/gauges/animations
- No AI/LLM functionality
- No confidence recalculation

## Git
Commit: `Step 38: Detection Results Evidence Report`
Push: Blocked (no GitHub credentials available)
