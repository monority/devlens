/**
 * TechnologyScansView — interactive, client-side "Detected in scans" block
 * for the technology detail page.
 *
 * This is a `'use client'` component so it can hold the Load-more state and
 * fetch subsequent pages without a full page navigation. It is the only place
 * that imports the client-safe detection pipeline (`@lib/api` →
 * `technologyDetection-history*` → `TechnologyDetectedInScans` /
 * `TechnologyDetectionHistorySummary` / `TechnologyDetectionTimeline`) on the
 * client; the server component (`technologies/[id]/page.tsx`) only performs the
 * initial page fetch and passes the first page + aggregate summary down.
 */
'use client';

import { useCallback, useState } from 'react';
import { fetchScansByTechnology } from '@/lib/api';
import { technologyDetectionHistory } from '@/lib/technology-detection-history';
import { technologyDetectionHistorySummary } from '@/lib/technology-detection-history-summary';
import { TechnologyDetectedInScans } from '@/components/TechnologyDetectedInScans';
import { TechnologyDetectionHistorySummary } from '@/components/TechnologyDetectionHistorySummary';
import { TechnologyDetectionTimeline } from '@/components/TechnologyDetectionTimeline';
import type {
  ScanSummary,
  TechnologyScanSummary,
  TechnologyScanAggregate,
  TechnologyScansResponse,
} from '@/lib/types';

/** Page size used for every Load-more request — mirrors the API handler. */
const PAGE_SIZE = 50;

export interface TechnologyScansViewProps {
  /** Technology ID — passed to every paginated fetch. */
  techId: string;
  /** First page of scan summaries, fetched server-side by the page. */
  initialScans: TechnologyScanSummary[] | null;
  /** Cursor to the start of the next page (from the first fetch). */
  initialNextCursor: string | null;
  /** Whether a next page exists after the first fetch. */
  initialHasMore: boolean;
  /**
   * Global aggregate rollup (Step 89 summary) returned alongside page 1 — used
   * to override the page-derived `scanCount` / `firstDetectedAt` so the
   * compact summary stays correct as more pages are accumulated.
   */
  aggregateSummary: TechnologyScanAggregate | null;
}

export function TechnologyScansView({
  techId,
  initialScans,
  initialNextCursor,
  initialHasMore,
  aggregateSummary,
}: TechnologyScansViewProps) {
  const [scans, setScans] = useState<TechnologyScanSummary[] | null>(initialScans ?? null);
  const [nextCursor, setNextCursor] = useState<string | null>(initialNextCursor);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loading, setLoading] = useState(false);

  const loadMore = useCallback(async () => {
    if (loading || !hasMore || nextCursor === null) {
      return;
    }
    setLoading(true);
    try {
      const data: TechnologyScansResponse = await fetchScansByTechnology(techId, {
        cursor: nextCursor,
        limit: PAGE_SIZE,
      });
      // Accumulate: keep the existing pages and append the new one.
      setScans((prev) => [...(prev ?? []), ...data.scans]);
      setNextCursor(data.nextCursor);
      setHasMore(data.hasMore);
    } finally {
      setLoading(false);
    }
  }, [techId, nextCursor, hasMore, loading]);

  // Derive the compact view from the accumulated scans, reusing the same
  // scan-detail detection pipeline as the scan detail page (no per-detection
  // API round-trip — provenance/integrity/signal-quality are computed in-memory
  // from the already-fetched `detections`).
  const scanSummaries: ScanSummary[] | null = scans ? scans.map((s) => s.scan) : null;
  const detectionHistory = scans ? technologyDetectionHistory(scans, techId) : [];
  let detectionHistorySummary = technologyDetectionHistorySummary(detectionHistory);

  // The per-page pipeline only sees the currently-accumulated slice, so
  // `scanCount` / `firstDetectedAt` would be page-local. Replace them with the
  // global aggregate (fetched once alongside page 1) so the Step 89 summary is
  // correct regardless of how many pages are loaded. (The summary type marks
  // these fields `readonly`, so build a fresh object rather than mutating.)
  if (aggregateSummary !== null && detectionHistorySummary !== null) {
    detectionHistorySummary = {
      ...detectionHistorySummary,
      scanCount: aggregateSummary.scanCount,
      firstDetectedAt: aggregateSummary.firstDetectedAt,
    };
  }

  return (
    <>
      <TechnologyDetectedInScans scans={scanSummaries} />

      {/* Step 89: compact stability summary, placed immediately before the
          detailed timeline. Renders nothing when there is no history. */}
      <TechnologyDetectionHistorySummary summary={detectionHistorySummary} />

      <TechnologyDetectionTimeline entries={detectionHistory} />

      {hasMore && (
        <button
          type="button"
          onClick={() => {
            void loadMore();
          }}
          disabled={loading}
          style={{
            padding: '8px 16px',
            fontSize: '0.9rem',
            cursor: loading ? 'wait' : 'pointer',
          }}
        >
          {loading ? 'Loading…' : 'Load more'}
        </button>
      )}
    </>
  );
}
