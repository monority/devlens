/**
 * Scan overview — pure, in-memory derivation of a compact at-a-glance
 * summary from an already-loaded `ScanDetailResponse`.
 *
 * This module computes presentation data exclusively from the existing
 * API response shapes. No new API endpoint, no database query, no
 * asynchronous processing, and no detection/scoring changes.
 *
 * Pipeline:
 *
 *   ScanDetailResponse
 *       → getScanOverview()  (compact metrics + metadata)
 *       → returned as a plain object (deterministic, no mutation)
 *
 * The overview is shown only for **completed** scans. It must remain
 * stable when detection filters are active — the metrics describe the
 * scan itself, not the filtered subset.
 *
 * Metric semantics:
 *   - technologyCount:  unique technology IDs (deduplicated)
 *   - evidenceCount:    total evidence entries across all detections
 *   - highestConfidence:  max confidence value (null when zero detections)
 */

import type { ScanDetailResponse } from '../lib/types.js';

// ─── Types ───────────────────────────────────────────────────────────

/**
 * Compact at-a-glance overview of a completed scan result.
 */
export interface ScanOverview {
  /** The scan target URL (preserved exactly from the API). */
  target: string;
  /** The scan hostname (preserved exactly from the API). */
  hostname: string;
  /** The scan status (preserved exactly from the API). */
  status: string;
  /** The scan ID (preserved exactly from the API). */
  id: string;
  /** The scan creation timestamp (ISO 8601, preserved exactly). */
  createdAt: string;
  /** The scan completion timestamp (ISO 8601, null for non-completed). */
  completedAt: string | null;
  /** Number of unique technology IDs in the final detections. */
  technologyCount: number;
  /** Total evidence entries across all detections. */
  evidenceCount: number;
  /** Highest confidence value, or null when there are zero detections. */
  highestConfidence: number | null;
}

// ─── Pure overview function ──────────────────────────────────────────

/**
 * Builds a compact `ScanOverview` from a `ScanDetailResponse`.
 *
 * Metrics are derived deterministically from the existing scan data:
 *
 * - `technologyCount`: unique technology IDs (deduplicates by ID)
 * - `evidenceCount`: total evidence entries across all detections
 * - `highestConfidence`: max confidence (null when zero detections)
 *
 * Does not mutate the input. Does not recalculate, normalize, or
 * reinterpret confidence — returns the exact existing value.
 *
 * @param result The full scan detail response
 * @returns A compact overview object
 */
export function getScanOverview(result: ScanDetailResponse): ScanOverview {
  const { scan, detections } = result;

  // Count unique technology IDs (deduplicate by ID)
  const uniqueTechIds = new Set<string>();
  let evidenceCount = 0;
  let highestConfidence: number | null = null;

  for (const detection of detections) {
    uniqueTechIds.add(detection.technology.id);
    evidenceCount += detection.evidence.length;

    if (highestConfidence === null || detection.confidence > highestConfidence) {
      highestConfidence = detection.confidence;
    }
  }

  return {
    target: scan.target,
    hostname: scan.hostname,
    status: scan.status,
    id: scan.id,
    createdAt: scan.createdAt,
    completedAt: scan.completedAt,
    technologyCount: uniqueTechIds.size,
    evidenceCount,
    highestConfidence,
  };
}
