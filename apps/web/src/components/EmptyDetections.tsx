/**
 * EmptyDetections — dedicated empty state for a completed scan
 * with zero detections.
 *
 * This is a valid result — not an error. The scan completed
 * successfully; no supported technologies were detected.
 *
 * Step 78 (§13): the zero-detection wording is tightened to
 * "No observable technologies were detected." and, when the snapshot's
 * observation coverage reports un-inspected resources (failed/skipped > 0),
 * a gray note surfaces the blind spot: "Some resources could not be
 * inspected, so the result may be incomplete." (§13 / §14). The warning is
 * suppressed when no coverage is available.
 */

import type { ObservationCoverage } from '@devlens/core';
import styles from './ScanCard.module.css';

export interface EmptyDetectionsProps {
  /**
   * Observation coverage for the scan (Step 78). When omitted, the
   * blind-spot warning is suppressed — no gap information is available.
   */
  observationCoverage?: ObservationCoverage | undefined;
}

export function EmptyDetections({ observationCoverage }: EmptyDetectionsProps): React.ReactElement {
  const hasBlindSpot =
    (observationCoverage?.failed ?? 0) > 0 || (observationCoverage?.skipped ?? 0) > 0;

  return (
    <section className={styles.emptyDetections}>
      <h2>Detections (0)</h2>
      <p>The scan completed successfully.</p>
      <p>No observable technologies were detected.</p>
      {hasBlindSpot && (
        <p>Some resources could not be inspected, so the result may be incomplete.</p>
      )}
      <p>
        This does not mean the site uses no technologies — DevLens can only detect technology from
        the observable HTTP, HTML, and script signatures it inspects. A known technology that leaves
        no observable signature will not appear here.
      </p>
    </section>
  );
}
