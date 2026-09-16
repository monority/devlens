# Step 39: Detection Explainability

## Objective

Improve the presentation of each technology detection so the user can understand:

1. What was detected
2. How confident DevLens is
3. Why the technology was detected
4. Which evidence supports the detection
5. Where that evidence originated, when such information already exists

This is a **presentation/reporting step**. It must NOT modify the detection engine.

## Inspected Architecture

### Current rendering path (after Step 38):
```
ScanDetailView (pure orchestrator)
  ├── ScanOverview (Step 37 — compact header with metrics)
  ├── ScanInsights (Step 32 — technology insights)
  ├── Snapshot / ScanningState
  └── Detections section
      ├── DetectionFilterView (Step 36 — URL-linked filtering)
      │     ├── DetectionFilters (filter controls)
      │     └── ScanDetectionResults (Step 38 — sorted + deduped detections)
      └── ScanDetectionResults (fallback for completed scans without initialQuery)
      DetectionList (failed scans only — unchanged)
```

### Existing detection/evidence components inspected:
- **`DetectionItem`** — renders a single detection: tech name (Link if known), category, confidence, explanation summary, evidence count, collapsible `EvidenceList`
- **`DetectionList`** — `<ol>` of `DetectionItem` or `EmptyDetections`
- **`EvidenceList`** — collapsible `<details>`/`<summary>` evidence tree
- **`EvidenceItem`** — renders evidence type label + fields (URL as `<a>`, snippet/selector as `<code>`)
- **`getDetectionExplanation()`** (Step 33) — provides `summary`, `confidence`, `evidenceCount`, `evidenceTypes`
- **`evidence-presenter.ts`** — `evidenceTypeLabel()`, `evidenceFields()`, `evidenceIsUrl()`, `evidenceUrl()`
- **`evidenceIdentity()`** (Step 38) — canonical evidence identity used for deduplication
- **`getScanDetectionResults()`** (Step 38) — deterministic sorting + deduplication

### Evidence types (8 variants in `EvidenceResponse`):
| `type` | Fields | Origin context |
|--------|--------|----------------|
| `http_header` | `name`, `value` | HTTP response header |
| `meta_tag` | `name`, `content` | HTML `<meta>` element |
| `script_url` | `url` | External script source |
| `script_content` | `snippet` | Inline JavaScript |
| `html` | `selector`, `snippet` | DOM element |
| `javascript_global` | `globalName` | JS global scope |
| `resource` | `url` | Resource URL |
| `link` | `url` | Linked resource |

### Key finding
All evidence already contains its origin context in its fields:
- `http_header` → header `name` (e.g., "Server")
- `html` → `selector` (e.g., "#app")
- `script_url` → `url` (the script source)
- `meta_tag` → `name` (e.g., "generator")

The existing `EvidenceItem` renders these fields but does not describe **what** each evidence piece represents (e.g., "HTTP header 'Server'" vs. just showing "Server: nginx").

## Presentation Boundary

Created **`lib/detection-explainability.ts`** — a pure module that:
- Accepts a `DetectionResponse`
- Returns a `DetectionExplainability` model with per-evidence **source descriptions**
- Reuses `getDetectionExplanation()` for the summary (no reimplementation)
- Reuses `evidenceTypeLabel()` and `evidenceFields()` from the evidence presenter

```ts
interface EvidenceSource {
  type: string;      // "HTTP Header" — human-readable type label
  source: string;    // "HTTP header 'Server'" — origin description
  value: string;     // "Server: nginx" — primary identifying value
}

interface DetectionExplainability {
  technology: { name: string; category: string };
  confidence: number;           // passthrough — never recalculated
  summary: string;             // reused from getDetectionExplanation
  evidenceCount: number;
  evidenceTypes: string[];      // unique labels, sorted alphabetically
  evidenceSources: EvidenceSource[];  // per-evidence origin descriptions
}
```

**Not introduced**: No new confidence calculation, no new evidence identity algorithm, no new evidence types, no domain type duplication.

## Explainability Semantics

