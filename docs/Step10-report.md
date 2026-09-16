# Step 10 — Confidence Calibration & Detection Ranking — Report

## Executive Summary

Step 10 implements **confidence calibration** and **detection ranking**
for the DevLens detection pipeline. The changes are minimal and targeted:
a defensive `clampConfidence` normalization function and a deterministic
ranking sort in `ScoringDetector`. No scoring formula was changed, no new
detectors or signatures were added, and no domain models were modified.

**Validation**: 596 tests pass (557 from Step 9 baseline + 39 new), typecheck
0 errors, lint clean, build OK, no circular dependencies.

---

## Current Scoring Audit

The Step 9 audit left a well-tested `ConfidenceScorer` with the formula:

```text
base   = detection.confidence       (0–100, the best single per-signature confidence)
n      = number of unique evidence source types (≥ 1)
bonus  = min(MAX_BONUS=10, max(0, (n - 1) × PER_SOURCE_BONUS=5))
score  = min(100, round(base + bonus))
```

**Current confidence range**: `[0, 100]` — enforced by `createConfidence()`
in `@devlens/core` which rejects NaN, non-finite, negative, or >100 values.

**Evidence weighting**: by source diversity (unique `Evidence['type']`
values), not by individual evidence count or per-signature confidence
summation.

**Duplicate handling**: `DeduplicatingDetector` (Step 9) ensures one
`Detection` per technology with canonical evidence deduplication before
scoring. Same-type evidence counts as 1 source.

**Thresholds**: **None exist.** All detected technologies are returned
regardless of confidence score. This is intentional — the detection engine
must remain faithful to evidence.

**Tie-breaking**: **Non-deterministic.** `ScoringDetector.detect()` returned
detections in inner-detector (insertion) order. Two technologies with the
same confidence could appear in different orders depending on which
sub-detector fired first.

**Detection ordering**: Not explicitly sorted — depended on
`CompositeDetector` → `DeduplicatingDetector` order.

---

## Confidence Contract

`confidence` represents **evidence strength**, not a statistical
probability. It is a bounded integer in `[0, 100]`:

```text
0     = no confidence (no evidence or contradictory evidence)
100   = maximum confidence (strong, specific, convergent evidence)
```

The value is always a finite number — never `NaN`, `Infinity`, or
negative.

**Deviation from spec**: Step 10 considered normalizing to `[0, 1]` as
suggested by the spec (Section 3). This was **not** done because:

- The existing `[0, 100]` range is deeply embedded in signature tables
  (90, 85, 95, etc.), API responses, and database JSONB storage.
- All Step 10 principles (bounded, deterministic, monotone) are
  scale-independent.
- Changing the range would be a massive breaking change with no
  behavioral improvement, violating the spec's "Ne pas casser inutilement
  les contrats existants" (Section 14).
- `createConfidence(value: number)` already enforces `[0, 100]` at the
  domain layer.

---

## Evidence Weighting

**No per-evidence-type weighting** was introduced. The existing model
treats all evidence source types equally — each unique `Evidence['type']`
contributes equally to the diversity bonus.

The spec's Section 4 suggested classifying evidence as strong/medium/weak.
This was **not** implemented because:

- The current system already encodes evidence strength in the
  **per-signature confidence** (95 for `__NEXT_DATA__`, 90 for
  `wp-content`, etc.), not in the evidence type.
- Adding a separate strength classification would be redundant and
  could conflict with signature-level confidence values.
- The scoring formula's "best base + diversity bonus" approach already
  ensures strong signals dominate.

**Evidence source types** (8, unchanged from existing model):

| Type                | Modality                  |
| ------------------- | ------------------------- |
| `http_header`       | HTTP response headers     |
| `meta_tag`          | `<meta>` tag content      |
| `script_url`        | `<script src>` URLs       |
| `script_content`    | Inline `<script>` content |
| `javascript_global` | JS global variables       |
| `resource`          | Fetched resource bodies   |
| `link`              | `<link>` tag href URLs    |
| `html`              | Raw HTML structure        |

---

## Normalization

