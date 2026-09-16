/**
 * DetectionCoverage — compact, factual coverage summary for completed scans.
 *
 * Pure presentation component — receives typed API data as props and
 * renders HTML. It does not fetch data, call APIs, or access the database.
 * All derived data is computed by the pure `getDetectionCoverage()`
 * function in `lib/detection-coverage.ts`.
 *
 * Displayed for completed scans only, this component provides a compact
 * bridge between the global ScanOverview metrics and the individual
 * detection results — surfacing the evidence types present and the
 * deduplicated evidence count.
 *
 * It does NOT duplicate ScanOverview's technology count or raw evidence
 * count — it adds the deduplicated evidence count and the evidence type
 * breakdown, which neither ScanOverview nor ScanInsights provides in this
 * compact, globally-stable form.
 */

import type { DetectionResponse } from '../lib/types.js';
import { getDetectionCoverage } from '../lib/detection-coverage';
import styles from './ScanCard.module.css';

export interface DetectionCoverageProps {
  /** All detection results from the scan (unfiltered) */
  detections: DetectionResponse[];
}

export function DetectionCoverage({ detections }: DetectionCoverageProps): React.ReactElement {
  const coverage = getDetectionCoverage(detections);

  // Only show evidence types / deduplicated evidence count.
  // Technology count and raw evidence count are already shown by
  // ScanOverview and ScanInsights respectively — do not duplicate.
  if (coverage.evidenceTypeCount === 0) {
    return (
      <section className={styles.detectionCoverage}>
        <h2>Detection coverage</h2>
        <p className={styles.coverageEmpty}>No evidence available</p>
      </section>
    );
  }

  return (
    <section className={styles.detectionCoverage}>
      <h2>Detection coverage</h2>
      <dl className={styles.coverageMeta}>
        <div>
          <dt>Evidence items</dt>
          <dd>
            {coverage.evidenceCount} item{coverage.evidenceCount === 1 ? '' : 's'}
          </dd>
        </div>
        <div>
          <dt>Evidence types</dt>
          <dd>{coverage.evidenceTypeCount}</dd>
        </div>
      </dl>
      <ul className={styles.evidenceTypeListCompact}>
        {coverage.evidenceTypes.map((type) => (
          <li key={type} className={styles.evidenceTypeItemCompact}>
            {type}
          </li>
        ))}
      </ul>
    </section>
  );
}
