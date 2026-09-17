/**
 * Pure logic for the scan comparison selector.
 *
 * This module is:
 * - Pure (no side effects, no I/O)
 * - Deterministic (same inputs → same outputs)
 * - Independent of React, HTTP, and the database
 * - Independently testable without a DOM environment
 *
 * The `ScanComparisonSelector` client component uses these helpers
 * to decide which scans are selectable and how to build the
 * comparison navigation URL.
 */

import type { ScanSummary } from './types.js';

/**
 * Returns `true` if a scan is in a state that can participate in
 * comparison. Only `completed` scans have persisted detection results
 * that `compareScans()` can meaningfully diff.
 *
 * Non-completed scans (pending / running / failed) are excluded:
 * - pending / running: results may still change
 * - failed: has no detections to compare
 */
export function isComparable(scan: ScanSummary): boolean {
  return scan.status === 'completed';
}

/**
 * Filters a list of scans down to those that can be compared.
 */
export function getComparableScans(scans: ScanSummary[]): ScanSummary[] {
  return scans.filter(isComparable);
}

/**
 * Builds the URL for the comparison page using the existing
 * `left` / `right` query-parameter convention.
 *
 * Both IDs are URL-encoded to handle edge cases in scan IDs.
 */
export function buildCompareUrl(left: string, right: string): string {
  const params = new URLSearchParams();
  params.set('left', left);
  params.set('right', right);
  return `/scans/compare?${params.toString()}`;
}

/**
 * Returns `true` if a pair of selections constitutes a valid
 * comparison target:
 *
 * 1. Both `left` and `right` are set (non-null)
 * 2. `left` and `right` refer to *different* scans
 *
 * This does NOT re-validate that the scans are `completed` — that
 * check is done when building the scan list. The same-scan
 * protection here is a second line of defense.
 */
export function isValidSelection(left: string | null, right: string | null): boolean {
  return left !== null && right !== null && left !== right;
}
