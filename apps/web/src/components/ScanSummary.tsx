/**
 * ScanSummary — renders the scan metadata block (target, status, timeline).
 *
 * Pure presentation component. Receives typed scan data as props and
 * renders semantic HTML (`<dl>` / `<dt>` / `<dd>` with `<time>` elements).
 *
 * Status badges use both color AND text — no color-only communication.
 */

import type { ScanResponse } from '../lib/types.js';
import styles from './ScanCard.module.css';

export interface ScanSummaryProps {
  scan: ScanResponse;
}

/**
 * Returns a human-readable label for a scan status.
 */
function statusLabel(status: string): string {
  switch (status) {
    case 'completed':
      return 'Completed';
    case 'failed':
      return 'Failed';
    case 'running':
      return 'Running';
    case 'pending':
      return 'Pending';
    default:
      return status;
  }
}

/**
 * Returns a CSS class for a scan status (for color coding).
 */
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

export function ScanSummary({ scan }: ScanSummaryProps): React.ReactElement {
  const status = statusLabel(scan.status);
  const statusCss = statusClass(scan.status);

  return (
    <section className={styles.summary}>
      <header className={styles.summaryHeader}>
        <h1>Scan #{scan.id}</h1>
        <span className={`${styles.statusBadge} ${statusCss}`}>{status}</span>
      </header>

      <dl className={styles.summaryMeta}>
        <div>
          <dt>Target</dt>
          <dd>{scan.target}</dd>
        </div>
        <div>
          <dt>Hostname</dt>
          <dd>{scan.hostname}</dd>
        </div>
        <div>
          <dt>Created</dt>
          <dd>
            <time dateTime={scan.createdAt}>{scan.createdAt}</time>
          </dd>
        </div>
        {scan.startedAt && (
          <div>
            <dt>Started</dt>
            <dd>
              <time dateTime={scan.startedAt}>{scan.startedAt}</time>
            </dd>
          </div>
        )}
        {scan.completedAt && (
          <div>
            <dt>Completed</dt>
            <dd>
              <time dateTime={scan.completedAt}>{scan.completedAt}</time>
            </dd>
          </div>
        )}
        {scan.failedAt && (
          <div>
            <dt>Failed</dt>
            <dd>
              <time dateTime={scan.failedAt}>{scan.failedAt}</time>
            </dd>
          </div>
        )}
        {scan.error && (
          <div>
            <dt>Error</dt>
            <dd>
              <code>{scan.error.code}</code>: {scan.error.message}
            </dd>
          </div>
        )}
      </dl>
    </section>
  );
}
