/**
 * GET /technologies/:id — Technology detail page.
 *
 * Server component that renders a single technology's detail page.
 * Uses `notFound()` for unknown technology IDs.
 *
 * Metadata: page `<title>` is `DevLens — {Technology Name}`, derived
 * from the catalog. Unknown IDs get a generic "not found" title —
 * no arbitrary user-controlled IDs are leaked into metadata.
 *
 * Data loading:
 * - Technology metadata is read from the in-memory catalog (`getTechnologyById`).
 * - Scan detection data is loaded server-side via `getAllScanResults()`,
 *   which reuses the existing `listScans` application-layer query. This
 *   fetches all scan results (including detections) in a single query —
 *   no N+1 pattern. Unknown IDs do not trigger a data fetch.
 *
 * Matching semantics:
 * A scan appears in the "Detected in scans" section only when that
 * technology's canonical ID is present in the scan's detections. Only
 * completed scans carry detections (by domain-model design), so the
 * section inherently shows completed-scan results.
 */

import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getTechnologyById } from '@/lib/technology-catalog';
import { getAllScanResults, scanResultToSummary } from '@/lib/scan-data';
import { TechnologyDetectedInScans } from '@/components/TechnologyDetectedInScans';
import type { ScanSummary } from '@/lib/types';
import styles from './page.module.css';

/**
 * Server-side metadata generation.
 *
 * Derives the page title from the technology name. Falls back to a
 * generic title for unknown IDs — does not leak the raw ID into metadata.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const tech = getTechnologyById(id);
  if (tech === null) {
    return {
      title: 'DevLens — Technology Not Found',
      description: 'The requested technology was not found in the DevLens catalog.',
    };
  }
  return {
    title: `DevLens — ${tech.name}`,
    description: tech.description,
  };
}

/**
 * Fetches scan results that detected the given technology ID.
 *
 * Reuses `getAllScanResults()` (which calls `listScans` from
 * `@devlens/application`) to fetch all scan results in a single
 * query. Filters in-memory by checking each scan's detections for
 * the canonical technology ID.
 *
 * Only completed scans carry detections — failed, pending, and
 * running scans have empty detection arrays. So the result set
 * is inherently restricted to completed scans.
 *
 * Returns `null` on error (database/infrastructure failure),
 * so the caller can render an error state.
 */
async function fetchDetectedScans(techId: string): Promise<ScanSummary[] | null> {
  try {
    const results = await getAllScanResults();
    return results
      .filter((result) => result.detections.some((d) => d.technology.id === techId))
      .map(scanResultToSummary);
  } catch {
    return null;
  }
}

export default async function TechnologyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.ReactElement> {
  const { id } = await params;
  const tech = getTechnologyById(id);

  if (tech === null) {
    notFound();
  }

  const detectedScans = await fetchDetectedScans(id);

  return (
    <main className={styles.main}>
      <div className={styles.header}>
        <h1 className={styles.title}>{tech.name}</h1>
        <p className={styles.subtitle}>
          ID: <code className={styles.techId}>{tech.id}</code>
        </p>
      </div>

      <div className={styles.detail}>
        <dl className={styles.detailMeta}>
          <div>
            <dt>Category</dt>
            <dd>{tech.category}</dd>
          </div>
          <div>
            <dt>Description</dt>
            <dd>{tech.description}</dd>
          </div>
        </dl>
      </div>

      <TechnologyDetectedInScans scans={detectedScans} />

      <div className={styles.footer}>
        <Link href="/technologies" className={styles.backLink}>
          ← Back to technology catalog
        </Link>
      </div>
    </main>
  );
}
