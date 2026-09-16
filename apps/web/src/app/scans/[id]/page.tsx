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
 * Navigation: a "back" link is available in all states.
 * A failed scan is displayed as a valid result with its error information.
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
          <div className={styles.detailHeader}>
            <h1 className={styles.title}>DevLens</h1>
            <p className={styles.subtitle}>Scan Detail</p>
            <Link href="/scans" className={styles.backLink}>
              ← Back to scan history
            </Link>
          </div>
          <ScanNotFound id={id} />
        </main>
      );
    }

    return (
      <main className={styles.main}>
        <div className={styles.detailHeader}>
          <h1 className={styles.title}>DevLens</h1>
          <p className={styles.subtitle}>
            Scan <code className={styles.scanId}>{result.scan.id}</code>
            {isTerminal(result.scan.status) && (
              <span className={styles.detectionCount}>· {result.detections.length} detections</span>
            )}
          </p>
          <Link href="/scans" className={styles.backLink}>
            ← Back to scan history
          </Link>
          <Link
            href={`/scans/compare?left=${encodeURIComponent(id)}`}
            className={styles.compareLink}
          >
            Compare with another scan
          </Link>
          <CopyReportLink scanId={result.scan.id} />
          <ExportScanButton result={result} />
        </div>
        <ScanLifecycle
          scanId={id}
          initialResult={result}
          initialQuery={query}
          initialCategory={category}
        />
      </main>
    );
  } catch {
    return (
      <main className={styles.main}>
        <div className={styles.detailHeader}>
          <h1 className={styles.title}>DevLens</h1>
          <p className={styles.subtitle}>Scan Detail</p>
          <Link href="/scans" className={styles.backLink}>
            ← Back to scan history
          </Link>
        </div>
        <ScansError />
      </main>
    );
  }
}
