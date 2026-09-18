/**
 * Pure helpers for scan-history presentation logic.
 *
 * These functions operate on the `ScanSummary[]` returned by the existing
 * `GET /api/scans` endpoint — no HTTP, database, or repository dependencies.
 *
 * The primary use case is deriving same-target context (how many times a
 * given target URL has been scanned) so the UI can show a lightweight
 * indicator like "3 scans" next to a scan card.
 *
 * Target identity uses the existing `scan.target` string exactly as
 * returned by the API. No new normalization algorithm is introduced —
 * the API already normalizes via `new URL().href` before persistence,
 * so identical targets compare as equal strings.
 */

import type { ScanSummary } from '../lib/types.js';

// ─── Same-target counting ────────────────────────────────────────────

/**
 * Counts how many scans exist for each target URL.
 *
 * Uses the existing `scan.target` string as the identity key — no new
 * normalization is applied. The API already normalizes URLs via
 * `new URL().href`, so identical submissions produce identical target
 * strings.
 *
 * @param scans  The full, already-fetched scan list (API result)
 * @returns A Map from target URL → scan count
 */
export function countScansByTarget(scans: ScanSummary[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const scan of scans) {
    counts.set(scan.target, (counts.get(scan.target) ?? 0) + 1);
  }
  return counts;
}

/**
 * Returns the number of scans that share the same target as `scan`.
 *
 * This is a convenience wrapper around {@link countScansByTarget} for
 * per-scan rendering. Returns 0 when the target has never been scanned
 * (which should not happen in practice, since the scan itself is in the list).
 *
 * @param scan    The scan whose target we want to count
 * @param scans   The full scan list (used to compute the count)
 */
export function getSameTargetCount(scan: ScanSummary, scans: ScanSummary[]): number {
  const counts = countScansByTarget(scans);
  return counts.get(scan.target) ?? 0;
}