Each evidence source description is derived **exclusively from the evidence's own fields** — nothing is invented:

| Evidence type | Source description |
|---------------|-------------------|
| `http_header` | `HTTP header '{name}'` |
| `meta_tag` | `Meta tag '{name}'` |
| `script_url` | `Script from '{url}'` |
| `script_content` | `JavaScript snippet` |
| `html` | `HTML element at '{selector}'` |
| `javascript_global` | `JavaScript global '{globalName}'` |
| `resource` | `Resource at '{url}'` |
| `link` | `Link to '{url}'` |

The full evidence value (e.g., "Server: nginx") is available via `title` attribute for tooltips and is also shown in the collapsible `EvidenceList`.

## Evidence Mapping

The `EvidenceSource` model maps each evidence item to a human-readable origin:

1. **`type`** — the existing human-readable type label from `evidenceTypeLabel()` (e.g., "HTTP Header")
2. **`source`** — a concise description of what the evidence represents (e.g., "HTTP header 'Server'")
3. **`value`** — the primary identifying value from `evidenceFields()` (e.g., "Server: nginx")

No evidence values are fabricated, truncated in the model, or relabeled. The model preserves exact values; only the presentation layer may truncate for display.

## UI Structure

`DetectionItem` evolved to render an evidence source list **above** the collapsible evidence tree:

```text
TechnologyName  ·  Category  ·  Confidence: N%
└── Explanation summary (e.g., "Detected from HTTP Header and Meta Tag evidence.")
└── Evidence (N items)
└── Evidence source list (compact, scannable)
    ├── HTTP Header — HTTP header 'Server'
    ├── Meta Tag — Meta tag 'generator'
    └── Script URL — Script from 'https://...'
└── Evidence details (collapsible <details>/<summary>)
    ├── [type] [field values...]
    └── ...
```

The source list uses `word-break: break-all` and `title` attributes for full-value tooltips on long values. Long evidence values are also handled by the existing CSS on `.evidenceUrl` and `.evidenceCode`.

## Accessibility Decisions

- **Technology** — remains a logical heading (within `<header>`)
- **Confidence** — readable as text ("Confidence: 95%"), not color-only
- **Evidence** — uses list semantics (`<ul>` for source list, `<ul>` for evidence tree)
- **Evidence type** — available as text content (`<span>.evidenceSourceType`)
- **Source descriptions** — rendered as visible text (not hover-only)
- **Long values** — full value in `title` attribute (tooltip for mouse users, available to screen readers)
- **`<details>`/`<summary>`** — native keyboard-operable disclosure
- **URL links** — `target="_blank" rel="noopener noreferrer"` (existing pattern)
- **No color-only information** — all info conveyed as text

## Filtering Behavior

- `ScanOverview` metrics remain outside `DetectionFilterView` — stable under filtering
- `filterDetections()` (Step 36) filters without reordering
- `getScanDetectionResults()` (Step 38) sorts after filtering
- `getDetectionExplainability()` derives source descriptions per-detection — re-evaluated on each render with already-sorted detections
- Clearing filters restores exact deterministic result set
- Explanation/summary is per-detection — unaffected by filter state

## Empty States

| State | Behavior |
|-------|----------|
| Completed + detections | Show explanation + source list + evidence tree |
| Completed + zero detections | `EmptyDetections` (existing — "No supported technologies were detected") |
| Pending/running | `ScanningState` (preserved) |
| Failed | `DetectionList` (preserved — unchanged) |

## Files Created

| File | Tests | Description |
|------|-------|-------------|
| `lib/detection-explainability.ts` | — | Pure: `getDetectionExplainability()` — structured model with evidence source descriptions |
| `lib/detection-explainability.test.ts` | 13 | Pure tests (1 detection, multiple, confidence preservation, evidence preservation, type labels, exact values, determinism, immutability, deduplication, all 8 types, unknown type, zero evidence, alphabetical types) |

## Files Modified

