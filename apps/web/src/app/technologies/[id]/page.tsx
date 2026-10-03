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
 * - Scan detection data is loaded server-side via `fetchScansByTechnology`,
 *   which calls the internal `GET /api/scans?technologyId=...` endpoint. The
 *   endpoint fetches exactly the scans that detected this technology in a
 *   single bulk retrieval (one repository `list()` call) — no N+1 pattern and
 *   no direct database access from the page. Unknown technology IDs do not
 *   trigger a data fetch (the page calls `notFound()` first via the catalog).
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
import { fetchScansByTechnology } from '@/lib/api';
import { technologyDetectionHistory } from '@/lib/technology-detection-history';
import { technologyDetectionHistorySummary } from '@/lib/technology-detection-history-summary';
import { TechnologyDetectedInScans } from '@/components/TechnologyDetectedInScans';
import { TechnologyDetectionHistorySummary } from '@/components/TechnologyDetectionHistorySummary';
import { TechnologyDetectionTimeline } from '@/components/TechnologyDetectionTimeline';
import type { ScanSummary, TechnologyScanSummary } from '@/lib/types';
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
 * Fetches the scans that detected the given technology ID.
 *
 * Calls the internal `GET /api/scans?technologyId=<id>` endpoint, which
 * performs a single bulk retrieval (one `listScansByTechnology` query → one
 * repository `list()` call) and returns only the scans whose detections
 * include the requested technology. The returned `detections` are the raw
 * domain `Detection` objects — the page's `technologyDetectionHistory`
 * projection reuses the exact scan-detail pipeline (`detectionToResponse` →
 * `getScanDetectionResults`) to derive provenance, integrity and signal
 * quality, so no per-detection API round-trip is required.
 *
 * Only completed scans carry detections — failed, pending, and running scans
 * have empty detection arrays — so the result set is inherently restricted to
 * completed-scan results.
 *
 * Returns `null` on error (API/infrastructure failure), so the caller can
 * render an error state.
 */
async function fetchDetectedScans(techId: string): Promise<TechnologyScanSummary[] | null> {
  try {
    const data = await fetchScansByTechnology(techId);
    return data.scans;
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

  // The endpoint already returns the scans that detected this technology
  // (filtered server-side). Derive compact scan summaries for the existing
  // `TechnologyDetectedInScans` cards, and project the timeline history from
  // the same response — reusing the scan-detail detection pipeline (no
  // per-detection N+1) so provenance/integrity/signal-quality stay identical.
  const scanSummaries: ScanSummary[] | null = detectedScans
    ? detectedScans.map((s) => s.scan)
    : null;
  const detectionHistory = detectedScans ? technologyDetectionHistory(detectedScans, id) : [];
  // Compact quality/stability summary (Step 89), derived from the same history.
  const detectionHistorySummary = detectedScans
    ? technologyDetectionHistorySummary(detectionHistory)
    : null;

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

      <TechnologyDetectedInScans scans={scanSummaries} />

      {/* Step 89: compact stability summary, placed immediately before the
          detailed timeline per §6. Renders nothing when there is no history. */}
      <TechnologyDetectionHistorySummary summary={detectionHistorySummary} />

      <TechnologyDetectionTimeline entries={detectionHistory} />

      <div className={styles.footer}>
        <Link href="/technologies" className={styles.backLink}>
          ← Back to technology catalog
        </Link>
      </div>
    </main>
  );
}
