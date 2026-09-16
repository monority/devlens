# Step 7 — Detection Scoring / Confidence Engine — Report

## Status

✅ **Complete.** All validation checks pass.

## Objective

Implement a deterministic scoring mechanism that evaluates the final
confidence of a technology detection from multiple independent
`Detection`/`Evidence` items, following the spec in `docs/Step7.md`.

## Design

### Evidence source concept

The `Evidence['type']` discriminant (`http_header`, `meta_tag`,
`script_url`, `script_content`, `resource`, `link`, `html`,
`javascript_global`) serves as the **evidence source** identifier. Each
unique type represents an independent observation modality. Multiple
evidence items of the same type (e.g. three `LinkEvidence` items for
`wp-content`, `wp-includes`, `wp-json`) are treated as dependent — they
do not independently boost the score.

| Evidence type       | Source modality             |
| ------------------- | --------------------------- |
| `http_header`       | HTTP response headers       |
| `meta_tag`          | `<meta>` tag content        |
| `script_url`        | `<script src>` URLs         |
| `script_content`    | Inline `<script>` content   |
| `resource`          | Fetched resource bodies     |
| `link`              | `<link>` tag href URLs      |
| `html`              | Raw HTML structure          |
| `javascript_global` | JavaScript global variables |

### Scoring formula

```text
base   = detection.confidence    (best single per-signature confidence, 0–100)
n      = number of unique evidence source types (≥ 1)
bonus  = min(MAX_BONUS, max(0, n - 1) × PER_SOURCE_BONUS)
score  = min(100, round(base + bonus))
```

Default constants: `MAX_BONUS = 10`, `PER_SOURCE_BONUS = 5`.

| Base confidence | Sources | Bonus | Score |
| --------------- | ------- | ----- | ----- |
| 90              | 1       | 0     | 90    |
| 90              | 2       | 5     | 95    |
| 90              | 3       | 10    | 100   |
| 90              | 10+     | 10    | 100   |
| 85              | 2       | 5     | 90    |
| 95              | 1       | 0     | 95    |

### Why this formula?

- **Monotone**: adding an independent source never decreases the score.
- **Bounded**: never exceeds 100.
- **No false summation**: only the best per-signature confidence is the
  base; the bonus is a small capped augmentation (not a sum).
- **Weak evidence doesn't overwrite strong evidence**: base is the
  maximum confidence.
- **Identical evidence doesn't multiply**: same-type evidence counts as
  one source.
- **Deterministic**: no randomness, no network, no external models.

## Files created

| File                                              | Purpose                                                         |
| ------------------------------------------------- | --------------------------------------------------------------- |
| `packages/detectors/src/detection-scorer.ts`      | `DetectionScorer` interface + `ConfidenceScorer` implementation |
| `packages/detectors/src/scoring-detector.ts`      | `ScoringDetector` decorator wrapping a `Detector`               |
| `packages/detectors/src/detection-scorer.test.ts` | 23 tests for `ConfidenceScorer`                                 |
| `packages/detectors/src/scoring-detector.test.ts` | 10 tests for `ScoringDetector`                                  |

## Files modified

| File                                  | Change                                                                                                |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `packages/detectors/src/index.ts`     | Re-export `DetectionScorer`, `EvidenceSource`, `ConfidenceScorer`, `ScoringDetector`                  |
| `apps/web/src/app/api/scans/route.ts` | Wrap `DeduplicatingDetector(...)` with `ScoringDetector(..., new ConfidenceScorer())`                 |
| `apps/worker/src/main.ts`             | Same wrapping in the worker pipeline                                                                  |
| `docs/architecture/detectors.md`      | New "ScoringDetector + ConfidenceScorer" section + updated file structure + updated production wiring |
| `docs/architecture/overview.md`       | Updated detector exports list and worker boundary description                                         |

## Pipeline architecture

