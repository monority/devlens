/**
 * Scan insights — pure, in-memory derivation of technology usage context
 * from an already-loaded `ScanDetailResponse`.
 *
 * This module computes presentation data exclusively from the existing
 * API response shapes. No new API endpoint, no database query, no
 * asynchronous processing, and no detection/scoring changes.
 *
 * Pipeline:
 *
 *   ScanDetailResponse
 *       → getScanInsights()  (aggregate counts, category + evidence-type lists)
 *       → returned as a plain object (sorted deterministically, no mutation)
 *
 * All derived lists use explicit deterministic ordering:
 *   - categories:     count DESC, category ASC
 *   - evidence types: count DESC, type ASC
 */

import type { ScanDetailResponse, DetectionResponse } from '../lib/types.js';
import { evidenceTypeLabel } from '../lib/evidence-presenter';
import { isKnownTechnology } from '../lib/technology-catalog';

// ─── Types ───────────────────────────────────────────────────────────

/**
 * A category with its detection count.
 */
export interface CategoryCount {
  /** Technology category (e.g. "framework", "cms"), or "Unknown" for uncataloged IDs. */
  category: string;
  /** Number of detections in this category. */
  count: number;
}

/**
 * An evidence source type with its item count.
 */
export interface EvidenceTypeCount {
  /** Human-readable evidence type label (e.g. "HTTP Header", "Meta Tag"). */
  type: string;
  /** Number of evidence items of this type (across all detections). */
  count: number;
}

/**
 * Aggregated technology insights derived from a completed scan result.
 */
export interface ScanInsights {
  /** Total number of detected technologies. */
  technologyCount: number;
  /** Total evidence items across all detections. */
  evidenceCount: number;
  /** Number of distinct technology categories. */
  categoryCount: number;
  /** Category counts, sorted by count DESC then category ASC. */
  categories: CategoryCount[];
  /** Evidence type counts, sorted by count DESC then type ASC. */
  evidenceTypes: EvidenceTypeCount[];
}

// ─── Internal helpers ────────────────────────────────────────────────

/**
 * Sorts a list of `{ key, count }` entries by count DESC, then key ASC.
 */
function sortByCountDescKeyAsc<T extends { key: string; count: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    if (b.count !== a.count) {
      return b.count - a.count;
    }
    return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
  });
}

// ─── Pure insights functions ─────────────────────────────────────────

/**
 * Counts evidence items by their type for a single detection.
 *
 * Returns an array of `{ type, count }` entries sorted by count DESC
 * then type ASC. Unknown evidence types are labeled "Evidence" (via
 * `evidenceTypeLabel`).
 *
 * Does not mutate the input.
 */
export function getEvidenceTypeCounts(detection: DetectionResponse): EvidenceTypeCount[] {
  const counts: Record<string, number> = {};
  for (const item of detection.evidence) {
    const label = evidenceTypeLabel(item.type);
    counts[label] = (counts[label] ?? 0) + 1;
  }

  const entries = Object.entries(counts).map(([type, count]) => ({ key: type, count }));
  return sortByCountDescKeyAsc(entries).map(({ key, count }) => ({ type: key, count }));
}

/**
 * Counts detections by technology category across all detections.
 *
 * Categories are derived from the existing technology catalog — unknown
 * technology IDs are represented as `"Unknown"` (presentation only).
 *
 * Returns an array of `{ category, count }` entries sorted by count DESC
 * then category ASC.
 *
 * Does not mutate the input.
 */
export function getCategoryCounts(detections: DetectionResponse[]): CategoryCount[] {
  const counts: Record<string, number> = {};
  for (const detection of detections) {
    const category = isKnownTechnology(detection.technology.id)
      ? detection.technology.category
      : 'Unknown';
    counts[category] = (counts[category] ?? 0) + 1;
  }

  const entries = Object.entries(counts).map(([category, count]) => ({ key: category, count }));
  return sortByCountDescKeyAsc(entries).map(({ key, count }) => ({ category: key, count }));
}

/**
 * Aggregates technology usage insights from a scan result.
 *
 * Derives:
 * - `technologyCount` — number of detections
 * - `evidenceCount` — total evidence items across all detections
 * - `categoryCount` — number of distinct categories (including "Unknown")
 * - `categories` — per-category detection counts (count DESC, category ASC)
 * - `evidenceTypes` — per-evidence-type item counts (count DESC, type ASC)
 *
 * All values are derived exclusively from the already-loaded scan result.
 * Does not mutate the input.
 *
 * @param scan The full scan detail response (from API, already fetched)
 */
export function getScanInsights(scan: ScanDetailResponse): ScanInsights {
  const { detections } = scan;

  const technologyCount = detections.length;
  const evidenceCount = detections.reduce((total, d) => total + d.evidence.length, 0);
  const categories = getCategoryCounts(detections);
  const categoryCount = categories.length;

  // Aggregate evidence type counts across all detections
  const aggregated: Record<string, number> = {};
  for (const detection of detections) {
    for (const item of detection.evidence) {
      const label = evidenceTypeLabel(item.type);
      aggregated[label] = (aggregated[label] ?? 0) + 1;
    }
  }
  const entries = Object.entries(aggregated).map(([type, count]) => ({ key: type, count }));
  const evidenceTypes = sortByCountDescKeyAsc(entries).map(({ key, count }) => ({
    type: key,
    count,
  }));

  return {
    technologyCount,
    evidenceCount,
    categoryCount,
    categories,
    evidenceTypes,
  };
}
