# Step 35: Technology Evidence Matrix

## Objective

Add a compact **Technology Evidence Matrix** to completed scan reports, showing which detected technologies have which evidence types, how much evidence supports each technology, and which evidence categories are present. This is a strictly descriptive, presentation-level aggregation of existing detection evidence — no relationships, dependencies, compatibility, or architecture inferences are made.

## Architecture

```
ScanDetailView
  ↓
  ScanInsights (pure presentation)
    ├── getScanInsights() (pure function, extended)
    │     └── getTechnologyEvidenceMatrix() (new pure function)
    │           ├── evidenceIdentity() (internal helper, presentation-only)
    │           ├── deduplicateEvidence() (internal helper)
    │           └── evidenceTypeLabel() (existing, from evidence-presenter)
    └── renders:
        • Technology count
        • Category counts
        • Evidence coverage
        • Detected technologies list
        • Technology composition (Step 34)
        • Technology evidence (Step 35, NEW)
```

The matrix is derived exclusively from the existing `Detection[]` and the technology catalog wrapper (`lib/technology-catalog.ts`). No new API endpoint, no database query, no persistence changes, no detector modifications.

### Pure evidence matrix model (`lib/scan-insights.ts`)

Added to the existing pure insights module alongside the Step 34 composition:

- **`TechnologyEvidenceMatrixItem`** interface — `{ id: string; name: string; evidenceTypes: string[]; evidenceCount: number }`
- **`getTechnologyEvidenceMatrix(detections)`** — builds the per-technology evidence matrix

Internal helpers:

- `evidenceIdentity(item)` — canonical identity string for an evidence item (type-specific primary identifier)
- `deduplicateEvidence(evidence)` — deduplicates by canonical identity, preserving first occurrence

The `technologyEvidenceMatrix` field was added to the `ScanInsights` interface and is computed within `getScanInsights()`.

### Data flow

```
Detection[] (from API)
  → group by technology.id (first name preserved)
  → merge evidence arrays across duplicate detections
  → deduplicate evidence via canonical identity
  → derive unique evidence type labels (alphabetical ASC)
  → count deduplicated evidence entries
  → sort matrix rows by name ASC, then id ASC
  → return TechnologyEvidenceMatrixItem[]
```

### Canonical evidence identity

Each evidence type uses its type-specific primary identifier for deduplication:

| Evidence Type       | Identity Field |
| ------------------- | -------------- |
| `html`              | selector       |
| `http_header`       | name           |
| `script_url`        | url            |
| `script_content`    | snippet        |
| `meta_tag`          | name           |
| `javascript_global` | globalName     |
| `resource`          | url            |
| `link`              | url            |
| unknown (fallback)  | full JSON      |

This is a presentation-only helper — it does not alter evidence or participate in detector logic.

### Duplicate technology handling

If the same technology ID appears in multiple detection records:

- Collapsed into one matrix row
- First occurrence's name is preserved
- Evidence from all duplicate detections is merged
- Evidence entries are deduplicated via canonical identity
- `evidenceCount` reflects the deduplicated count

The underlying `detections` array is never modified.

### Determinism

All ordering is explicit:

- Matrix rows: name ASC, then id ASC
- Evidence types within a row: alphabetical ASC, duplicates removed

No reliance on object insertion order, detector order, database order, or browser order.

### Evidence counting

`evidenceCount` = number of deduplicated evidence entries for that technology. This is the count after merging evidence from duplicate detection records and removing duplicate evidence entries.

If a detection has no evidence: `evidenceTypes: []`, `evidenceCount: 0`.

### Unknown handling

- **Unknown technology IDs**: preserved as-is, no catalog link (plain text)
- **Unknown evidence types**: use the existing `"Evidence"` fallback from `evidenceTypeLabel()`
- Zero evidence: renders "No evidence" text in the UI, empty `evidenceTypes` array

### Confidence

The matrix does not recalculate confidence. Confidence values remain exactly as returned by the API — displayed per-detection in `DetectionItem.tsx`, not in the matrix.

## UI Integration

`ScanInsights.tsx` was updated to render a new "Technology evidence" section inside the existing `<section className={styles.scanInsights}>`, after the Step 34 "Technology composition" section.

Layout (responsive list, mobile-friendly — no wide table):

```
Technology evidence

React
  HTTP Header, Script URL    2 sources

WordPress
  Meta Tag                    1 source
```

