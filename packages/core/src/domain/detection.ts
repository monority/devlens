/**
 * Detection — a domain-level assertion that a {@link Technology} was
 * found in a {@link SiteSnapshot}, along with the evidence that supports
 * it.
 */

import type { Confidence } from './value-objects.js';
import type { Technology } from './technology.js';
import type { Evidence } from './evidence.js';

/**
 * A detection of a technology within a site snapshot.
 *
 * Invariants enforced by {@link createDetection}:
 * - `confidence` must be a valid {@link Confidence} (0–100)
 * - at least one {@link Evidence} item must support the detection
 */
export interface Detection {
  readonly technology: Technology;
  readonly confidence: Confidence;
  readonly evidence: ReadonlyArray<Evidence>;
}

/**
 * Creates a {@link Detection}.
 *
 * @throws {Error} if the evidence array is empty.
 *
 * The evidence array is copied so that external mutations cannot affect
 * the domain object.
 */
export function createDetection(
  technology: Technology,
  confidence: Confidence,
  evidence: Evidence[],
): Detection {
  if (evidence.length === 0) {
    throw new Error('Detection must have at least one evidence item');
  }
  return {
    technology,
    confidence,
    evidence: [...evidence],
  };
}
