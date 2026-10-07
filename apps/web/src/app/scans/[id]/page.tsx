/**
 * GET /scans/:id — Scan detail page.
 *
 * Server component that fetches a single scan result by ID from the API
 * and renders the ScanLifecycle client component for lifecycle-aware
 * polling (pending/running scans auto-refresh; completed/failed do not).
 *
 * Handles three states:
 * - Scan found (including failed scans): renders ScanLifecycle → ScanDetailView (200)
 * - Scan not found (404): renders ScanNotFound component
 * - API/Infrastructure error (500): renders ScansError component
 *
 * Metadata: page `<title>` and `<meta name="description">` are derived
 * from the scan target via `generateMetadata`. Only the target URL
 * (already present in the API response) is used — no internal errors,
 * database IDs, or stack traces are included.
 *
 * Copy link: a "Copy report link" button is available for found scans,
 * using the browser Clipboard API (no dependencies).
 *
 * Export JSON: an "Export JSON" button is available for found scans,
 * downloading the scan result as a versioned JSON file using browser-native
 * Blob + URL.createObjectURL APIs (no dependencies).
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { fetchScanById } from '@/lib/api';
import { ScanNotFound, ScansError } from '@/components/ScanViews';
import { ScanLifecycle } from '@/components/ScanLifecycle';
import { CopyReportLink } from '@/components/CopyReportLink';
import { ExportScanButton } from '@/components/ExportScanButton';
import { ScanStatusBadge } from '@/components/ScanStatusBadge';
import { generateDetailMetadata } from '@/lib/report-metadata';
import { isTerminal } from '@/lib/scan-utils';
import styles from './page.module.css';

/**
 * Server-side metadata generation.
 *
 * Fetches the scan to derive the page title from the target URL.
 * Falls back to generic metadata on 404 or API error.
 * Never includes raw internal errors, database IDs, or stack traces.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  try {
    const result = await fetchScanById(id);
    return generateDetailMetadata(result);
  } catch {
    return {
      title: 'DevLens — Error',
      description: 'An error occurred while loading the scan report.',
    };
  }
}

export default async function ScanDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string; category?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const query = sp?.q ?? '';
  const category = sp?.category ?? '';

  try {
    const result = await fetchScanById(id);

    if (result === null) {
      return (
        <main className={styles.main}>
          <div className={styles.container}>
            <div className={styles.detailHeader}>
              <div className={styles.headerTop}>
                <h1 className={styles.brandTitle}>DevLens</h1>
                <nav aria-label="Actions">
                  <Link href="/scans" className={`${styles.actionBtn} ${styles.actionPrimary}`}>
                    ← Back to scan history
                  </Link>
                </nav>
              </div>
              <p className={styles.scanMeta}>
                <span className={styles.scanId}>{id}</span>
              </p>
            </div>
            <ScanNotFound id={id} />
          </div>
        </main>
      );
    }

    const isCompleted = result.scan.status === 'completed';

    return (
      <main className={styles.main}>
        <div className={styles.container}>
          <div className={styles.detailHeader}>
            <div className={styles.headerTop}>
              <h1 className={styles.brandTitle}>DevLens</h1>
              <div className={styles.actions}>
                <Link href="/scans" className={styles.actionBtn}>
                  ← Back to history
                </Link>
                {isCompleted && (
                  <Link
                    href={`/scans/compare?left=${encodeURIComponent(id)}`}
                    className={`${styles.actionBtn} ${styles.actionSecondary}`}
                  >
                    Compare
                  </Link>
                )}
                {result.scan.target ? (
                  <Link
                    href={`/scans/new?target=${encodeURIComponent(result.scan.target)}`}
                    className={styles.actionBtn}
                  >
                    Re-scan
                  </Link>
                ) : null}
                <Link href="/scans/new" className={styles.actionBtn}>
                  New scan
                </Link>
              </div>
            </div>

            <div className={styles.scanMeta}>
              <ScanStatusBadge
                status={
                  result.scan.status as 'pending' | 'running' | 'completed' | 'failed'
                }
              />
              {isTerminal(result.scan.status) && (
                <span className={styles.detectionCount}>
                  · {result.detections.length} detections
                </span>
              )}
              <span className={styles.scanId}>{result.scan.id}</span>
            </div>

            {result.scan.target && (
              <div className={styles.targetUrl}>
                {result.scan.target}
                {result.snapshot?.hostname && (
                  <span className={styles.targetHostname}>
                    {' '}
                    ↗ {result.snapshot.hostname}
                  </span>
                )}
              </div>
            )}

            <CopyReportLink scanId={result.scan.id} />
            <ExportScanButton result={result} />
          </div>

          <ScanLifecycle
            scanId={id}
            initialResult={result}
            initialQuery={query}
            initialCategory={category}
          />
        </div>
      </main>
    );
  } catch {
    return (
      <main className={styles.main}>
        <div className={styles.container}>
          <div className={styles.detailHeader}>
            <div className={styles.headerTop}>
              <h1 className={styles.brandTitle}>DevLens</h1>
              <nav aria-label="Actions">
                <Link href="/scans" className={`${styles.actionBtn} ${styles.actionPrimary}`}>
                  ← Back to scan history
                </Link>
                <Link href="/scans/new" className={styles.actionBtn}>
                  New scan
                </Link>
              </nav>
            </div>
            <div className={styles.scanMeta}>
              <span className={styles.scanId}>{id}</span>
            </div>
          </div>
          <ScansError />
        </div>
      </main>
    );
  }
}