- Known technologies: name links to `/technologies/{id}`
- Unknown technologies: plain text (no link)
- Evidence labels: reuse `evidenceTypeLabel()` presenter
- Source count: "N source" (singular) or "N sources" (plural)

### Wording

Uses only descriptive, non-relational language: "Technology evidence", "{technology}", "{evidence type labels}", "{N} source(s)". Does not use: "Technology stack", "Dependencies", "Built with", "Powered by", "Compatible technologies", "Technology relationships", "Architecture".

### Empty and lifecycle states

- **Completed scan with zero detections**: composition and matrix sections are not rendered (existing empty-state behavior preserved)
- **Failed/pending/running scans**: `ScanInsights` returns `null` — no matrix rendered (consistent with Step 32 behavior)

## Accessibility

- Known technology names remain accessible links (`<a>` via mocked `Link`)
- Evidence labels are readable by screen readers (plain text spans)
- No color-exclusive communication — all information is in text content
- Keyboard navigation preserved via semantic HTML

## Files Created

- `docs/Step35-report.md` — This report

## Files Modified

- `apps/web/src/lib/scan-insights.ts` — Added `TechnologyEvidenceMatrixItem` interface, `getTechnologyEvidenceMatrix()` function, `evidenceIdentity()` and `deduplicateEvidence()` internal helpers, `technologyEvidenceMatrix` field in `ScanInsights` interface and `getScanInsights()` return
- `apps/web/src/lib/scan-insights.test.ts` — Added 12 pure composition/matrix tests (now 40 total in file)
- `apps/web/src/components/ScanInsights.tsx` — Added "Technology evidence" rendering section
- `apps/web/src/components/ScanInsights.test.tsx` — Added 10 component matrix tests (now 27 total in file)
- `apps/web/src/components/ScanCard.module.css` — Added `.technologyEvidenceMatrix`, `.matrixRow`, `.matrixTech`, `.matrixEvidence`, `.matrixEvidenceTypes`, `.matrixSourceCount` styles

## Test Coverage

### Pure evidence matrix tests (`lib/scan-insights.test.ts`) — 12 tests

1. Produces a matrix row for one technology with one evidence item
2. Produces unique evidence types for one technology with multiple evidence types
3. Groups multiple technologies across categories
4. Collapses duplicate technology IDs into one row
5. Preserves first occurrence name for duplicate IDs
6. Merges evidence from duplicate detection records
7. Deduplicates identical evidence entries within merged evidence
8. Handles no evidence (zero evidence items)
9. Preserves unknown technology IDs
10. Handles unknown evidence types safely (uses "Evidence" fallback)
11. Sorts technologies by name ASC then id ASC
12. Produces deterministic output across calls (no mutation) + input immutability

### Component matrix tests (`components/ScanInsights.test.tsx`) — 10 tests

1. Matrix renders for a completed scan with detections
2. Renders technology names with correct catalog links
3. Renders unknown technologies as plain text (no link)
4. Renders evidence type labels correctly
5. Renders evidence count (sources) correctly
6. Renders multiple technologies in the matrix
7. Does not render matrix for empty completed scan
8. Does not render matrix for a failed scan
9. Does not render matrix for a pending scan
10. Preserves existing composition, explanation, and evidence UI

## Validation Results

| Check                                                | Status  | Details                                            |
| ---------------------------------------------------- | ------- | -------------------------------------------------- |
| `pnpm typecheck`                                     | ✅ Pass | All 10 workspaces typecheck clean                  |
| `pnpm test`                                          | ✅ Pass | 1307 passed, 18 skipped (75 test files)            |
| `pnpm lint`                                          | ✅ Pass | ESLint clean, Prettier all files match code style  |
| `pnpm build`                                         | ✅ Pass | All packages build, including `apps/web`           |
| `npx madge --circular --extensions ts packages apps` | ✅ Pass | No circular dependency found (196 files processed) |

`tsconfig.json` `jsx: "preserve"` confirmed intact after build.

## Explicit Non-Inferences

The evidence matrix does **not** claim:

- Technologies are related or dependent on each other
- Technologies are compatible or incompatible
- Evidence implies a technology "stack"
- Technologies share an architecture
- Co-occurrence implies causation or causality
- Confidence values have qualitative meaning (excellent, poor, likely)

The scan detects technologies and collects evidence; the matrix only presents a descriptive summary of what evidence supports each detection.
