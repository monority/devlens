/**
 * GET /scans — Scan history page.
 *
 * Server component that fetches all scan results from the API and
 * passes them to the `ScanHistory` client component, which handles
 * client-side filtering (search by target URL + status filter) and
 * URL state sync. Handles the loading and error states at the server
 * level — the client receives fully rendered HTML with no layout shift
 * for data.
 *
 * Navigation: each scan card links to `/scans/{id}` for the detail view.
 */

import Link from 'next/link';
import { fetchScans } from '@/lib/api';
import { ScansError } from '@/components/ScanViews';
import { ScanHistory } from '@/components/ScanHistory';
import { ScanComparisonSelector } from '@/components/ScanComparisonSelector';
import styles from './page.module.css';

export default async function ScansPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  // searchParams is consumed by ScanHistory (client) for URL state sync.
  // Here we await it so the server waits for it to be available.
  await searchParams;

  try {
    const data = await fetchScans();
    return (
      <main className={styles.main}>
        <div className={styles.header}>
          <h1 className={styles.title}>DevLens</h1>
          <p className={styles.subtitle}>Scan History</p>
          <Link href="/scans/new" className={styles.newScanLink}>
            + New scan
          </Link>
        </div>
        <ScanHistory scans={data.scans} />
        <ScanComparisonSelector scans={data.scans} />
      </main>
    );
  } catch {
    return (
      <main className={styles.main}>
        <div className={styles.header}>
          <h1 className={styles.title}>DevLens</h1>
          <p className={styles.subtitle}>Scan History</p>
          <Link href="/scans/new" className={styles.newScanLink}>
            + New scan
          </Link>
        </div>
        <ScansError />
      </main>
    );
  }
}
