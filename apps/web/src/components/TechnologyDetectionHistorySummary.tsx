/**
 * TechnologyDetectionHistorySummary — compact, render-only quality/stability
 * block for the technology detail page (Step 89 §6/§13).
 *
 * Pure presentation: receives a pre-computed
 * `TechnologyDetectionHistorySummary` (produced by
 * `lib/technology-detection-history-summary.ts`, which itself derives from the
 * Step 88 history) and renders HTML. No data fetching, no React state.
 *
 * Placed immediately before `TechnologyDetectionTimeline` on the page (§6).
 * Renders `null` when there is no history (§6/§8) — the page already owns the
 * no-detection empty state, so a missing summary adds nothing to the DOM.
 *
 * Accessibility (§7): semantic `<dl>`/`<dt>`/`<dd>` + `<time dateTime>`, an
 * `<h2>` labelled region, and visible status text (Stable / Changed /
 * Unchanged / Indeterminate) so state is never conveyed by color alone.
 */

import type {
  TechnologyDetectionHistorySummary,
  HistoryStability,
} from '@/lib/technology-detection-history-summary.js';
import styles from './TechnologyDetectionHistorySummary.module.css';

// ─── Locale-free date formatter (mirrors TechnologyDetectionTimeline.formatDate) ─

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Deterministic, locale-free UTC formatter — see TechnologyDetectionTimeline. */
function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()} at ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
}

// ─── Presentation mappings ──────────────────────────────────────────

const STABILITY_LABEL: Record<HistoryStability, string> = {
  stable: 'Stable',
  changed: 'Changed',
  indeterminate: 'Indeterminate',
};

/** Maps a stability state to its CSS module class (inlined as template literals
 * so a `string | undefined` CSS-module token is coerced to `string`, matching
 * the pattern used by `TechnologyDetectionTimeline`). */
function stabilityClassName(stability: HistoryStability): string {
  const mod = stabilityClass(stability);
  return `${styles.stability} ${mod}`;
}

/** Resolves the CSS module class for a stability state (S3358: extracted from nested ternary). */
function stabilityClass(stability: HistoryStability): string | undefined {
  if (stability === 'stable') return styles.stabilityStable;
  if (stability === 'changed') return styles.stabilityChanged;
  return styles.stabilityIndeterminate;
}

/**
 * The change-indicator dimensions surfaced in the compact summary (Step 89 §6).
 * Confidence is shown as a value ("Latest confidence") above and also drives
 * `stability`; it is intentionally not a separate indicator row per §6.
 */
const CHANGE_INDICATORS = [
  'versionChanged',
  'provenanceChanged',
  'integrityChanged',
  'signalQualityChanged',
] as const;

const CHANGE_INDICATOR_LABEL: Record<(typeof CHANGE_INDICATORS)[number], string> = {
  versionChanged: 'Version',
  provenanceChanged: 'Provenance',
  integrityChanged: 'Integrity',
  signalQualityChanged: 'Signal quality',
};

// ─── Component ──────────────────────────────────────────────────────

export interface TechnologyDetectionHistorySummaryProps {
  /** May be `null` (no detection history) — renders nothing in that case. */
  readonly summary: TechnologyDetectionHistorySummary | null;
}

/** Renders `null` when the summary is absent (Step 89 §6/§8). */
export function TechnologyDetectionHistorySummary({
  summary,
}: TechnologyDetectionHistorySummaryProps): React.ReactElement | null {
  if (summary === null) {
    return null;
  }

  return (
    <section className={styles.summary} aria-labelledby="detection-history-summary-title">
      <h2 id="detection-history-summary-title" className={styles.title}>
        Detection history summary
      </h2>

      <dl className={styles.stats}>
        <div className={styles.stat}>
          <dt className={styles.statDt}>Scans</dt>
          <dd className={styles.statDd}>{summary.scanCount}</dd>
        </div>
        <div className={styles.stat}>
          <dt className={styles.statDt}>First detected</dt>
          <dd className={styles.statDd}>
            {summary.firstDetectedAt === null ? (
              '—'
            ) : (
              <time dateTime={summary.firstDetectedAt}>{formatDate(summary.firstDetectedAt)}</time>
            )}
          </dd>
        </div>
        <div className={styles.stat}>
          <dt className={styles.statDt}>Last detected</dt>
          <dd className={styles.statDd}>
            {summary.lastDetectedAt === null ? (
              '—'
            ) : (
              <time dateTime={summary.lastDetectedAt}>{formatDate(summary.lastDetectedAt)}</time>
            )}
          </dd>
        </div>
        <div className={styles.stat}>
          <dt className={styles.statDt}>Latest confidence</dt>
          <dd className={styles.statDd}>{summary.confidence ?? '—'}</dd>
        </div>
        <div className={styles.stat}>
          <dt className={styles.statDt}>Stability</dt>
          <dd className={styles.statDd}>
            <span className={stabilityClassName(summary.stability)}>
              {STABILITY_LABEL[summary.stability]}
            </span>
          </dd>
        </div>
      </dl>

      <dl className={styles.changes} aria-label="Change indicators">
        {CHANGE_INDICATORS.map((key) => {
          const changed = (summary[key] as boolean) === true;
          return (
            <div className={styles.stat} key={key}>
              <dt className={styles.statDt}>{CHANGE_INDICATOR_LABEL[key]}</dt>
              <dd className={styles.statDd}>
                <span
                  className={
                    changed
                      ? `${styles.indicator} ${styles.indicatorChanged}`
                      : `${styles.indicator} ${styles.indicatorUnchanged}`
                  }
                >
                  {changed ? 'Changed' : 'Unchanged'}
                </span>
              </dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}
