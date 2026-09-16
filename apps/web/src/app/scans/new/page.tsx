/**
 * GET /scans/new — Scan creation page.
 *
 * Server component that renders the scan creation form. The form itself
 * is a client component (`ScanForm`) that handles URL input, validation,
 * submission, and navigation to `/scans/{id}` on success.
 *
 * The page provides a back link to `/scans` for users who want to
 * cancel and return to scan history.
 */

import Link from 'next/link';
import { ScanForm } from '@/components/ScanForm';
import styles from './page.module.css';

export default function NewScanPage(): React.ReactElement {
  return (
    <main className={styles.main}>
      <h1 className={styles.title}>New Scan</h1>
      <p className={styles.subtitle}>Enter a target URL to start scanning.</p>
      <Link href="/scans" className={styles.backLink}>
        ← Back to scan history
      </Link>
      <ScanForm />
    </main>
  );
}
