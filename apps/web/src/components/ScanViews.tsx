/**
 * Presentation components for scan history and detail views.
 *
 * These components are pure — they receive data as props and render
 * HTML. They do not fetch data, call APIs, or access the database.
 * All data comes from the typed response shapes defined in `lib/types.ts`.
 *
 * Tested via `renderToString` from `react-dom/server` — no DOM
 * environment required, consistent with the existing node-based test
 * setup.
 *
 * Architecture (Step 25):
 *
 *   ScanDetailView  (orchestrator for all states)
 *     ├─ ScanSummary       (scan metadata: target, status, timeline)
 *     ├─ Snapshot          (HTTP + HTML observations, if available)
 *     ├─ ScanningState     (pending/running UI — preserved from Step 24)
 *     ├─ DetectionList     (ranked detection list)
 *         └─ DetectionItem  (technology + confidence + evidence)
 *             └─ EvidenceList
 *                 └─ EvidenceItem  (per-type rendering via presenter)
 *     └─ EmptyDetections  (completed with zero detections)
 *
 * Step 25 sub-components (DetectionItem, EvidenceList, etc.) live in
 * their own files and are imported here. They consume only typed API
 * data — no domain, database, or detector imports.
 */

import Link from 'next/link';
import { isScanning } from '../lib/scan-utils';
import type { ScanSummary, ScanDetailResponse, SnapshotResponse } from '../lib/types.js';
import { ScanSummary as ScanSummarySection } from './ScanSummary';
import { ScanInsights } from './ScanInsights';
import { DetectionList } from './DetectionList';
import styles from './ScanCard.module.css';

// ─── Scan status badge helpers ────────────────────────────────────────

/**
 * Returns a human-readable label for a scan status.
 */
