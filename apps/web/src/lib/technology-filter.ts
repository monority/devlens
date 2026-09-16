/**
 * Pure client-side technology filtering.
 *
 * This module contains no React, HTTP, or database dependencies. It
 * operates on the `TechnologyPresentation[]` returned by the existing
 * `getTechnologies()` function, filtering the already-fetched result
 * in memory.
 *
 * Pipeline (deterministic, no re-sorting):
 *
 *   catalog → search filter → category filter → ordered list
 *
 * The ordering returned by the catalog is preserved — filtering never
 * re-sorts. Categories are derived directly from the catalog data.
 */

import type { TechnologyPresentation } from './technology-catalog.js';
import { getTechnologies } from './technology-catalog';

// ─── Types ───────────────────────────────────────────────────────────

/**
 * The filter state, sourced from URL query parameters.
 *
 * - `search`: case-insensitive substring match against name, id, category,
 *   and description
 * - `category`: exact match against technology category (empty string = all)
 */
export interface TechnologyFilters {
  search: string;
  category: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────

/**
 * Returns the sorted set of unique categories across the given
 * technologies.
 *
 * Categories are derived from catalog data — no hardcoded list.
 */
export function getTechnologyCategories(technologies: TechnologyPresentation[]): string[] {
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
export function isValidTechnologyCategory(category: string | null | undefined): boolean {
  if (!category) return false;
  return getTechnologyCategories(getTechnologies()).includes(category);
}

// ─── Pure filtering ──────────────────────────────────────────────────

/**
 * Filters a list of technologies by search text and category.
 *
 * - `search` filters case-insensitively on `name`, `id`, `category`,
 *   and `description` (substring match). Empty string = no search filter.
 * - `category` filters on `category` (exact match). Empty string = all.
 * - Ordering is preserved — no re-sorting
 * - Deterministic for the same input
 * - Does not mutate the input
 *
 * @param technologies The already-fetched technology list (from the catalog)
 * @param filters      The search and category filters
 */
export function filterTechnologies(
  technologies: TechnologyPresentation[],
  filters: TechnologyFilters,
): TechnologyPresentation[] {
  const search = filters.search.toLowerCase();
  const category = filters.category;

  return technologies.filter((tech) => {
    // Search: case-insensitive substring across name, id, category, description
    if (search) {
      const haystack = [tech.name, tech.id, tech.category, tech.description]
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(search)) {
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
 * Builds a URL for the technologies page with the given filter state.
 *
 * - Empty search or category is omitted from the URL
 * - Returns `/technologies` when both filters are empty
 * - Returns `/technologies?q=<search>&category=<category>` otherwise
 *
 * Pure function — no router dependency.
 */
export function buildTechnologyUrl(search: string, category: string): string {
  const params = new URLSearchParams();
  if (search) params.set('q', search);
  if (category) params.set('category', category);
  const query = params.toString();
  return query ? `/technologies?${query}` : '/technologies';
}
