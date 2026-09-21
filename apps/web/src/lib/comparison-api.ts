/**
 * Comparison adapter — bridges the HTTP API client and the pure
 * `compareScans()` function.
 *
 * This module is the ONLY place that:
 * 1. Calls `fetchScanById` (from `lib/api.ts`)
 * 2. Calls `compareScans()` (from `lib/comparison.ts`)
 *
 * It is async (because of the HTTP calls) but the comparison itself
 * is pure and delegated to `compareScans()`.
 *
 * Architecture: HTTP API client → comparison adapter → pure compareScans()
 */

import { fetchScanById } from './api';
import { compareScans } from './comparison';
import type { ComparisonResult, ComparisonInput } from './comparison';

// Step 74 — re-export the pure diff model so consumers only need to import
// from the comparison adapter when they want the structured `changes`.
export type {
  DetectionChange,
  DetectionChangeKind,
  DetectionDiff,
  VersionChange,
  TechnologyComparison,
} from './comparison';

/**
 * Fetches two scans by ID and compares them.
 *
 * Both scans are fetched concurrently. A 404 (null response) for either
 * ID is NOT treated as an error — it produces a `notFound` flag in the
 * comparison result. A 500/API error IS thrown as an `ApiError` for the
 * page to handle.
 *
 * @param leftId The "previous" scan ID.
 * @param rightId The "current" scan ID.
 * @returns The comparison result.
 * @throws {ApiError} if the server returns a non-200/non-404 error.
 */
export async function fetchComparison(leftId: string, rightId: string): Promise<ComparisonResult> {
  const [left, right] = await Promise.all([fetchScanById(leftId), fetchScanById(rightId)]);

  return compareScans(left, right);
}

/**
 * Compares two already-fetched scan results (no network access).
 *
 * This is a thin wrapper around `compareScans()` for when the caller
 * has already fetched the scans (e.g. in a server component that fetched
 * them individually).
 */
export function compareScanResults(input: ComparisonInput): ComparisonResult {
  return compareScans(input.left, input.right);
}
