/**
 * DetectionFilters — pure presentation component for the scan detail
 * detection filter UI.
 *
 * Receives the current filter values, categories for the select, and
 * change handlers as props. Does NOT manage React state, access the
 * router, or fetch data. The filtering logic lives in
 * `lib/detection-filter.ts` (pure `filterDetections()`).
 *
 * This component is pure so it can be tested with `renderToString`
 * from `react-dom/server` — no DOM environment required.
 *
 * Layout:
 *   [Search technologies] [input]
 *   [Category] [select: All, server, framework, ...]
 *   [Reset filters]  (only shown when a filter is active)
 *   "N of M detections" (result count)
 *   (empty filtered state when resultCount === 0)
 */

import styles from './ScanCard.module.css';
import type { DetectionFilters } from '../lib/detection-filter.js';

export interface DetectionFiltersProps {
  /** Current search text (value of the search input) */
  search: string;
  /** Current category filter ('', 'server', 'framework', etc.) */
  category: string;
  /** Available categories for the select dropdown */
  categories: string[];
  /** Number of detections after filtering */
  resultCount: number;
  /** Total number of detections before filtering */
  totalDetections: number;
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
function resultCountText(
  search: string,
  category: string,
  resultCount: number,
  total: number,
): string {
  if (resultCount === total) {
    return `${total} detections`;
  }
  const parts: string[] = [];
  if (search) {
    parts.push(`matching "${search}"`);
  }
  if (category) {
    parts.push(`in ${category}`);
  }
  if (parts.length > 0) {
    return `${resultCount} of ${total} detections ${parts.join(' ')}`;
  }
  return `${resultCount} of ${total} detections`;
}

/**
 * Returns `true` if any filter is currently active (non-default).
 */
function hasActiveFilters(search: string, category: string): boolean {
  return search.length > 0 || category.length > 0;
}

export function DetectionFilters({
  search,
  category,
  categories,
  resultCount,
  totalDetections,
  onSearchChange,
  onCategoryChange,
  onReset,
}: DetectionFiltersProps): React.ReactElement {
  const active = hasActiveFilters(search, category);

  return (
    <section className={styles.scanFilters}>
      {/* ── Filter controls ── */}
      <div className={styles.filterControls}>
        <div className={styles.filterGroup}>
          <label htmlFor="detection-search" className={styles.filterLabel}>
            Search technologies
          </label>
          <input
            id="detection-search"
            type="search"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="react, nginx, cms..."
            className={styles.searchInput}
          />
        </div>

        <div className={styles.filterGroup}>
          <label htmlFor="detection-category" className={styles.filterLabel}>
            Category
          </label>
          <select
            id="detection-category"
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
      <p className={styles.resultCount}>
        {resultCountText(search, category, resultCount, totalDetections)}
      </p>

      {/* ── Empty filtered state ── */}
      {resultCount === 0 && totalDetections > 0 && (
        <div className={styles.filterEmpty}>
          <p>No detections match these filters.</p>
          <button type="button" onClick={onReset} className={styles.resetButton}>
            Clear filters
          </button>
        </div>
      )}
    </section>
  );
}
