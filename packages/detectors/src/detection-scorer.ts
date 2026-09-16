/**
 * Detection scoring — transforms a per-detection confidence into a
 * final score that accounts for evidence diversity.
 *
 * ## Background
 *
 * After `CompositeDetector` and `DeduplicatingDetector` produce one
 * `Detection` per technology, each detection carries:
 * - `confidence` — the best single per-signature confidence from the
 *   sub-detectors (already the highest, thanks to `DeduplicatingDetector`)
 * - `evidence` — a merged array of evidence items from different
 *   sub-detectors
 *
 * The confidence field alone does not capture the fact that **multiple
 * independent observation modalities** pointing at the same technology
 * increase our overall certainty. Conversely, multiple evidence items
 * from the **same modality** (e.g. three `<link>` hrefs all matching
 * `wp-content`, `wp-includes`, `wp-json`) are not independent — they
 * all originate from the same WordPress fingerprint.
 *
 * ## Evidence source concept
 *
 * The `Evidence['type']` discriminant serves as the **evidence source**
 * identifier. Each unique type value represents an independent
 * observation modality. The current mapping:
 *
 * | Evidence type      | Source modality              |
 * | ------------------ | ---------------------------- |
 * | `http_header`      | HTTP response headers        |
 * | `meta_tag`         | `<meta>` tag content         |
 * | `script_url`       | `<script src>` URLs          |
 * | `script_content`   | Inline `<script>` content    |
 * | `resource`         | Fetched resource bodies      |
 * | `link`             | `<link>` tag href URLs       |
 * | `html`             | Raw HTML structure           |
 * | `javascript_global`| JavaScript global variables  |
 *
 * Multiple evidence items sharing the same type are treated as
 * **dependent** — they do not independently boost the score.
 *
 * ## Scoring formula
 *
 * ```text
 * base   = detection.confidence   (the best single confidence, 0–100)
 * n      = number of unique evidence source types (≥ 1)
 * bonus  = min(MAX_BONUS, max(0, n - 1) × PER_SOURCE_BONUS)
 * score  = min(100, round(base + bonus))
 * ```
 *
 * Default constants: `MAX_BONUS = 10`, `PER_SOURCE_BONUS = 5`.
 *
 * ### Why this formula?
 *
 * - **Monotone**: adding an independent source (new evidence type)
 *   always increases or maintains the score.
 * - **Bounded**: the score never exceeds 100 (capped by `min(100, …)`).
 * - **No false summation**: we do NOT sum per-signature confidences
 *   (e.g. `85 + 90 + 90 ≠ 265`). Only the best single confidence is
 *   used as the base; the bonus is a small, capped augmentation.
 * - **Weak evidence doesn't overwrite strong evidence**: the base is
 *   the maximum confidence, so a single strong detection (95) always
 *   scores ≥ a single weak one (85).
 * - **Identical evidence doesn't multiply**: same-type evidence counts
 *   as one source, so three `LinkEvidence` items (same source) add
 *   zero bonus beyond the first.
 * - **Diminishing returns via cap**: `MAX_BONUS = 10` ensures that even
 *   100 independent sources can only add 10 to the base confidence,
 *   reaching the 100 cap gracefully.
 *
 * ### Example scores (default constants)
 *
 * | Base confidence | Sources | Bonus | Score |
 * | --------------- | ------- | ----- | ----- |
 * | 90              | 1       | 0     | 90    |
 * | 90              | 2       | 5     | 95    |
 * | 90              | 3       | 10    | 100   |
 * | 90              | 10+     | 10    | 100   |
 * | 85              | 2       | 5     | 90    |
 * | 95              | 1       | 0     | 95    |
 * | 80              | 4       | 10    | 90    |
 *
 * @see {@link Detection}
 * @see {@link Evidence}
 */

import type { Detection, Evidence } from '@devlens/core';
import { createConfidence } from '@devlens/core';

/**
 * The set of all `Evidence['type']` values — each represents an
 * independent observation modality (an "evidence source").
 *
 * This is a named alias (not a new concept) so that the scoring logic
 * is self-documenting: the scorer counts unique sources, not individual
 * evidence items.
 */
export type EvidenceSource = Evidence['type'];

