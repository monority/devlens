/**
 * DetectionIntegritySummary — Step 86 scan-level integrity panel.
 *
 * Mirrors ResultQualitySummary (Step 79 §6): a calm, factual `<section>` with
 * an `<h2>` heading and one `<p>` line per relevant dimension, rendered with
 * the gray CSS-module palette (`#4b5563` / `#6b7280`, `.8rem`), no icons, no
 * badges, no gradients/animation.
 *
 * Where ResultQualitySummary consumes a scan-level verdict pre-computed server
 * (`result.resultQuality`), there is NO scan-level integrity verdict from the
 * API — the Step 81 `DetectionIntegrity` verdict lives on each
 * `DetectionResponse.integrity` (present only when invalid). The parent
 * (`ScanDetailView`) aggregates `result.detections` through the pure
 * `summarizeIntegrity` presenter and passes the resulting `ScanIntegritySummary`
 * here. This component is pure presentation.
 *
 * §86: the panel only appears when ≥1 detection carries an integrity issue;
 * otherwise it returns null (no empty-state boilerplate).
 *
 * Pure presentation (no state, hooks, HTTP/DB).
 */

import type { ScanIntegritySummary } from '../lib/detection-integrity-presenter.js';
import styles from './ScanCard.module.css';

export interface DetectionIntegritySummaryProps {
  summary: ScanIntegritySummary;
}

/**
 * Formats `${count} ${singular}` / `${count} ${plural}` (plural defaults to
 * `${singular}s`). Mirrors ResultQualitySummary's local `noun` helper so the
 * two panels typeset identically.
 */
function noun(count: number, singular: string, plural: string = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/**
 * Scan-level detection-integrity panel.
 *
 * Renders nothing when the scan has no integrity issues
 * (`summary.affectedDetectionCount === 0`), so the panel only appears when
 * there is something to surface.
 */
export function DetectionIntegritySummary({
  summary,
}: DetectionIntegritySummaryProps): React.ReactElement | null {
  if (summary.affectedDetectionCount === 0) {
    return null;
  }

  return (
    <section className={styles.detectionIntegrity}>
      <h2>Detection integrity</h2>
      <p className={styles.detectionIntegritySummary}>
        {noun(summary.affectedDetectionCount, 'detection')} with{' '}
        {noun(summary.totalIssues, 'issue')}
      </p>
      {summary.issueCounts.map((tally) => (
        <p key={tally.issue} className={styles.detectionIntegrityIssue}>
          {tally.label}: {tally.count}
        </p>
      ))}
    </section>
  );
}
