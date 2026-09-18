/**
 * ScanHistory — client component for the scan history list with filtering.
 *
 * This is the client boundary for scan filtering. It receives all scans
 * (already fetched by the server component) and manages filter state
 * locally, syncing to the URL via `useRouter`.
 *
 * Filtering is performed client-side using the pure `filterScans()`
 * function — no network request is made when the user types.
 *
 * URL state: `/scans?q=<search>&status=<status>`
 * - Page refresh preserves filters (server reads searchParams on initial render)
 * - Copied URLs preserve filters
 * - Invalid status values fall back to "All"
 *
 * The client boundary is kept minimal: only this component and its direct
 * children (`ScanFilters`, `ScanCard`) are client-side. The server component
 * (`app/scans/page.tsx`) still performs the initial data fetch.
 */

'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { filterScans, isValidStatus } from '../lib/scan-filter';
import { countScansByTarget } from '../lib/scan-history';
import { ScanFilters } from './ScanFilters';
import { ScanCard } from './ScanViews';
import styles from '../app/scans/page.module.css';
import type { ScanSummary } from '../lib/types.js';

export interface ScanHistoryProps {
  /** All scans fetched by the server (unfiltered) */
  scans: ScanSummary[];
}

/**
 * Syncs filter state to the URL query string.
 * Omits empty values so the URL stays clean when filters are reset.
 */
function buildUrl(search: string, status: string): string {
  const params = new URLSearchParams();
  if (search) params.set('q', search);
  if (status) params.set('status', status);
  const query = params.toString();
  return query ? `/scans?${query}` : '/scans';
}

export function ScanHistory({ scans }: ScanHistoryProps): React.ReactElement {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Initialize from URL (server-rendered initial state)
  const [search, setSearch] = useState<string>(() => {
    return searchParams?.get('q') ?? '';
  });

  const [status, setStatus] = useState<string>(() => {
    const raw = searchParams?.get('status') ?? '';
    return isValidStatus(raw) ? raw : '';
  });

  // Keep state in sync if the URL changes externally (back/forward navigation)
  useEffect(() => {
    const q = searchParams?.get('q') ?? '';
    const s = searchParams?.get('status') ?? '';

    setSearch(q);
    setStatus(isValidStatus(s) ? s : '');
  }, [searchParams]);

  // Sync state → URL (replaces current history entry, no new entries per keystroke)
  useEffect(() => {
    router.replace(buildUrl(search, status), { scroll: false });
  }, [search, status, router]);

  const filters = { search, status };
  const filtered = filterScans(scans, filters);

  // Compute same-target counts from the FULL scan list (before filtering)
  // so the count reflects all scans of this target, not just the filtered subset.
  const targetCounts = countScansByTarget(scans);

  return (
    <>
      <ScanFilters
        search={search}
        status={status}
        resultCount={filtered.length}
        totalScans={scans.length}
        onSearchChange={setSearch}
        onStatusChange={setStatus}
        onReset={() => {
          setSearch('');
          setStatus('');
        }}
      />

      {filtered.length > 0 ? (
        <div className={styles.cards}>
          {filtered.map((scan: ScanSummary) => (
            <ScanCard
              key={scan.id}
              scan={scan}
              sameTargetCount={targetCounts.get(scan.target) ?? 0}
            />
          ))}
        </div>
      ) : (
        // Empty state is rendered by ScanFilters when resultCount === 0
        // and totalScans > 0; or by ScansHistory when totalScans === 0.
        // Here we render nothing extra — ScanFilters handles the empty message.
        <div className={styles.cards} />
      )}
    </>
  );
}
