/**
 * Scoring detector — wraps another `Detector` and applies confidence
 * scoring to each `Detection` in the result.
 *
 * This is a **decorator** that sits between `DeduplicatingDetector` and
 * the application layer (`ScanResult`). It delegates `detect()` to the
 * inner detector (typically a `DeduplicatingDetector` wrapping a
 * `CompositeDetector`), then applies a `DetectionScorer` to each
 * detection:
 *
 * ```text
 * raw detections
 *   → CompositeDetector
 *   → DeduplicatingDetector        (one Detection per technology)
 *   → ScoringDetector(ConfidenceScorer)
 *                      ↓
 *   scored Detection[]             (confidence = base + diversity bonus)
 *   → ScanResult
 * ```
 *
 * The scorer is applied **after** deduplication so that each technology
 * is scored exactly once, based on its full set of merged evidence.
 * This preserves the pipeline invariant: the scorer never re-creates
 * duplicates because it receives already-deduplicated detections.
 *
 * @see {@link Detector}
 * @see {@link DeduplicatingDetector}
 * @see {@link ConfidenceScorer}
 */

import type { Detection, SiteSnapshot } from '@devlens/core';
import type { Detector } from './detector.js';
import type { DetectionScorer } from './detection-scorer.js';

/**
 * A `Detector` decorator that applies a `DetectionScorer` to each
 * detection produced by an inner `Detector`.
 *
 * @example
 * ```typescript
 * const detector = new ScoringDetector(
 *   new DeduplicatingDetector(
 *     new CompositeDetector([
 *       new HeaderDetector(),
 *       new MetaTagDetector(),
 *       // ...
 *     ]),
 *   ),
 *   new ConfidenceScorer(),
 * );
 * const detections = detector.detect(snapshot);
 * // → scored detections (confidence reflects evidence diversity)
 * ```
 */
export class ScoringDetector implements Detector {
  /** The inner detector whose results are scored. */
  readonly #inner: Detector;
  /** The scorer applied to each detection. */
  readonly #scorer: DetectionScorer;

  /**
   * @param inner   — the detector to wrap (typically `DeduplicatingDetector(CompositeDetector(...))`)
   * @param scorer  — the scorer applied to each deduplicated detection
   */
  constructor(inner: Detector, scorer: DetectionScorer) {
    this.#inner = inner;
    this.#scorer = scorer;
  }

  /**
   * Delegates detection to the inner detector, then applies the scorer
   * to each result, and finally ranks the scored detections deterministically.
   *
   * ## Ranking order
   *
   * The final output is sorted by:
   *
   * 1. `confidence` DESC — higher-confidence detections appear first.
   * 2. `technology.id` ASC — stable tie-break that is independent of
   *    detector order, insertion order, or `Map` iteration order.
   *
   * This guarantees that the same set of detections always produces the
   * same output ordering, regardless of the order in which inner
   * detectors or sub-detectors happened to produce matches.
   *
   * @param snapshot — the site snapshot to inspect
   * @returns scored, ranked detections (one per technology, with final confidence)
   * @throws {Error} if the inner detector throws (errors propagate unchanged)
   */
  detect(snapshot: SiteSnapshot): Detection[] {
    const detections = this.#inner.detect(snapshot);
    const scored = detections.map((d) => this.#scorer.score(d));
    return this.#rank(scored);
  }

  /**
   * Sorts detections by confidence (descending), with a deterministic
   * tie-break on `technology.id` (ascending).
   *
   * This ranking is **not** based on detector priority or insertion order.
   * It depends solely on the score and the technology ID, making the
   * output fully reproducible regardless of pipeline construction.
   */
  #rank(detections: Detection[]): Detection[] {
    return [...detections].sort((a, b) => {
      const confDiff = Number(b.confidence) - Number(a.confidence);
      if (confDiff !== 0) {
        return confDiff;
      }
      const idA = String(a.technology.id);
      const idB = String(b.technology.id);
      if (idA < idB) return -1;
      if (idA > idB) return 1;
      return 0;
    });
  }
}