/**
 * Clamps a numeric confidence value to the valid range [0, 100].
 *
 * This is a defensive normalization function. It guarantees that the
 * scorer never propagates `NaN`, `Infinity`, or out-of-bounds values
 * into the final `Detection.confidence`.
 *
 * - `NaN` → 0  (truly unknown — treat as no confidence)
 * - `Infinity` → 100  (cap at maximum)
 * - `-Infinity` → 0  (floor at minimum)
 * - Negative → 0
 * - > 100 → 100
 * - Otherwise → rounded to the nearest integer, clamped to [0, 100]
 */
export function clampConfidence(value: number): number {
  if (Number.isNaN(value)) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round(value)));
}

/**
 * Configuration for {@link ConfidenceScorer}.
 */
export interface ConfidenceScorerConfig {
  /** Bonus added per additional evidence source beyond the first. Default: 5. */
  readonly perSourceBonus?: number;
  /** Maximum total bonus regardless of source count. Default: 10. */
  readonly maxBonus?: number;
}

/**
 * The scorer contract — transforms a `Detection` by computing a final
 * confidence that accounts for evidence diversity.
 *
 * The scorer receives an already-deduplicated `Detection` (one per
 * technology, as produced by `DeduplicatingDetector`) and returns a new
 * `Detection` with an updated `confidence` value. The `technology` and
 * `evidence` fields are preserved unchanged.
 */
export interface DetectionScorer {
  /**
   * Computes a final confidence score for the given detection.
   *
   * @param detection — a deduplicated detection (one per technology)
   * @returns a new `Detection` with a scored `confidence`
   */
  score(detection: Detection): Detection;
}

/**
 * A `DetectionScorer` that computes a final confidence from the base
 * (best per-signature) confidence plus a diminishing-reward bonus for
 * each independent evidence source.
 *
 * The scoring formula is documented on the class JSDoc. In summary:
 *
 * ```text
 * score = min(100, round(base_confidence + min(maxBonus, (n_sources - 1) * perSourceBonus)))
 * ```
 *
 * @example
 * ```typescript
 * const scorer = new ConfidenceScorer();
 * const scored = scorer.score(detection);
 * // scored.confidence >= detection.confidence  (always, or equal)
 * ```
 */
export class ConfidenceScorer implements DetectionScorer {
  /** Bonus per additional evidence source beyond the first. */
  private readonly perSourceBonus: number;
  /** Maximum total bonus regardless of source count. */
  private readonly maxBonus: number;

  /**
   * @param config — optional configuration (all fields optional)
   */
  constructor(config: ConfidenceScorerConfig = {}) {
    this.perSourceBonus = config.perSourceBonus ?? 5;
    this.maxBonus = config.maxBonus ?? 10;
  }

  /**
   * Computes the final scored confidence for a detection.
   *
   * The score is always ≥ the original confidence (the bonus is
   * non-negative) and capped at 100.
   *
   * @param detection — a deduplicated detection (one per technology)
   * @returns a new `Detection` with a scored `confidence`
   */
  score(detection: Detection): Detection {
    const nSources = this.countSources(detection.evidence);
    const bonus = this.computeBonus(nSources);
    const scoredValue = clampConfidence(Number(detection.confidence) + bonus);

    return {
      technology: detection.technology,
      confidence: createConfidence(scoredValue),
      evidence: [...detection.evidence],
    };
  }

  /**
   * Counts the number of unique evidence source types in the given
   * evidence array. Each unique `Evidence['type']` value is one
   * independent source.
   */
  private countSources(evidence: ReadonlyArray<Evidence>): number {
    const sources = new Set<EvidenceSource>();
    for (const item of evidence) {
      sources.add(item.type);
    }
    return sources.size;
  }

  /**
   * Computes the diversity bonus: `min(maxBonus, max(0, n - 1) * perSourceBonus)`.
   *
   * - 1 source → 0 bonus (single-source evidence gets no boost)
   * - 2 sources → perSourceBonus
   * - 3+ sources → capped at maxBonus
   */
  private computeBonus(nSources: number): number {
    if (nSources <= 1) {
      return 0;
    }
    return Math.min(this.maxBonus, (nSources - 1) * this.perSourceBonus);
  }
}
