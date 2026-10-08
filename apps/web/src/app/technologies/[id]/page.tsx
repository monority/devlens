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
import { TechnologyScansView } from '@/components/TechnologyScansView';
import type { TechnologyScanSummary, TechnologyScansResponse } from '@/lib/types';
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
 * Fetches the first page of scans that detected the given technology ID.
 *
 * Calls the internal `GET /api/scans?technologyId=<id>&limit=50` endpoint (the
 * F-001 boundary fix — the page no longer touches PostgreSQL directly). A
 * single bulk retrieval (one `listScansByTechnology` query → one repository
 * `list()` call) returns the scans whose detections include this technology,
 * plus pagination (`nextCursor` / `hasMore`) and a global `summary`
 * (`scanCount` / `firstDetectedAt`) for the Step 89 rollup. The returned
 * `detections` are the raw domain `Detection` objects — the client view's
 * `technologyDetectionHistory` projection reuses the scan-detail detection
 * pipeline (`detectionToResponse` → `getScanDetectionResults`) to derive
 * provenance, integrity and signal quality, so no per-detection API
 * round-trip is required.
 *
 * Only completed scans carry detections — failed, pending, and running scans
 * have empty detection arrays — so the result set is inherently restricted to
 * completed-scan results.
 *
 * Returns `null` on error (API/infrastructure failure), so the caller can
 * render an error state.
 */
async function fetchDetectedScansPage(techId: string): Promise<TechnologyScansResponse | null> {
  try {
    return await fetchScansByTechnology(techId, { limit: 50 });
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

  // First page of technology-detected scans (server-side, single bulk fetch).
  // The interactive client view (history / timeline / Load-more) lives in
  // `TechnologyScansView`, which receives this first page and the aggregate
  // summary, then fetches + accumulates subsequent pages.
  const data = await fetchDetectedScansPage(id);
  const detectedScans: TechnologyScanSummary[] | null = data?.scans ?? null;

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

      {/* Scans / history / timeline + "Load more": interactive client view that
          accumulates paginated pages (Step 99). Passed the first page fetched
          server-side above plus the global aggregate summary. */}
      <TechnologyScansView
        techId={id}
        initialScans={detectedScans}
        initialNextCursor={data?.nextCursor ?? null}
        initialHasMore={data?.hasMore ?? false}
        aggregateSummary={data?.summary ?? null}
      />

      <div className={styles.footer}>
        <Link href="/technologies" className={styles.backLink}>
          ← Back to technology catalog
        </Link>
      </div>
    </main>
  );
}
