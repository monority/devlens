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
import { getScanOverview } from '../lib/scan-overview';
import { summarizeIntegrity } from '../lib/detection-integrity-presenter';
import type {
  ScanSummary,
  ScanDetailResponse,
  SnapshotResponse,
  DetectionResponse,
} from '../lib/types.js';
import { ScanSummary as ScanSummarySection } from './ScanSummary';
import { ScanOverview } from './ScanOverview';
import { ScanInsights } from './ScanInsights';
import { DetectionCoverage } from './DetectionCoverage';
import { DetectionList } from './DetectionList';
import { DetectionFilterView } from './DetectionFilterView';
import { ScanDetectionResults } from './ScanDetectionResults';
import { ObservationCoverageSummary } from './ObservationCoverageSummary';
import { ResultQualitySummary } from './ResultQualitySummary';
import { DetectionIntegritySummary } from './DetectionIntegritySummary';
import { ScanStatusBadge } from './ScanStatusBadge';
import { EMPTY_OBSERVATION_COVERAGE, EMPTY_SCAN_RESULT_QUALITY } from '@devlens/core';
import styles from './ScanCard.module.css';
import detailStyles from '../app/scans/[id]/page.module.css';

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
 *
 * `sameTargetCount` is the number of scans in the full history that share
 * this scan's target URL. When greater than 1, a compact indicator is
 * shown so users can distinguish repeated scans of the same target.
 */
