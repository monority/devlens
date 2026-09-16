/**
 * Composite detector — runs multiple sub-detectors against the same
 * `SiteSnapshot` and aggregates their `Detection[]` results.
 *
 * @see {@link Detector}
 */

import type { Detection, SiteSnapshot } from '@devlens/core';
import type { Detector } from './detector.js';

/**
 * A {@link Detector} that delegates to an ordered collection of
 * sub-detectors.
 *
 * The composite iterates its sub-detectors in the order they were
 * provided, invokes `detect(snapshot)` on each, and concatenates the
 * results into a single flat array. The snapshot is **never mutated** —
 * it is passed by reference to each sub-detector, and the composite does
 * not modify the returned arrays.
 *
 * ### Ordering
 *
 * Detections from the first sub-detector appear before detections from
 * the second, and so on. No re-sorting or re-ordering is performed.
 *
 * ### Error policy
 *
 * If any sub-detector throws, the composite immediately propagates the
 * error — it does **not** catch and swallow failures, and it does not
 * continue executing remaining sub-detectors. This matches the existing
 * `runScan` convention: a `Detector` throwing causes the entire scan to
 * fail via `toScanError` → `ScanError{ code: 'UNKNOWN_ERROR' }`.
 *
 * The composite introduces no new error abstraction — raw errors from
 * sub-detectors propagate unchanged.
 *
 * ### Deduplication
 *
 * The composite performs **no deduplication**. The domain model
 * (`Detection`) does not define a unique identity field (no `id`,
 * no `equals`). Two detections with the same `technology.id` but
 * different evidence or confidence are legitimately distinct. If two
 * sub-detectors produce the same technology from different evidence
 * sources, both are preserved. Individual sub-detectors are
 * responsible for their own internal deduplication (e.g.
 * {@link HeaderDetector} deduplicates by technology ID).
 *
 * @example
 * ```typescript
 * const composite = new CompositeDetector([
 *   new HeaderDetector(),
 *   customDetector,
 * ]);
 * const detections = composite.detect(snapshot);
 * ```
 */
export class CompositeDetector implements Detector {
  /**
   * The ordered sub-detectors.
   *
   * Readonly to prevent external mutation after construction.
   */
  readonly #detectors: readonly Detector[];

  /**
   * @param detectors — the sub-detectors to compose, invoked in order
   */
  constructor(detectors: readonly Detector[]) {
    this.#detectors = detectors;
  }

  /**
   * Runs every sub-detector against the same {@link SiteSnapshot} and
   * aggregates their results.
   *
   * @param snapshot — the site snapshot to inspect (not mutated)
   * @returns a flat array of detections from all sub-detectors, in
   *          detector-order
   * @throws {Error} if any sub-detector throws (errors propagate
   *   immediately, matching the `runScan` convention)
   */
  detect(snapshot: SiteSnapshot): Detection[] {
    const detections: Detection[] = [];

    for (const detector of this.#detectors) {
      const results = detector.detect(snapshot);
      detections.push(...results);
    }

    return detections;
  }
}