The `clampConfidence(value: number)` function was added to
`detection-scorer.ts` as a defensive normalization measure. It is
**internal** — exported from `detection-scorer.ts` but not from
`@devlens/detectors/index.ts`.

```typescript
function clampConfidence(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}
```

Behavior:

- `NaN` → 0 (truly unknown — treat as no confidence)
- `Infinity` → 100 (cap at maximum)
- `-Infinity` → 0 (floor at minimum)
- Negative values → 0
- Values > 100 → 100
- Otherwise → rounded to nearest integer, clamped to `[0, 100]`

The `ConfidenceScorer.score()` method now uses `clampConfidence` instead
of the previous `Math.min(100, Math.round(...))`:

```typescript
// Before (Step 9):
const scoredValue = Math.min(100, Math.round(Number(detection.confidence) + bonus));

// After (Step 10):
const scoredValue = clampConfidence(Number(detection.confidence) + bonus);
```

This preserves the existing formula and output values while adding
defensive guards for `NaN` and out-of-bounds inputs.

---

## Ranking

`ScoringDetector.detect()` now sorts detections deterministically after
scoring:

1. **`confidence` DESC** — higher-confidence detections appear first.
2. **`technology.id` ASC** — stable tie-break, independent of insertion
   order, `Map` iteration order, or detector ordering.

```typescript
#rank(detections: Detection[]): Detection[] {
  return [...detections].sort((a, b) => {
    const confDiff = Number(b.confidence) - Number(a.confidence);
    if (confDiff !== 0) return confDiff;
    const idA = String(a.technology.id);
    const idB = String(b.technology.id);
    if (idA < idB) return -1;
    if (idA > idB) return 1;
    return 0;
  });
}
```

This is placed in `ScoringDetector` (the final pipeline stage before
`ScanResult`) because:

- It is the last transformation applied to detections.
- It already holds a reference to the scorer, so the sort requires no
  new dependencies.
- The API layer and database layer consume the final `Detection[]` —
  they should not implement ranking (spec Section 16).

---

## Tie-breaking

Ties in `confidence` are broken by `technology.id` in ascending
alphabetical order. This is:

- **Deterministic**: same input always produces same output.
- **Independent of detector order**: the result does not depend on which
  sub-detector fired first.
- **Independent of insertion order**: `[A, B]` and `[B, A]` produce the
  same ranking.
- **No technology-specific logic**: no "React vs Next.js" special cases.

Example: if WordPress (confidence 90) and React (confidence 90) are tied,
React appears first because `"react"` < `"wordpress"` alphabetically.
The tie-break is purely alphabetical by ID, with no semantic meaning —
this avoids any technology-specific ranking logic.

---

## Tests

### confidence-scorer.test.ts (39 tests total — 23 existing + 16 new)

New test categories added:

| Label | Tests | Description                                                                                                       |
| ----- | ----- | ----------------------------------------------------------------------------------------------------------------- |
| A     | 2     | No evidence → `createDetection` throws; invariant holds                                                           |
| H     | 1     | Many weak signals (80 + 10 = 90) do not exceed one strong (95)                                                    |
| I     | 2     | Lower bound (0) and upper bound (100)                                                                             |
| J     | 7     | `clampConfidence`: NaN → 0, Infinity → 100, -Infinity → 0, negative → 0, >100 → 100, rounding, scorer caps at 100 |
| K     | 2     | Determinism: same evidence → same score; evidence order doesn't matter                                            |
| L     | 2     | Monotonicity: adding source type never decreases; same-type doesn't change                                        |

### detection-ranking.test.ts (8 tests — new file)

| Test                                           | Scenario                                |
| ---------------------------------------------- | --------------------------------------- |
| Next.js (90) ranks above React (70)            | Higher confidence first                 |
| Ranking by scored confidence, not base         | Two techs tying at 90 → tie-break by id |
| Equal confidence → ranked by id ASC            | Three techs tied → alphabetical         |
| Tie-break stable regardless of insertion order | [A,B,C] and [C,B,A] → same result       |
| [A,B,C] and [C,B,A] produce same ranking       | Full permutation independence           |
| Mixed confidence + tie-break                   | One high, two tied → stable             |
| Two consecutive calls → identical JSON         | Determinism                             |
| Empty detection array → empty                  | Edge case                               |

