/**
 * Pure client-side detection filtering.
 *
 * This module contains no React, HTTP, or database dependencies. It
 * operates on the `DetectionResponse[]` from an already-loaded scan
 * result, filtering the detections in memory.
 *
 * Pipeline (deterministic, no re-sorting):
 *
 *   API detections → query filter → category filter → ordered list
 *
 * The ordering returned by the API (ranked detection order) is
 * preserved — filtering never re-sorts. Query filters name and ID
 * (case-insensitive substring); category filters by exact match
 * against the technology's catalog category.
 *
 * Categories are derived from the existing technology catalog — no
 * hardcoded list. Unknown technology IDs are searched by their own
 * name/ID but do not match catalog categories.
 */

import type { DetectionResponse } from './types.js';
import { getTechnologies } from './technology-catalog';

// ─── Types ───────────────────────────────────────────────────────────

/**
 * The filter state, sourced from URL query parameters.
 *
 * - `query`: case-insensitive substring match against technology name
 *   and technology ID (whitespace-trimmed)
 * - `category`: exact match against technology category (empty = all)
 */
export interface DetectionFilters {
  query: string;
  category: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────

/**
 * Returns the sorted set of unique categories from the default
 * technology catalog.
 *
 * Categories are derived from catalog data — no hardcoded list.
 */
export function getDetectionCategories(): string[] {
  const technologies = getTechnologies();
  const seen = new Set<string>();
  const categories: string[] = [];
  for (const tech of technologies) {
    if (!seen.has(tech.category)) {
      seen.add(tech.category);
      categories.push(tech.category);
    }
  }
  return categories.sort();
}

/**
 * Returns `true` if `category` is a known category in the default
 * catalog. Invalid or missing values (empty string, null, undefined)
 * should fall back to "All".
 */
export function isValidDetectionCategory(category: string | null | undefined): boolean {
  if (!category) return false;
  return getDetectionCategories().includes(category);
}

// ─── Pure filtering ──────────────────────────────────────────────────

/**
 * Filters a list of detections by technology search query and category.
 *
 * - `query` filters case-insensitively on `technology.name` and
 *   `technology.id` (substring match, whitespace-trimmed). Empty string
 *   = no search filter.
 * - `category` filters on `technology.category` (exact match).
 *   Empty string = all categories.
 * - Ordering is preserved — no re-sorting
 * - Deterministic for the same input
 * - Does not mutate the input
 *
 * Does NOT search evidence text or raw JSON. Duplicate detections are
 * preserved (filtering does not add or remove duplicates).
 *
 * @param detections The already-fetched detection list (from API)
 * @param filters    The query and category filters
 */
export function filterDetections(
  detections: DetectionResponse[],
  filters: DetectionFilters,
): DetectionResponse[] {
  const query = (filters.query ?? '').trim().toLowerCase();
  const category = filters.category ?? '';

  return detections.filter((detection) => {
    const tech = detection.technology;

    // Search: case-insensitive substring against name and ID only
    if (query) {
      const haystack = `${tech.name} ${tech.id}`.toLowerCase();
      if (!haystack.includes(query)) {
        return false;
      }
    }

    // Category: exact match (empty string = all)
    if (category && tech.category !== category) {
      return false;
    }

    return true;
  });
}

// ─── URL helpers ─────────────────────────────────────────────────────

/**
 * Builds a URL for the scan detail page with the given filter state.
 *
 * - Empty query or category is omitted from the URL
 * - Returns `/scans/{scanId}` when both filters are empty
 * - Returns `/scans/{scanId}?q=<query>&category=<category>` otherwise
 *
 * Pure function — no router dependency.
 */
export function buildDetectionUrl(scanId: string, query: string, category: string): string {
  const params = new URLSearchParams();
  if (query?.trim()) params.set('q', query.trim());
  if (category) params.set('category', category);
  const search = params.toString();
  return search
    ? `/scans/${encodeURIComponent(scanId)}?${search}`
    : `/scans/${encodeURIComponent(scanId)}`;
}
