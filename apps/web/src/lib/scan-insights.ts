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

import type { ScanDetailResponse, DetectionResponse, EvidenceResponse } from '../lib/types.js';
import { evidenceTypeLabel } from '../lib/evidence-presenter';
import { isKnownTechnology } from '../lib/technology-catalog';
import { deduplicateEvidence } from '../lib/evidence-identity';

// ─── Types ───────────────────────────────────────────────────────────

/**
 * A single technology in the composition view.
 */
export interface TechnologyCompositionItem {
  /** The technology ID (stable identity for deduplication). */
  readonly id: string;
  /** The technology display name. */
  readonly name: string;
}

/**
 * Technologies grouped under a single category.
 */
export interface TechnologyCategoryComposition {
  /** Category name (e.g. "cms", "framework"), or "Unknown" for uncataloged IDs. */
  readonly category: string;
  /** Unique technologies within this category, sorted deterministically. */
  readonly technologies: TechnologyCompositionItem[];
}

/**
 * A single row in the technology evidence matrix.
 */
export interface TechnologyEvidenceMatrixItem {
  /** The technology ID (stable identity). */
  readonly id: string;
  /** The technology display name (from the first occurrence). */
  readonly name: string;
  /** Unique evidence type labels, sorted alphabetically ASC. */
  readonly evidenceTypes: string[];
  /** Count of deduplicated evidence entries for this technology. */
  readonly evidenceCount: number;
}

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
  /** Technology composition grouped by category (count DESC, category ASC). */
  technologyComposition: TechnologyCategoryComposition[];
  /** Technology evidence matrix (name ASC, id ASC). */
  technologyEvidenceMatrix: TechnologyEvidenceMatrixItem[];
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
 * Groups detected technologies by category, deduplicating by technology ID.
 *
 * For each detection:
 *   1. Resolve its catalog metadata (via `isKnownTechnology`).
 *   2. Determine its category — catalog category if known, "Unknown" otherwise.
 *   3. Group the technology under that category.
 *
 * Duplicate technology IDs (same tech appearing in multiple detections)
 * collapse to a single entry in the composition — the first occurrence's
 * name is preserved.
 *
 * Categories are ordered by:
 *   - technology count DESC
 *   - category ASC
 *
 * Technologies within a category are ordered by:
 *   - technology name ASC
 *   - technology id ASC (deterministic tie-breaker)
 *
 * Unknown technology IDs are placed in an `"Unknown"` presentation category
 * and preserve their original name from the detection.
 *
 * Does not mutate the input. This is a pure, deterministic function.
 *
 * @param detections Array of detection responses
 * @returns Category compositions, sorted deterministically
 */
export function getTechnologyComposition(
  detections: DetectionResponse[],
): TechnologyCategoryComposition[] {
  // Group technologies by category, deduplicating by ID
  // Use a Map so the first occurrence of a duplicate ID is preserved
  const categoryMap: Map<string, Map<string, TechnologyCompositionItem>> = new Map();

  for (const detection of detections) {
    const tech = detection.technology;
    const category = isKnownTechnology(tech.id) ? tech.category : 'Unknown';

    if (!categoryMap.has(category)) {
      categoryMap.set(category, new Map());
    }

    const techMap = categoryMap.get(category)!;
    if (!techMap.has(tech.id)) {
      techMap.set(tech.id, { id: tech.id, name: tech.name });
    }
  }

  // Convert to array
  const compositions: TechnologyCategoryComposition[] = [];
  for (const [category, techMap] of categoryMap) {
    // Sort technologies within the category by name ASC, then id ASC
    const technologies = [...techMap.values()].sort((a, b) => {
      if (a.name !== b.name) {
        return a.name < b.name ? -1 : 1;
      }
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
    compositions.push({ category, technologies });
  }

  // Sort categories by: technology count DESC, category ASC
  compositions.sort((a, b) => {
    if (b.technologies.length !== a.technologies.length) {
      return b.technologies.length - a.technologies.length;
    }
    return a.category < b.category ? -1 : a.category > b.category ? 1 : 0;
  });

  return compositions;
}

/**
 * Builds a technology evidence matrix from detection results.
 *
 * For each unique technology ID across all detections:
 *   - Preserves the technology ID and its display name (first occurrence)
 *   - Merges evidence from all detections of the same technology
 *   - Deduplicates evidence entries using the canonical identity
 *   - Derives unique evidence type labels (alphabetically sorted ASC)
 *   - Counts the actual deduplicated evidence entries
 *
 * Duplicate detection records for the same technology ID collapse into
 * a single matrix row — evidence is merged and deduplicated.
 *
 * Unknown technology IDs are preserved as-is (no catalog lookup).
 * Unknown evidence types use the "Evidence" fallback label.
 *
 * Does not recalculate confidence. Does not mutate the input.
 *
 * @param detections Array of detection responses
 * @returns Technology evidence matrix items, sorted by name ASC then id ASC
 */
export function getTechnologyEvidenceMatrix(
  detections: DetectionResponse[],
): TechnologyEvidenceMatrixItem[] {
  // Group evidence by technology ID, deduplicating
  const techMap: Map<string, { name: string; evidence: EvidenceResponse[] }> = new Map();

  for (const detection of detections) {
    const tech = detection.technology;
    if (!techMap.has(tech.id)) {
      techMap.set(tech.id, { name: tech.name, evidence: [] });
    }
    // Merge evidence from this detection
    techMap.get(tech.id)!.evidence.push(...detection.evidence);
  }

  // Build matrix items
  const items: TechnologyEvidenceMatrixItem[] = [];
  for (const [id, { name, evidence }] of techMap) {
    const uniqueEvidence = deduplicateEvidence(evidence);
    const evidenceTypes = [...new Set(uniqueEvidence.map((e) => evidenceTypeLabel(e.type)))].sort();

    items.push({
      id,
      name,
      evidenceTypes,
      evidenceCount: uniqueEvidence.length,
    });
  }

  // Sort by name ASC, then id ASC
  items.sort((a, b) => {
    if (a.name !== b.name) {
      return a.name < b.name ? -1 : 1;
    }
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  return items;
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
 * - `technologyComposition` — grouped technology composition by category
 * - `technologyEvidenceMatrix` — per-technology evidence types and counts
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

  const technologyComposition = getTechnologyComposition(detections);
  const technologyEvidenceMatrix = getTechnologyEvidenceMatrix(detections);

  return {
    technologyCount,
    evidenceCount,
    categoryCount,
    categories,
    evidenceTypes,
    technologyComposition,
    technologyEvidenceMatrix,
  };
}
