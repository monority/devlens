/**
 * TechnologyFilters — pure presentation component for the technology
 * catalog filter UI.
 *
 * Receives the current filter values, categories for the select, and
 * change handlers as props. Does NOT manage React state, access the
 * router, or fetch data. The filtering logic lives in
 * `lib/technology-filter.ts` (pure `filterTechnologies()`).
 *
 * This component is pure so it can be tested with `renderToString`
 * from `react-dom/server` — no DOM environment required.
 *
 * Layout:
 *   [Search technologies] [input]
 *   [Category] [select: All, server, framework, ...]
 *   [Reset filters]  (only shown when a filter is active)
 *   "12 technologies" or '3 technologies matching "react"'
 *   (empty state when resultCount === 0)
 */

import styles from './ScanCard.module.css';
import type { TechnologyFilters } from '../lib/technology-filter.js';

export interface TechnologyFiltersProps {
  /** Current search text (value of the search input) */
  search: string;
  /** Current category filter ('', 'server', 'framework', etc.) */
  category: string;
  /** Available categories for the select dropdown */
  categories: string[];
  /** Number of technologies after filtering */
  resultCount: number;
  /** Total number of technologies before filtering */
  totalTechnologies: number;
  /** Called when the search input changes */
  onSearchChange: (value: string) => void;
  /** Called when the category select changes */
  onCategoryChange: (value: string) => void;
  /** Called when the reset button is clicked */
  onReset: () => void;
}

/**
 * Returns the result count text shown below the filter controls.
 */
function resultCountText(search: string, resultCount: number): string {
  const noun = resultCount === 1 ? 'technology' : 'technologies';
  if (search) {
    return `${resultCount} ${noun} matching "${search}"`;
  }
  return `${resultCount} ${noun}`;
}

/**
 * Returns `true` if any filter is currently active (non-default).
 */
function hasActiveFilters(search: string, category: string): boolean {
  return search.length > 0 || category.length > 0;
}

export function TechnologyFilters({
  search,
  category,
  categories,
  resultCount,
  totalTechnologies,
  onSearchChange,
  onCategoryChange,
  onReset,
}: TechnologyFiltersProps): React.ReactElement {
  const active = hasActiveFilters(search, category);

  return (
    <section className={styles.scanFilters}>
      {/* ── Filter controls ── */}
      <div className={styles.filterControls}>
        <div className={styles.filterGroup}>
          <label htmlFor="tech-search" className={styles.filterLabel}>
            Search technologies
          </label>
          <input
            id="tech-search"
            type="search"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="react, nginx, cms..."
            className={styles.searchInput}
          />
        </div>

        <div className={styles.filterGroup}>
          <label htmlFor="tech-category" className={styles.filterLabel}>
            Category
          </label>
          <select
            id="tech-category"
            value={category}
            onChange={(e) => onCategoryChange(e.target.value)}
            className={styles.statusSelect}
          >
            <option value="">All</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        {active && (
          <button type="button" onClick={onReset} className={styles.resetButton}>
            Reset filters
          </button>
        )}
      </div>

      {/* ── Result count ── */}
      <p className={styles.resultCount}>{resultCountText(search, resultCount)}</p>

      {/* ── Empty filtered state ── */}
      {resultCount === 0 && (
        <div className={styles.filterEmpty}>
          {totalTechnologies === 0 ? (
            <p>No technologies in catalog.</p>
          ) : (
            <p>No technologies match your filters.</p>
          )}
          {active && (
            <button type="button" onClick={onReset} className={styles.resetButton}>
              Reset filters
            </button>
          )}
        </div>
      )}
    </section>
  );
}
