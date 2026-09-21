/**
 * ObservationCoverageSummary — Step 78 §12 matrix + §14 partial warning.
 *
 * Discrete, gray-palette rendering of the observation-coverage source
 * matrix produced by `getObservationCoverage` (core). Renders one row per
 * §4 family with its factual status (§9 — never a generic `blocked`), and
 * a single gray, `.8rem` note (§14) when the coverage is incomplete
 * (any `partial` / `failed` / `skipped` resource surface).
 *
 * §13: no aggressive color, no icon, no decorative badge — the entire
 * palette is grayscale (#6b7280 / #d1d5db / #4b5563), `.8rem`.
 *
 * Pure presentation (no React state, no hooks, no HTTP/DB).
 */

import type {
  ObservationCoverage,
  ObservationCoverageStatus,
  ObservationFamily,
} from '@devlens/core';
import styles from './ScanCard.module.css';

export interface ObservationCoverageSummaryProps {
  coverage: ObservationCoverage;
}

const FAMILY_LABELS: Readonly<Record<ObservationFamily, string>> = {
  header: 'HTTP headers',
  meta: 'Meta tags',
  content: 'Script content',
  script_url: 'Script URLs',
  link: 'Link tags',
  resource_url: 'Resource URLs',
  resource_content: 'Resource content',
};

const STATUS_LABELS: Readonly<Record<ObservationCoverageStatus, string>> = {
  not_observed: 'not observed',
  observed: 'observed',
  partial: 'partial',
  failed: 'failed to inspect',
  skipped: 'skipped',
};

// §14 — factual, non-alarming wording (gray, .8rem).
const PARTIAL_WARNING = 'Some resources could not be inspected, so the result may be incomplete.';

function statusClassName(status: ObservationCoverageStatus): string {
  return status === 'not_observed'
    ? `${styles.observationStatus ?? ''} ${styles.notObserved ?? ''}`.trim()
    : (styles.observationStatus ?? '');
}

export function ObservationCoverageSummary({
  coverage,
}: ObservationCoverageSummaryProps): React.ReactElement {
  const hasGap = coverage.sources.some(
    (source) =>
      source.status === 'partial' || source.status === 'failed' || source.status === 'skipped',
  );

  return (
    <section className={styles.observationCoverage}>
      <h2>Observability</h2>
      {coverage.sources.map((source) => (
        <div key={source.family} className={styles.observationSurface}>
          <span>{FAMILY_LABELS[source.family]}</span>
          <span className={statusClassName(source.status)}>{STATUS_LABELS[source.status]}</span>
        </div>
      ))}
      {hasGap && <p className={styles.partialWarning}>{PARTIAL_WARNING}</p>}
    </section>
  );
}