### confidence-integration.test.ts (15 tests — new file)

| Scenario         | Tests | Coverage                                                          |
| ---------------- | ----- | ----------------------------------------------------------------- |
| Next.js          | 2     | Specific signals dominate; no false React                         |
| WordPress        | 2     | Convergence of 4 evidence types; beats React                      |
| Shopify          | 3     | CDN detection, ranking stability, no domain tricks                |
| React vs Next.js | 2     | Next.js > React; bare React → no Next.js false positive           |
| Noise            | 3     | Generic content → no detections; Google Fonts = 90 (not inflated) |
| No fingerprint   | 2     | Normal page → empty; generic URLs → empty                         |
| No threshold     | 1     | Lowest confidence (80) detection is still returned                |

### Total test counts

| Metric          | Step 9                | Step 10                                                                |
| --------------- | --------------------- | ---------------------------------------------------------------------- |
| Total tests     | 557 passed, 9 skipped | **596 passed**, 9 skipped                                              |
| New tests added | 48                    | **39** (16 scorer + 8 ranking + 15 integration)                        |
| Test files      | —                     | +3 new (`detection-ranking.test.ts`, `confidence-integration.test.ts`) |

---

## Persistence

No database schema changes were made. The confidence ranking and scoring
happen entirely in the `@devlens/detectors` package. The database simply
stores the final `Detection[]` as JSONB (via `Detection[]` serialization).

**Round-trip guarantee**: The `evidence-persistence.test.ts` test
(Step 9, 4 tests) verifies that `executeScan` → score → persist →
retrieve preserves technology IDs, names, categories, confidence, and
evidence. The ranking is deterministic, so the persisted order matches
the in-memory order on retrieval.

No new persistence tests were needed — the existing Step 9 round-trip
tests already cover this path.

---

## Architectural Decisions

| Decision                                       | Rationale                                                                                                                      |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Keep `[0, 100]` confidence range               | Breaking change to `[0, 1]` has no behavioral benefit; spec Section 14 says "Ne pas casser inutilement les contrats existants" |
| Add `clampConfidence` as internal function     | Defensive programming; guards against NaN/Infinity even though `createConfidence` already validates inputs                     |
| Add ranking in `ScoringDetector`               | Final pipeline stage; already has scorer reference; no new dependencies                                                        |
| No per-evidence-type weighting                 | Evidence strength is already encoded in per-signature confidence (95 for `__NEXT_DATA__`, etc.)                                |
| No confidence threshold                        | Spec Section 10: "Le moteur de détection doit rester fidèle aux preuves"                                                       |
| Tie-break by `technology.id` ASC               | Deterministic, simple, no technology-specific logic                                                                            |
| `clampConfidence` not exported from `index.ts` | Internal helper, consistent with Step 9's `getEvidenceKey` pattern                                                             |

---

## Deferred Work

1. **Confidence range normalization to `[0, 1]`**: If the spec's intent
   is truly a `[0, 1]` range, this would require a coordinated change
   across signature tables, scorer, API, DB schema, and all tests.
   Deferred to avoid a mass refactor without clear behavioral benefit.

2. **Adaptive confidence thresholds**: A minimum-confidence threshold
   could be added at the API/persistence layer to filter out low-confidence
   noise from the UI. This is a presentation-layer concern, not a
   detection-layer one. Deferred per spec Section 10.

3. **Per-evidence-type weighting**: If domain expertise later determines
   that certain evidence types (e.g. `http_header`) are intrinsically
   more reliable than others (e.g. `javascript_global`), a weighted
   scoring formula could replace the current source-count model. Not
   needed now — the current system already encodes strength in signature
   confidence.

4. **React vs Next.js specificity**: Currently handled correctly because
   Next.js signatures have higher confidence (95 for `__NEXT_DATA__`)
   and more evidence sources than React (90 for `react-dom`). No special
   case logic is needed, but if more framework/sub-framework overlaps
   arise, a future step could explore hierarchical technology relationships.