export function statusLabel(status: string): string {
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
 * Returns a CSS class key for a scan status (for color coding).
 */
export function statusClass(status: string): string {
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

// ─── Scan summary card (history list) ─────────────────────────────────

/**
 * A compact card showing the essential summary of a single scan.
 * Used in the history list. Links to the detail page.
 */
export function ScanCard({ scan }: { scan: ScanSummary }): React.ReactElement {
  const status = statusLabel(scan.status);
  const statusCss = statusClass(scan.status);

  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <span className={`${styles.statusBadge} ${statusCss}`}>{status}</span>
        <time dateTime={scan.createdAt}>{scan.createdAt}</time>
      </div>
      <div className={styles.cardBody}>
        <p className={styles.target}>{scan.target}</p>
        <p className={styles.hostname}>{scan.hostname}</p>
      </div>
      <div className={styles.cardFooter}>
        <Link href={`/scans/${scan.id}`}>View details →</Link>
      </div>
    </div>
  );
}

// ─── Scans history (list) ────────────────────────────────────────────

/**
 * Renders the scan history list — or an empty state, or an error state,
 * depending on the data provided.
 *
 * This is a pure component — it does not fetch data or manage state.
 * The server component page handles data fetching and error catching,
 * then passes the result here.
 *
 * The `/scans` page shows all scan statuses without live polling.
 */
export function ScansHistory({ scans }: { scans: ScanSummary[] }): React.ReactElement {
  if (scans.length === 0) {
    return (
      <div className={styles.empty}>
        <p>No scans found.</p>
        <p>Start by creating a new scan.</p>
        <Link href="/scans/new">New scan →</Link>
      </div>
    );
  }

  return (
    <div className={styles.list}>
      <header className={styles.listHeader}>
        <h2>Scan History</h2>
        <Link href="/scans/new" className={styles.newScanLink}>
          New scan →
        </Link>
      </header>
      <div className={styles.cards}>
        {scans.map((scan) => (
          <ScanCard key={scan.id} scan={scan} />
        ))}
      </div>
    </div>
  );
}

// ─── Error and not-found states ─────────────────────────────────────

/**
 * Generic error display for when the API is unreachable or returns 500.
 */
export function ScansError(): React.ReactElement {
  return (
    <div className={styles.error}>
      <h2>Unable to load scans</h2>
      <p>There was a problem fetching scan history. Please try again later.</p>
    </div>
  );
}

/**
 * 404 display for when a scan ID is not found.
 */
export function ScanNotFound({ id }: { id: string }): React.ReactElement {
  return (
    <div className={styles.notFound}>
      <h2>Scan not found</h2>
      <p>
        No scan with ID <code>{id}</code> exists.
      </p>
      <Link href="/scans">← Back to scan history</Link>
    </div>
  );
}

// ─── Snapshot section ────────────────────────────────────────────────

/**
 * Renders the snapshot metadata (HTTP status, content type, HTML title/description).
 * Shown only for completed scans that have a snapshot.
 */
export function Snapshot({ snapshot }: { snapshot: SnapshotResponse }): React.ReactElement {
  return (
    <section className={styles.snapshot}>
      <h2>Snapshot</h2>
      <dl className={styles.summaryMeta}>
        <div>
          <dt>Captured</dt>
          <dd>
            <time dateTime={snapshot.capturedAt}>{snapshot.capturedAt}</time>
          </dd>
        </div>
        <div>
          <dt>Final URL</dt>
          <dd className={styles.wordBreak}>{snapshot.http.finalUrl}</dd>
        </div>
        <div>
          <dt>HTTP Status</dt>
          <dd>{snapshot.http.statusCode}</dd>
        </div>
        <div>
          <dt>Content Type</dt>
          <dd>{snapshot.http.contentType}</dd>
        </div>
        <div>
          <dt>Title</dt>
          <dd>{snapshot.html.title}</dd>
        </div>
        {snapshot.html.description && (
          <div>
            <dt>Description</dt>
            <dd className={styles.wordBreak}>{snapshot.html.description}</dd>
          </div>
        )}
      </dl>
    </section>
  );
}

// ─── Scanning state (pending / running) ───────────────────────────────

/**
 * Renders the "in progress" UI for pending and running scans.
 * Preserved from Step 24 — does not regress lifecycle behavior.
 */
export function ScanningState({ scan }: { scan: ScanDetailResponse['scan'] }): React.ReactElement {
  const label = scan.status === 'pending' ? 'Queued' : 'Scanning';
  const desc =
    scan.status === 'pending'
      ? 'The scan is queued and waiting to start.'
      : 'The scan is currently running.';

  return (
    <section className={styles.scanning}>
      <h2>{label} in progress</h2>
      <p>{desc} This page will refresh automatically when the scan completes.</p>
      <p>
        <strong>Started</strong>:{' '}
        {scan.startedAt ? (
          <time dateTime={scan.startedAt}>{scan.startedAt}</time>
        ) : (
          <em>not yet</em>
        )}
      </p>
    </section>
  );
}

// ─── Scan detail view (orchestrator) ──────────────────────────────────

/**
 * Renders the full detail view of a single scan result.
 *
 * Delegates to sub-components for each section:
 *   - ScanSummary  (target, status, timeline)
 *   - Snapshot     (HTTP + HTML observations)
 *   - ScanningState (pending/running UI)
 *   - DetectionList (completed detections, or EmptyDetections for zero)
 *
 * Lifecycle states (pending/running/failed) are preserved exactly as
 * implemented in Step 24. Only the completed-results presentation is
 * redesigned in Step 25.
 */
export function ScanDetailView({ result }: { result: ScanDetailResponse }): React.ReactElement {
  const { scan, snapshot, detections } = result;

  return (
    <article className={styles.detail}>
      {/* ── Scan metadata ── */}
      <ScanSummarySection scan={scan} />

      {/* ── Technology insights (completed scans only) ── */}
      <ScanInsights result={result} />

      {/* ── Snapshot / scanning state ── */}
      {isScanning(scan.status) ? (
        <ScanningState scan={scan} />
      ) : (
        snapshot && <Snapshot snapshot={snapshot} />
      )}

      {/* ── Detections ── */}
      <section className={styles.detections}>
        {isScanning(scan.status) ? (
          <>
            <h2>Detections (pending)</h2>
            <p>Detection results will appear after the scan completes.</p>
          </>
        ) : (
          <DetectionList detections={detections} />
        )}
      </section>
    </article>
  );
}
