/**
 * ScanOverview — compact at-a-glance header for a completed scan report.
 *
 * Pure presentation component (no React state, no hooks, no HTTP/DB).
 * Receives a `ScanOverview` data object (derived by the pure
 * `getScanOverview()` function in `lib/scan-overview.ts`) and renders
 * semantic HTML with the project's existing CSS conventions.
 *
 * Shown only for completed scans. For pending/running/failed scans, the
 * existing `ScanSummary` component continues to provide the header.
 *
 * The overview must remain stable when detection filters are active —
 * its metrics describe the scan itself, not the filtered subset.
 *
 * Layout:
 *
 *   Scan #scan_001           [Completed badge]
 *   example.com
 *   https://example.com/
 *
 *   Created: Sep 16, 2025
 *   Completed: Sep 16, 2025
 *
 *   4 Technologies  9 Evidence  95 Highest confidence
 */

import type { ScanOverview } from '../lib/scan-overview.js';
import styles from './ScanCard.module.css';

export interface ScanOverviewProps {
  /** The compact overview data (derived by getScanOverview) */
  overview: ScanOverview;
}

// ─── Status label (reused from ScanViews for consistency) ────────────

const STATUS_LABELS: Readonly<Record<string, string>> = {
  completed: 'Completed',
  failed: 'Failed',
  running: 'Running',
  pending: 'Pending',
};

function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

// ─── Status CSS class (reuses existing ScanCard.module.css classes) ──

function statusClass(status: string): string {
  switch (status) {
    case 'completed':
      return styles.statusCompleted ?? '';
    case 'failed':
      return styles.statusFailed ?? '';
    case 'running':
      return styles.statusRunning ?? '';
    case 'pending':
      return styles.statusPending ?? '';
    default:
      return '';
  }
}

// ─── Date formatting ─────────────────────────────────────────────────

/**
 * Formats an ISO 8601 timestamp into a human-readable string using UTC.
 *
 * Deterministic across timezones (uses getUTC* methods) — the same input
 * always produces the same output string. The raw ISO string is preserved
 * in the `dateTime` attribute of the `<time>` element for
 * machine-readability and accessibility.
 */
function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  const month = months[date.getUTCMonth() ?? 0];
  const day = date.getUTCDate();
  const year = date.getUTCFullYear();
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  return `${month} ${day}, ${year} at ${hours}:${minutes} UTC`;
}

// ─── Component ───────────────────────────────────────────────────────

export function ScanOverview({ overview }: ScanOverviewProps): React.ReactElement {
  const status = statusLabel(overview.status);
  const statusCss = statusClass(overview.status);

  const hasDetections = overview.technologyCount > 0;

  return (
    <section className={styles.scanOverview}>
      {/* Header: scan ID + status badge */}
      <header className={styles.overviewHeader}>
        <h1>Scan #{overview.id}</h1>
        <span className={`${styles.statusBadge} ${statusCss}`}>{status}</span>
      </header>

      {/* Target and hostname */}
      <p className={styles.overviewTarget}>{overview.target}</p>
      <p className={styles.overviewHostname}>{overview.hostname}</p>

      {/* Timeline metadata */}
      <dl className={styles.overviewMeta}>
        <div>
          <dt>Created</dt>
          <dd>
            <time dateTime={overview.createdAt}>{formatDate(overview.createdAt)}</time>
          </dd>
        </div>
        {overview.completedAt && overview.status === 'completed' && (
          <div>
            <dt>Completed</dt>
            <dd>
              <time dateTime={overview.completedAt}>{formatDate(overview.completedAt)}</time>
            </dd>
          </div>
        )}
      </dl>

      {/* Metrics row (always shown for completed scans, even with zero detections) */}
      <dl className={styles.overviewMetrics}>
        <div className={styles.overviewMetric}>
          <dd className={styles.overviewMetricValue}>{overview.technologyCount}</dd>
          <dt className={styles.overviewMetricLabel}>Technologies</dt>
        </div>
        <div className={styles.overviewMetric}>
          <dd className={styles.overviewMetricValue}>{overview.evidenceCount}</dd>
          <dt className={styles.overviewMetricLabel}>Evidence</dt>
        </div>
        <div className={styles.overviewMetric}>
          <dd className={styles.overviewMetricValue}>
            {hasDetections ? overview.highestConfidence : '—'}
          </dd>
          <dt className={styles.overviewMetricLabel}>Highest confidence</dt>
        </div>
      </dl>
    </section>
  );
}
