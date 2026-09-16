/**
 * Pure client-side scan filtering.
 *
 * This module contains no React, HTTP, or database dependencies. It
 * operates on the `ScanSummary[]` returned by the existing `GET /api/scans`
 * endpoint, filtering the already-fetched result in memory.
 *
 * Pipeline (deterministic, no re-sorting):
 *
 *   API result  →  search filter  →  status filter  →  ordered list
 *
 * The ordering returned by the API is preserved — filtering never re-sorts.
 */

import type { ScanSummary } from '../lib/types.js';

// ─── Types ───────────────────────────────────────────────────────────

/**
 * The filter state, sourced from URL query parameters.
 *
 * - `search`: case-insensitive substring match against `scan.target`
 * - `status`: exact match against `scan.status` (empty string = all)
 */
export interface ScanFilters {
  search: string;
  status: string;
}

// ─── Constants ───────────────────────────────────────────────────────

/**
 * The four scan lifecycle statuses. Used to populate the status `<select>`
 * and to validate URL `status` parameters.
 */
export const SCAN_STATUSES: readonly ['pending', 'running', 'completed', 'failed'] = [
  'pending',
  'running',
  'completed',
  'failed',
];

// ─── Helpers ─────────────────────────────────────────────────────────

/**
 * Returns a human-readable label for a scan status.
 */
export function statusLabel(status: string): string {
  switch (status) {
    case 'completed':
      return 'Completed';
    case 'failed':
      return 'Failed';
    case 'running':
      return 'Running';
    case 'pending':
      return 'Pending';
    default:
      return status;
  }
}

/**
 * Returns `true` if `status` is one of the four known scan statuses.
 * Invalid or missing URL `status` values should fall back to "All".
 */
export function isValidStatus(status: string | null | undefined): boolean {
  if (!status) return false;
  return SCAN_STATUSES.includes(status as (typeof SCAN_STATUSES)[number]);
}

// ─── Pure filtering ──────────────────────────────────────────────────

/**
 * Filters a list of scans by target URL search and status.
 *
 * - `search` filters case-insensitively on `scan.target` (substring match)
 * - `status` filters on `scan.status` (exact match); empty string = all
 * - Ordering is preserved — no re-sorting
 * - Deterministic for the same input
 *
 * @param scans   The already-fetched scan list (API result)
 * @param filters The search and status filters
 */
export function filterScans(scans: ScanSummary[], filters: ScanFilters): ScanSummary[] {
  return scans.filter((scan) => {
    if (filters.search && !scan.target.toLowerCase().includes(filters.search.toLowerCase())) {
      return false;
    }
    if (filters.status && scan.status !== filters.status) {
      return false;
    }
    return true;
  });
}