export function ScanCard({
  scan,
  sameTargetCount = 0,
}: {
  scan: ScanSummary;
  /** Number of scans in the history sharing this scan's target. */
  sameTargetCount?: number;
}): React.ReactElement {
  const status = statusLabel(scan.status);
  const statusCss = statusClass(scan.status);

  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <span className={`${styles.statusBadge} ${statusCss}`}>{status}</span>
        <time dateTime={scan.createdAt}>{scan.createdAt}</time>
        {/* Terminal timestamp for terminal scans (completed/failed). Only
            terminal scans carry a `completedAt`/`failedAt` (pending/running do
            not by domain-model design — see docs/architecture/api.md). */}
        {scan.status === 'completed' && scan.completedAt && (
          <time dateTime={scan.completedAt} className={styles.terminalTime}>
            {scan.completedAt}
          </time>
        )}
        {scan.status === 'failed' && scan.failedAt && (
          <time dateTime={scan.failedAt} className={styles.terminalTime}>
            {scan.failedAt}
          </time>
        )}
      </div>
      <div className={styles.cardBody}>
        <p className={styles.target}>{scan.target}</p>
        {sameTargetCount > 1 && (
          <span className={styles.sameTargetCount}>
            {sameTargetCount} scan{sameTargetCount === 1 ? '' : 's'}
          </span>
        )}
        <p className={styles.hostname}>{scan.hostname}</p>
        {/* Failure reason (Step 88 15B) — code + message so a failed scan is
            actionable from the card without opening the detail page. */}
        {scan.status === 'failed' && scan.error && (
          <p className={styles.scanError}>
            {scan.error.code}: {scan.error.message}
          </p>
        )}
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
      <Link href="/scans/new">New scan →</Link>
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

// ─── Detections rendering (S3358: extracted from nested ternary) ──────

/**
 * Renders the detections section based on scan status and available filters.
 * Handles: scanning, completed-with-query, completed-without-query, failed,
 * and fallback states (S3358: extracted from a 4-level nested ternary).
 */
function renderDetections(
  status: ScanDetailResponse['scan']['status'],
  detections: DetectionResponse[],
  scanId: string,
  initialQuery: string | undefined,
  initialCategory: string | undefined,
  observationCoverage: ScanDetailResponse['observationCoverage'],
): React.ReactNode {
  if (isScanning(status)) {
    return (
      <>
        <h2>Detections (pending)</h2>
        <p>Detection results will appear after the scan completes.</p>
      </>
    );
  }
  if (status === 'completed' && initialQuery !== undefined) {
    return (
      <DetectionFilterView
        detections={detections}
        scanId={scanId}
        initialQuery={initialQuery}
        initialCategory={initialCategory ?? ''}
      />
    );
  }
  if (status === 'completed') {
    return (
      <ScanDetectionResults detections={detections} observationCoverage={observationCoverage} />
    );
  }
  if (status === 'failed') {
    return (
      <>
        <h2>Detections (0)</h2>
        <p>Detection results are not available because the scan failed.</p>
      </>
    );
  }
  return <DetectionList detections={detections} observationCoverage={observationCoverage} />;
}

/**
 * Renders the full detail view of a single scan result.
 *
 * Delegates to sub-components for each section:
 *   - ScanOverview   (scan metadata + metrics, completed scans only)
 *   - ScanInsights   (technology insights, completed scans only)
 *   - Snapshot       (HTTP + HTML observations)
 *   - ScanningState  (pending/running UI)
 *   - ScanDetectionResults / DetectionFilterView (completed detections,
 *     sorted deterministically by confidence DESC, name ASC)
 *   - DetectionList  (fallback for any remaining non-terminal state)
 *
 * Lifecycle states (pending/running/failed) are preserved exactly as
 * implemented in Step 24. Only the completed-results presentation is
 * enhanced in Step 38.
 *
 * Failed scans show a clear "not available" message in the detections
 * section instead of the completed-scan empty state ("The scan completed
 * successfully"). Detection results are inherently unavailable for
 * failed scans — the scan never completed successfully.
 */
export interface ScanDetailViewProps {
  result: ScanDetailResponse;
  /** Initial search query from URL (for client-side detection filtering) */
  initialQuery?: string;
  /** Initial category filter from URL (for client-side detection filtering) */
  initialCategory?: string;
}

export function ScanDetailView({
  result,
  initialQuery,
  initialCategory,
}: ScanDetailViewProps): React.ReactElement {
  const { scan, snapshot, detections } = result;
  const isCompleted = scan.status === 'completed';

  return (
    <article className={detailStyles.detailContent}>
      {/* ── Scan overview / summary ── */}
      {isCompleted ? (
        <section className={detailStyles.section}>
          <h2 className={detailStyles.sectionTitle}>Overview</h2>
          <ScanOverview overview={getScanOverview(result)} />
        </section>
      ) : (
        <section className={detailStyles.section}>
          <h2 className={detailStyles.sectionTitle}>Scan Status</h2>
          <div className={detailStyles.scanMeta}>
            <ScanStatusBadge
              status={scan.status as 'pending' | 'running' | 'completed' | 'failed'}
            />
            <span className={detailStyles.detectionCount}>
              {detections.length} technologies detected
            </span>
          </div>
          <ScanSummarySection scan={scan} />
        </section>
      )}

      {/* ── Observation coverage / blind-spots (completed scans only) ── */}
      {isCompleted && (
        <section className={detailStyles.section}>
          <h2 className={detailStyles.sectionTitle}>Observation Coverage</h2>
          <ObservationCoverageSummary
            coverage={result.observationCoverage ?? EMPTY_OBSERVATION_COVERAGE}
          />
        </section>
      )}

      {/* ── Scan-level result quality (Step 79) ── */}
      {isCompleted && (
        <section className={detailStyles.section}>
          <h2 className={detailStyles.sectionTitle}>Result Quality</h2>
          <ResultQualitySummary resultQuality={result.resultQuality ?? EMPTY_SCAN_RESULT_QUALITY} />
        </section>
      )}

      {/* ── Detection integrity (Step 86) ── */}
      {isCompleted && (
        <section className={detailStyles.section}>
          <h2 className={detailStyles.sectionTitle}>Detection Integrity</h2>
          <DetectionIntegritySummary summary={summarizeIntegrity(result.detections)} />
        </section>
      )}

      {/* ── Technology insights (completed scans only) ── */}
      {isCompleted && (
        <section className={detailStyles.section}>
          <h2 className={detailStyles.sectionTitle}>Technology Insights</h2>
          <ScanInsights result={result} />
        </section>
      )}

      {/* ── Detection coverage (completed scans only) ── */}
      {isCompleted && (
        <section className={detailStyles.section}>
          <h2 className={detailStyles.sectionTitle}>Detection Coverage</h2>
          <DetectionCoverage detections={detections} />
        </section>
      )}

      {/* ── Snapshot / scanning state ── */}
      {isScanning(scan.status) ? (
        <section className={detailStyles.section}>
          <h2 className={detailStyles.sectionTitle}>Scanning in progress</h2>
          <ScanningState scan={scan} />
        </section>
      ) : (
        snapshot && (
          <section className={detailStyles.section}>
            <h2 className={detailStyles.sectionTitle}>Snapshot</h2>
            <Snapshot snapshot={snapshot} />
          </section>
        )
      )}

      {/* ── Detections ── */}
      <section className={detailStyles.section}>
        <h2 className={detailStyles.sectionTitle}>
          {isCompleted ? 'Detected Technologies' : 'Preliminary Results'}
        </h2>
        {renderDetections(
          scan.status,
          detections,
          scan.id,
          initialQuery,
          initialCategory,
          result.observationCoverage,
        )}
      </section>
    </article>
  );
}
