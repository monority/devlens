# Step 33: Detection Explanation & Confidence Breakdown

## Objective

Make individual technology detections easier to understand by adding a concise, neutral explanation of why DevLens detected each technology. The explanation is derived exclusively from the existing detection data (technology, confidence, evidence) — no detector logic, scoring, or evidence generation changes are introduced.

## Architecture

```
ScanDetailView (pure presentation orchestrator)
  ↓
  DetectionList (pure presentation)
    ↓
    DetectionItem (pure presentation)
      ├── getDetectionExplanation() (pure function, from lib/detection-explanation.ts)
      ├── technology name (Link to /technologies/{id} if known)
      ├── confidence score (passed through, not recalculated)
      ├── explanation summary (neutral, evidence-derived)
      └── EvidenceList (collapsible, existing evidence disclosure)
```

### Pure explanation module (`lib/detection-explanation.ts`)

Pure module with no React, HTTP, or database dependencies.

Exports:

- **`DetectionExplanation`** interface — `{ summary: string; confidence: number; evidenceCount: number; evidenceTypes: string[] }`
- **`getDetectionExplanation(detection)`** — derives a neutral, deterministic explanation from a single `DetectionResponse`

Internal helpers:

- `countEvidence(detection)` — total evidence item count
- `uniqueEvidenceTypes(detection)` — unique evidence type labels, sorted alphabetically (via `evidenceTypeLabel()` from `evidence-presenter.ts`)
- `buildSummary(types, evidenceCount)` — generates a neutral text summary

### Evidence source derivation

Uses the existing `evidenceTypeLabel()` from `evidence-presenter.ts` — no new label mapping is introduced. Unknown evidence types fall back to `"Evidence"` (the existing fallback in `evidenceTypeLabel()`).

Evidence types are:

1. HTTP Header
2. Meta Tag
3. Script URL
4. Script Content
5. HTML Element
6. JavaScript Global
7. Resource URL
8. Link

Types are sorted alphabetically for deterministic ordering. Each type appears at most once in `evidenceTypes[]` (unique only).

### Confidence handling

The existing `confidence` value is passed through exactly as-is — never recalculated, never relabeled. No subjective labels (excellent, poor, likely, unlikely, high quality) are introduced.

### UI integration

`ScanInsights` component was added in Step 32 (`components/ScanInsights.tsx`). `DetectionItem` was updated to render the explanation summary below the detection header, above the existing evidence disclosure.

Layout:

```
React  ·  frontend  ·  Confidence: 95%
Detected from HTTP Header and Script URL evidence.
▸ Evidence
```

The explanation complements (not replaces) the existing evidence disclosure — the collapsible `<details>`/`<summary>` tree remains fully intact.

### Unknown/empty evidence behavior

- **Zero evidence**: summary = "No evidence details are available."
- **Unknown evidence type**: falls back to "Evidence" label (via `evidenceTypeLabel`)
- **Unknown technology ID**: renders as plain text (no catalog link), category shows "Unknown" (handled in Step 32's `ScanInsights` component)

### Determinism

All output is a pure function of the input detection:

- No current time, random values, or locale-dependent formatting
- No reliance on object insertion order
- Categories sorted by count DESC then name ASC
- Evidence types sorted by count DESC then name ASC
- Same input always produces the same output

## Files Created

- `apps/web/src/lib/detection-explanation.ts` — Pure module with `getDetectionExplanation()`, `DetectionExplanation` interface
- `apps/web/src/lib/detection-explanation.test.ts` — 10 pure function tests
- `apps/web/src/components/ScanInsights.tsx` — Insight summary component (Step 32)
- `apps/web/src/components/ScanInsights.test.tsx` — 9 component tests (Step 32)

## Files Modified

- `apps/web/src/components/DetectionItem.tsx` — Added `getDetectionExplanation()` call, renders explanation summary paragraph above existing evidence disclosure
- `apps/web/src/components/ScanCard.module.css` — Added `.detectionExplanation` style
- `apps/web/src/components/ScanViews.tsx` — Added `ScanInsights` integration after `ScanSummarySection`
- `apps/web/src/components/ScanCard.module.css` — Added `.scanInsights` and related styles (Step 32)

## Test Coverage

### Pure explanation tests (`lib/detection-explanation.test.ts`) — 10 tests

1. Produces explanation for one evidence type
2. Produces explanation for multiple evidence types
3. Deduplicates evidence types (unique types only)
4. Handles zero evidence gracefully
5. Produces deterministic output across calls (no mutation)
6. Returns correct evidence count matching input
7. Preserves exact confidence value from detection
8. Handles unknown evidence types safely
9. Does not mutate the input detection
10. Never invents evidence that does not exist

### Component tests (`components/DetectionItem.test.tsx`) — 16 tests (8 pre-existing + 8 new)

**Pre-existing (8 tests):**

1. Renders technology name
2. Renders technology category
3. Renders confidence score exactly as returned by the API
4. Renders evidence count
5. Renders singular "item" for a single evidence entry
6. Renders evidence items inside the detection
7. Preserves exact confidence value without rounding
8. Does not introduce subjective labels

**New Step 33 tests (8 tests):**

9. Renders the evidence explanation summary
10. Preserves exact confidence value in the explanation
11. Renders evidence-source summary with type labels
12. Renders "No evidence details are available." for zero evidence
13. Preserves known technology link to catalog
14. Renders unknown technology name as plain text (no link)
15. Existing evidence disclosure still works (collapsible tree)
16. Renders all eight evidence types without crashing

### Pure insights tests (`lib/scan-insights.test.ts`) — 16 tests (from Step 32)

Tests `getScanInsights()`, `getEvidenceTypeCounts()`, `getCategoryCounts()` with various detection configurations.

## Validation Results

| Check                                                | Status  | Details                                            |
| ---------------------------------------------------- | ------- | -------------------------------------------------- |
| `pnpm typecheck`                                     | ✅ Pass | All 10 workspaces typecheck clean                  |
| `pnpm test`                                          | ✅ Pass | 1288 passed, 18 skipped (75 test files)            |
| `pnpm lint`                                          | ✅ Pass | ESLint clean, Prettier all files match code style  |
| `pnpm build`                                         | ✅ Pass | All packages build, including `apps/web`           |
| `npx madge --circular --extensions ts packages apps` | ✅ Pass | No circular dependency found (196 files processed) |

`tsconfig.json` `jsx: "preserve"` confirmed intact after build.

## Constraints Compliance

- ✅ No detector modifications
- ✅ No detector confidence changes
- ✅ No crawler behavior changes
- ✅ No persistence changes
- ✅ No API contract changes
- ✅ No API endpoints added
- ✅ No dependencies added
- ✅ No charts, gauges, or visual indicators
- ✅ No AI-generated explanations
- ✅ No technology-specific heuristics
- ✅ No invented evidence
- ✅ No changes to detection ordering
- ✅ No changes to evidence semantics
- ✅ No second evidence model created
