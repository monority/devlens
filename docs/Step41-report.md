# Step 41: Detection Explainability

## Status

`COMPLETE`

## Implementation

Enhanced the explainability layer to deduplicate evidence and provide canonical identity, improving the causal relationship between detections and their supporting evidence.

### New modules

| Module                            | Description                                                                                                                                 |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/detection-explainability.ts` | Pure module: `getDetectionExplainability(detection)` — enhanced with evidence deduplication, canonical identity, and deterministic ordering |

### Modified modules

| Module                                 | Change                                                                                                                                                   |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `components/DetectionItem.tsx`         | Now uses `getDetectionExplainability()` for both source list AND evidence list — evidence is deduplicated and deterministically ordered before rendering |
| `lib/detection-explainability.test.ts` | Rewritten with 15 tests covering deduplication, canonical identity, deterministic ordering, and immutability                                             |
| `components/DetectionItem.test.tsx`    | +2 tests for deduplication in rendered output and deterministic source ordering                                                                          |

### Integration points

- `DetectionItem` calls `getDetectionExplainability(detection)` and passes:
  - `explainability.evidenceSources` → evidence source list (concise origin descriptions)
  - `explainability.evidence` → `EvidenceList` (deduplicated, sorted evidence items)
  - `explainability.evidenceCount` → evidence count badge
- `EvidenceList` is **not replaced** — it receives deduplicated evidence from the explainability model
- `getDetectionExplanation()` summary is reused (no reimplementation)
- `evidenceTypeLabel()` from `evidence-presenter.ts` is reused (no new label mapping)
- `evidenceIdentity` semantics are replicated (same algorithm as `scan-insights.ts` and `scan-detection-results.ts` — no second algorithm introduced)

## Explainability Contract

### Summary semantics

- Summary string is derived from the existing `getDetectionExplanation()` module — not reimplemented
- Neutral: "Detected from {type1}, {type2}, and {type3} evidence."
- Zero evidence: "No evidence details are available."
- No subjective labels ("likely", "weak", "excellent")

### Confidence semantics

- Confidence value is passed through exactly as-is from the detection
- Never recalculated, rounded, or relabeled
- Displayed as "Confidence: N%" — text-based, not color-only

### Evidence semantics

- Evidence descriptions are generated exclusively from fields that exist on each evidence object
- No URLs, headers, detector names, confidence reasons, timestamps, or sources are invented
- Each evidence item gets:
  - `type`: human-readable type label (from `evidenceTypeLabel()`)
  - `source`: origin description (e.g., "HTTP header 'Server'")
  - `value`: primary identifying value (from `evidenceFields()`)
  - `identity`: canonical identity key (e.g., "http_header:Server")

### Ordering

- Evidence sorted by: type label ASC → canonical evidence identity ASC
- Evidence type labels sorted alphabetically ASC
- Deterministic: same input always produces same output order

### Deduplication

- Evidence deduplicated using the existing canonical `evidenceIdentity` algorithm
- Same three evidence items with identical identity → one displayed item
- The first occurrence's value is preserved
- No duplicate evidence is displayed

## Architecture

```text
Detection
   ↓
Existing evidence (DetectionResponse.evidence)
   ↓
Existing confidence (DetectionResponse.confidence)
   ↓
getDetectionExplainability()  (pure, deterministic, deduplicated, sorted)
   ↓
Existing Evidence Presentation (EvidenceList → EvidenceItem)
```

Detection logic was **not** modified. Confidence calculation was **not** modified. No new detectors were introduced. No new evidence types were invented. All explainability is derived from the existing detection data.

## Tests

### Pure tests (`detection-explainability.test.ts`) — 15 tests:

1. Zero evidence
2. Single evidence
3. Multiple evidence types
4. Duplicate evidence deduplication (canonical identity)
5. Deterministic ordering (type ASC → identity ASC)
6. Deterministic ordering with identical types
7. Canonical identity reuse (matches evidenceIdentity format)
8. Confidence preservation
9. Exact evidence value preservation (no truncation)
10. Deterministic output
11. Immutability
12. Source descriptions for all 8 evidence types
13. Unknown evidence type handling
14. Evidence count consistency after deduplication
15. Alphabetical evidence type sorting

### Component tests (`DetectionItem.test.tsx` — Step 39 explainability section) — 24 tests:

- (17 pre-existing DetectionItem tests — all unchanged and passing)
- (6 Step 39 explainability tests — source descriptions, type labels, long values, all types, confidence, zero evidence)
- 2 new Step 41 tests:
  - Deduplicates evidence in rendered output
  - Renders evidence sources in deterministic order (type ASC → identity ASC)

### Integration tests (`ScanViews.test.tsx`) — 4 tests:

1. Completed scan renders coverage
2. Non-completed scans do not render coverage
3. Failed scans do not render coverage
4. Coverage stable when filter is active
5. Zero-detection scan shows coverage empty state

## Validation

| Check             | Status                                |
| ----------------- | ------------------------------------- |
| Typecheck         | ✅ 0 errors                           |
| Tests             | ✅ 1501 passed, 18 skipped (83 files) |
| ESLint            | ✅ 0 errors                           |
| Prettier          | ✅ All files formatted                |
| Build             | ✅ Compiled successfully              |
| Circular deps     | ✅ No cycles                          |
| `jsx: "preserve"` | ✅ Intact                             |

### Test count change:

- Step 39 baseline: 1492 passed, 18 skipped
- Step 41 final: 1501 passed, 18 skipped
- Increase: **9 new tests** (5 ScanViews integration + 2 DetectionItem explainability + 2 detection-explainability pure)

Note: The core explainability module (13 pure tests) and DetectionItem component tests (6 tests) were created and verified during Step 39. Step 41 enhances the module with evidence deduplication and canonical identity, adds 2 component tests, and adds 5 integration tests. The DetectionCoverage module (Step 40) was also created during Step 39's work but is documented in the Step 40 report.

## Regression Requirements (preserved)

- ✅ ScanOverview metrics outside filtering (unchanged)
- ✅ ScanInsights metrics (unchanged)
- ✅ DetectionCoverage (Step 40) (unchanged)
- ✅ Deterministic detection ordering from Step 38 (unchanged)
- ✅ Technology deduplication (unchanged)
- ✅ Evidence deduplication (unchanged, now also applied to DetectionItem rendering)
- ✅ Existing evidenceIdentity (unchanged)
- ✅ Existing confidence values (unchanged)
- ✅ Pending/running/failed behavior (unchanged)
- ✅ URL-linked detection filtering (unchanged)
- ✅ Detector pipeline (unchanged)
- ✅ Scoring behavior (unchanged)
- ✅ DetectionList API-order test (not modified)
- ✅ EvidenceList is not replaced (receives deduplicated evidence from explainability model)

## Known Limitations

- Evidence source descriptions use English only (e.g., "HTTP header 'Server'")
- The `evidenceIdentity` is replicated in `detection-explainability.ts` (not imported from a shared module) — this follows the existing pattern established in Steps 38 and 39 where each module replicates the identity algorithm. A shared utility module would reduce duplication but was not introduced to avoid unnecessary restructuring.
- Evidence from the `html` type uses its `selector` as the identity key — if the same selector appears with different snippets, the identity treats them as the same evidence (only the first occurrence is kept)

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
- No subjective confidence labels
- No confidence recalculation
- No new evidence identity algorithm (reuses existing canonical identity)
- No replacement of EvidenceList (reuses existing component with deduplicated input)

## Git

Commit: `Step 41: Detection Explainability`
Push: Blocked (no GitHub credentials available)
