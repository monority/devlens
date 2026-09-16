/**
 * Detector boundary — the contract between the domain model and
 * concrete technology-detection implementations.
 *
 * The domain model (`@devlens/core`) defines what a `Detection` is;
 * this interface defines how detectors are invoked.
 *
 * Concrete detectors (header-based, HTML-pattern-based, etc.) implement
 * this interface or are injected as `Detector` implementations. They
 * depend on `@devlens/core` for domain types (`SiteSnapshot`,
 * `Detection`) and make no assumptions about HTTP, browsers, or any
 * specific runtime.
 */

import type { Detection, SiteSnapshot } from '@devlens/core';

/**
 * Detector abstraction.
 *
 * Given a {@link SiteSnapshot}, the detector produces zero or more
 * {@link Detection} items. Each detection is supported by evidence
 * found in the snapshot (HTTP headers, HTML content, scripts, resources,
 * etc.).
 *
 * The application layer calls `detect(snapshot)` after the crawler
 * produces a snapshot. The detector implementation is injected, making
 * this layer fully testable without real detection logic.
 *
 * On failure, a detector throws an `Error`. The application layer is
 * responsible for catching and translating the error (see `runScan`).
 */
export interface Detector {
  /**
   * Detects technologies present in the given site snapshot.
   *
   * @param snapshot — the observed website data (HTTP response, HTML, resources)
   * @returns an array of detections (possibly empty if nothing was detected)
   * @throws {Error} if detection fails unexpectedly
   */
  detect(snapshot: SiteSnapshot): Detection[];
}

/**
 * A {@link Detector} that never detects any technologies.
 *
 * Implements the Null Object pattern: it provides a safe, no-op
 * default when no concrete detectors are configured. This is useful
 * for early pipeline wiring, tests, and the worker's demo scan.
 *
 * ```text
 * new HttpCrawler()             → real crawling
 * NullDetector                  → no detection (placeholder)
 * ```
 */
export const NullDetector: Detector = {
  detect: () => [],
};
