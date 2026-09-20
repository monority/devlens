/**
 * Detection — a domain-level assertion that a {@link Technology} was
 * found in a {@link SiteSnapshot}, along with the evidence that supports
 * it.
 */

import type { Confidence, TechnologyVersion } from './value-objects.js';
import type { Technology } from './technology.js';
import type { Evidence } from './evidence.js';

/**
 * A detection of a technology within a site snapshot.
 *
 * Invariants enforced by {@link createDetection}:
 * - `confidence` must be a valid {@link Confidence} (0–100)
 * - at least one {@link Evidence} item must support the detection
 * - `version`, when present, must be a valid {@link TechnologyVersion}
 *   extracted from one of the evidence items
 */
export interface Detection {
  readonly technology: Technology;
  readonly confidence: Confidence;
  readonly evidence: ReadonlyArray<Evidence>;
  /**
   * Optional technology version, extracted deterministically from one of
   * the evidence items attached to this detection. `null` (or `undefined`)
   * means no version was extracted — never a fabricated/guessed value.
   */
  readonly version?: TechnologyVersion | null;
}

/**
 * Creates a {@link Detection}.
 *
 * @throws {Error} if the evidence array is empty.
 *
 * The evidence array is copied so that external mutations cannot affect
 * the domain object. The optional `version` defaults to `null` (not
 * extracted); callers that extract a version pass it explicitly.
 */
export function createDetection(
  technology: Technology,
  confidence: Confidence,
  evidence: Evidence[],
  version: TechnologyVersion | null = null,
): Detection {
  if (evidence.length === 0) {
    throw new Error('Detection must have at least one evidence item');
  }
  if (version !== null && version !== undefined && typeof version !== 'string') {
    throw new Error('Detection version must be a TechnologyVersion or null');
  }
  return {
    technology,
    confidence,
    evidence: [...evidence],
    version: version ?? null,
  };
}
