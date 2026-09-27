/**
 * GET /scans/compare — Scan comparison page.
 *
 * Server component that reads `left` and `right` query parameters,
 * fetches both scans via the existing HTTP API, and renders the
 * `ScanComparison` presentation component.
 *
 * Handles:
 * - Missing query params (both left and right must be provided)
 * - 404 (one or both scans not found)
 * - API errors (500)
 * - Successful comparison of any combination of statuses
 *
 * No backend infrastructure changes — uses existing `GET /api/scans/:id`.
 */

import Link from 'next/link';
import { fetchScanById, fetchScans } from '@/lib/api';
import { isComparable } from '@/lib/comparison-selector';
import { compareScans } from '@/lib/comparison';
import { ScansError } from '@/components/ScanViews';
import { ScanComparison } from '@/components/ScanComparison';
import { ScanComparisonSelector } from '@/components/ScanComparisonSelector';
import styles from '../page.module.css';

/**
 * Renders a notice when the compare page is missing required query params.
 */
function MissingParams(): React.ReactElement {
  return (
    <main className={styles.main}>
      <div className={styles.header}>
        <h1 className={styles.title}>Scan Comparison</h1>
        <p className={styles.subtitle}>Missing scan IDs</p>
      </div>
      <p>
        Both <code>left</code> and <code>right</code> query parameters are required.
      </p>
      <p>
        <Link href="/scans" className={styles.newScanLink}>
          ← Back to scan history
        </Link>
      </p>
    </main>
  );
}

export default async function ScanComparisonPage({
  searchParams,
}: {
  searchParams: Promise<{ left?: string; right?: string }>;
}) {
  const { left, right } = await searchParams;

  // No left at all — genuinely missing parameters.
  if (!left) {
    return <MissingParams />;
  }

  // Only `left` is provided — this is the entry point used by the scan-detail
  // "Compare with another scan" link, which pre-seeds `left` for the current
  // scan. Let the user pick the scan to compare it against via the existing
  // selection UI, reusing the canonical `ScanComparisonSelector` (no new
  // comparison/detection logic — the selector delegates to the same
  // `/scans/compare?left=…&right=…` route once both are chosen).
  if (!right) {
    try {
      const scansResult = await fetchScans();
      const leftSummary = scansResult.scans.find((s) => s.id === left);
      if (leftSummary && isComparable(leftSummary)) {
        return (
          <main className={styles.main}>
            <div className={styles.header}>
              <h1 className={styles.title}>Compare scans</h1>
              <p className={styles.subtitle}>
                Comparing scan <code>{left}</code>. Choose another scan to compare it against.
              </p>
            </div>
            <ScanComparisonSelector scans={scansResult.scans} defaultLeft={left} />
          </main>
        );
      }
    } catch {
      return (
        <main className={styles.main}>
          <div className={styles.header}>
            <h1 className={styles.title}>Scan Comparison</h1>
            <p className={styles.subtitle}>Error loading scans</p>
          </div>
          <ScansError />
        </main>
      );
    }

    // `left` is missing from the list or not comparable — fall back to the
    // missing-parameters notice.
    return <MissingParams />;
  }

  try {
    // Fetch both scans concurrently via the existing HTTP API.
    const [leftResult, rightResult] = await Promise.all([
      fetchScanById(left),
      fetchScanById(right),
    ]);

    // Compare — pure function, no side effects.
    const comparison = compareScans(leftResult, rightResult);

    return (
      <main className={styles.main}>
        <div className={styles.header}>
          <h1 className={styles.title}>Scan Comparison</h1>
          <p className={styles.subtitle}>
            Comparing scan <code>{left}</code> with scan <code>{right}</code>
          </p>
        </div>
        <ScanComparison result={comparison} />
      </main>
    );
  } catch {
    return (
      <main className={styles.main}>
        <div className={styles.header}>
          <h1 className={styles.title}>Scan Comparison</h1>
          <p className={styles.subtitle}>Error loading scans</p>
        </div>
        <ScansError />
      </main>
    );
  }
}
