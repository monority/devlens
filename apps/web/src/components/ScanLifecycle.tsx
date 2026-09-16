/**
 * Client-side scan lifecycle component with polling.
 *
 * This is the ONLY client component in the scan detail flow. It receives
 * the server-rendered initial scan result as props and, when the scan is
 * in a non-terminal state (`pending` or `running`), polls `GET /api/scans/:id`
 * at a conservative 2.5-second interval to observe lifecycle changes.
 *
 * Polling stops immediately when:
 * - The scan transitions to `completed` or `failed` (terminal states)
 * - The scan is deleted/returns 404 (not found)
 * - A non-404 API error occurs after the initial render (the last known
 *   state is preserved, and polling is stopped to avoid hammering a
 *   broken API)
 *
 * Architecture:
 *
 *   /scans/[id]/page.tsx  (server) → initial fetchScanById()
 *         ↓
 *         ScanLifecycle   (client: 'use client') → periodic refetch
 *         ↓
 *         ScanDetailView  (pure presentation)
 *
 * Hydration safety: the initial client state is set from `initialResult`,
 * so the server-rendered HTML and client initial render match.
 */

'use client';

import { useState, useEffect, useRef } from 'react';
import { fetchScanById } from '@/lib/api';
import { isScanning, isTerminal, POLLING_INTERVAL_MS } from '@/lib/scan-utils';
import { ScanDetailView, ScanNotFound } from '@/components/ScanViews';
import type { ScanDetailResponse } from '@/lib/types';
import styles from './ScanLifecycle.module.css';

export interface ScanLifecycleProps {
  /** The scan ID to poll. */
  scanId: string;
  /** The initial scan result from the server (for hydration compatibility). */
  initialResult: ScanDetailResponse;
  /** Initial query filter from URL (for detection filtering). */
  initialQuery?: string;
  /** Initial category filter from URL (for detection filtering). */
  initialCategory?: string;
}

/**
 * Renders the scan detail and polls for lifecycle updates when the scan
 * is in a non-terminal state.
 */
export function ScanLifecycle({
  scanId,
  initialResult,
  initialQuery,
  initialCategory,
}: ScanLifecycleProps): React.ReactElement {
  const [result, setResult] = useState<ScanDetailResponse>(initialResult);
  const [notFound, setNotFound] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Clear any existing interval — used both before setting a new one
  // and during cleanup to prevent duplicate timers.
  const clearPolling = () => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  useEffect(() => {
    // Only poll for non-terminal (in-progress) scans.
    if (!isScanning(result.scan.status)) {
      return;
    }

    intervalRef.current = setInterval(async () => {
      try {
        const updated = await fetchScanById(scanId);
        setRefreshError(null);

        if (updated === null) {
          // 404 — scan no longer exists. Stop polling.
          setNotFound(true);
          clearPolling();
        } else {
          setResult(updated);
          // If the scan has reached a terminal state, stop polling.
          if (isTerminal(updated.scan.status)) {
            clearPolling();
          }
        }
      } catch {
        // Transient error (e.g. 500 or network issue).
        // Retain the last known scan state — do NOT destroy the view.
        setRefreshError('Failed to refresh. Will retry…');
      }
    }, POLLING_INTERVAL_MS);

    // Cleanup on unmount or when `result.scan.status` changes.
    return clearPolling;
  }, [result.scan.status, scanId]);

  if (notFound) {
    return <ScanNotFound id={scanId} />;
  }

  return (
    <>
      {refreshError && <p className={styles.refreshError}>{refreshError}</p>}
      <ScanDetailView
        result={result}
        initialQuery={initialQuery ?? ''}
        initialCategory={initialCategory ?? ''}
      />
    </>
  );
}
