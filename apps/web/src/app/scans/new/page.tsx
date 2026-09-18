/**
 * GET /scans/new — Scan creation page.
 *
 * Server component that renders the scan creation form. The form itself
 * is a client component (`ScanForm`) that handles URL input, validation,
 * submission, and navigation to `/scans/{id}` on success.
 *
 * The page provides a back link to `/scans` for users who want to
 * cancel and return to scan history.
 *
 * A brief helper text explains the end-to-end journey: after entering a
 * URL and submitting, the page navigates to the scan results view.
 *
 * Re-scan support: accepts an optional `target` query parameter (set by
 * the "Re-scan" action on the scan detail page). When present, the value
 * is passed to `ScanForm` as `initialUrl` to pre-fill the URL input.
 * The form is NOT auto-submitted — the user must explicitly confirm.
 * The pre-filled value goes through the same client-side validation and
 * server-side verification as any user-typed input.
 */

import Link from 'next/link';
import { ScanForm } from '@/components/ScanForm';
import styles from './page.module.css';

export default async function NewScanPage({
  searchParams,
}: {
  searchParams?: Promise<{ target?: string }>;
}): Promise<React.ReactElement> {
  const sp = await searchParams;
  const target = sp?.target ?? '';

  return (
    <main className={styles.main}>
      <h1 className={styles.title}>New Scan</h1>
      <p className={styles.subtitle}>Enter a target URL to start scanning.</p>
      <p className={styles.helperText}>
        DevLens will crawl the target, analyze it for supported technologies, and take you to the
        results page.
      </p>
      <Link href="/scans" className={styles.backLink}>
        ← Back to scan history
      </Link>
      <ScanForm initialUrl={target} />
    </main>
  );
}