| File | Change |
|------|--------|
| `components/DetectionItem.tsx` | Added evidence source list (16 lines) using `getDetectionExplainability()` |
| `components/DetectionItem.test.tsx` | +6 tests for explainability (source descriptions, type labels, long values, all types, confidence, zero evidence) |
| `components/ScanCard.module.css` | +24 lines for `.evidenceSourceList`, `.evidenceSourceItem`, `.evidenceSourceType`, `.evidenceSourceDesc` |

## Tests

### Pure tests (`detection-explainability.test.ts`) — 13 tests:
1. One detection — returns explainability model
2. Multiple detections — evidence count reflects all
3. Confidence preservation — exact value passthrough
4. Evidence preservation — exact values
5. Evidence type preservation — labels in output
6. Exact evidence values — no truncation
7. Deterministic output — same input → same output
8. Immutability — input not mutated
9. Deduplication authoritative — sources preserve all evidence items
10. All 8 evidence type source descriptions
11. Unknown evidence type handling
12. Zero evidence handling
13. Alphabetical evidence type sorting

### Component tests (`DetectionItem.test.tsx` — new Step 39 section) — 6 tests:
1. Evidence source descriptions rendered
2. Evidence source type labels rendered
3. Long evidence values with title attribute
4. Source list for all 8 evidence types
5. Confidence preserved in explainability rendering
6. Zero evidence (no source list, no crash)

## Validation

| # | Check | Command | Status |
|---|-------|---------|--------|
| 1 | Typecheck | `tsc --noEmit` | ✅ 0 errors |
| 2 | Tests | `vitest run` | ✅ 1471 passed, 18 skipped (81 files) |
| 3 | ESLint | `eslint .` | ✅ 0 errors |
| 4 | Prettier | `prettier --check .` | ✅ All files formatted |
| 5 | Build | `next build` | ✅ Compiled successfully |
| 6 | Circular deps | `npx madge --circular --extensions ts` | ✅ No cycles |
| 7 | tsconfig | `grep '"jsx": "preserve"'` | ✅ `"jsx": "preserve"` intact |

### Test count change:
- Step 38 baseline: 1452 passed, 18 skipped
- Step 39 final: 1471 passed, 18 skipped
- Increase: **19 new tests** (13 pure + 6 component)

## Regression Requirements (preserved)

- ✅ `ScanOverview` metrics outside filtering (unchanged)
- ✅ Deterministic detection ordering from Step 38 (unchanged)
- ✅ Technology deduplication (unchanged)
- ✅ Evidence deduplication (unchanged)
- ✅ Existing `evidenceIdentity` (unchanged)
- ✅ Existing confidence values (passthrough, never recalculated)
- ✅ Pending/running/failed behavior (unchanged)
- ✅ URL-linked detection filtering (unchanged)
- ✅ Detector pipeline (unchanged — pure presentation only)
- ✅ Scoring behavior (unchanged — no scoring code touched)
- ✅ `DetectionList` API-order test (not modified)

## Known Limitations

- Source descriptions are derived from evidence fields — they do not include the scan's origin URL (that is available in the snapshot, shown in the Snapshot component). Integrating snapshot data into evidence items would cross architectural boundaries and is left for a future step.
- Long evidence values rely on `word-break: break-all` CSS + `title` attribute for full value. True truncation + expandable "show more" is not implemented (the values are already compact via the existing `EvidenceItem`).
- Evidence source descriptions use English string formatting (e.g., "HTTP header 'Server'"). Internationalization is not introduced.

## Non-Goals (explicitly NOT done)

- No detector algorithm changes
- No evidence generation changes
- No scoring formula changes
- No crawler changes
- No persistence changes
- No API contract changes
- No new dependencies
- No new API endpoints
- No AI/LLM explanations
- No subjective confidence labels ("high"/"medium"/"low")
- No confidence recalculation
- No new evidence identity algorithm (reuses existing `evidenceIdentity`)
- No dashboard-style giant cards or decorative gradients

## Git

Commit: `Step 39: Detection Explainability`
Push: Blocked (no GitHub credentials available)