```text
SiteSnapshot
  → CompositeDetector([Header, MetaTag, ScriptUrl, ContentScript, Resource, Link])
  → DeduplicatingDetector  (one Detection per technology, evidence merged)
  → ScoringDetector + ConfidenceScorer  (final confidence = base + diversity bonus)
  → ScanResult { scan, snapshot, detections }
```

`ScoringDetector` follows the same decorator pattern as
`DeduplicatingDetector` — it wraps an inner `Detector` and transforms
its output. It is applied **after** deduplication so each technology is
scored exactly once on its full set of merged evidence. This preserves
the pipeline invariant: the scorer never re-creates duplicates.

No changes to `runScan` in `@devlens/application` — the scorer is
purely a `Detector` wrapper at the application boundary.

## Tests

### `detection-scorer.test.ts` (23 tests)

- **Scoring formula** (5 tests): single source → no bonus; two sources → +5; three sources → +10; many sources → capped; score capped at 100
- **Evidence source independence** (4 tests): three same-type link evidence → 1 source; duplicate resource evidence → 1 source; different types → independent sources; many items of two types → 2 sources
- **Monotonicity** (2 tests): adding sources never decreases; ascending source counts with varying base confidence
- **Bounded** (2 tests): score never exceeds 100 even with max bonus; single max-confidence source → 100
- **Preservation** (2 tests): technology and evidence unchanged; no mutation of original detection
- **Configurable parameters** (3 tests): custom `perSourceBonus`, custom `maxBonus`, defaults when config is empty
- **Weak vs strong evidence** (2 tests): single 95 ≥ single 90; strong single-source not downgraded
- **Edge cases** (3 tests): single evidence item; rounding; confidence 0

### `scoring-detector.test.ts` (10 tests)

- **Delegation** (3 tests): delegates to inner detector; scores each detection independently; empty inner result → empty output
- **Scoring integration** (3 tests): multi-source scored higher than single-Source; preserves technology and evidence; does not mutate inner detections
- **Error propagation** (2 tests): inner detector throws → propagated; no partial scoring on failure
- **Real detector integration** (2 tests): empty snapshot → no detections; snapshot with `Server: nginx` header and `generator: WordPress` meta tag → detections produced

## Validation results

| Check                  | Result                                                               |
| ---------------------- | -------------------------------------------------------------------- |
| `pnpm typecheck`       | ✅ "10 of 11 workspace projects", 0 errors                           |
| `pnpm test`            | ✅ "Test Files 26 passed                                             | 2 skipped (28)", "Tests 464 passed | 9 skipped (473)" |
| `pnpm lint`            | ✅ "All matched files use Prettier code style!" (0 errors)           |
| `pnpm build`           | ✅ All packages built, Next.js compiled successfully                 |
| `npx madge --circular` | ✅ "Processed 87 files (1 warning)", "No circular dependency found!" |

## Constraints satisfied

- ✅ Scoring is NOT a replacement for existing detectors; pipeline:
  `CompositeDetector → DeduplicatingDetector → ScoringDetector → ScanResult`
- ✅ No ML, no external models, no LLMs, no unjustified statistical probabilities
- ✅ No external network
- ✅ Deterministic
- ✅ No false mathematical sentiment (no sum of per-signature confidences)
- ✅ Monotone but capped (more evidence can increase score, never exceeds 100)
- ✅ Weak evidence doesn't overwrite strong evidence
- ✅ Identical evidence doesn't artificially multiply (same-type = 1 source)
- ✅ Evidence source independence handled (`wp-content`/`wp-includes`/`wp-json` → same source)
- ✅ No duplicates recreated (scoring applied after deduplication)
- ✅ `interface DetectionScorer { score(detection: Detection): Detection }`
- ✅ Reuses existing `confidence` concept (no competing "score" field)
- ✅ No refactoring of existing detectors
- ✅ `CompositeDetector` unchanged
- ✅ `DeduplicatingDetector` not deleted
