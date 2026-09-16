/**
 * ScanFilters — pure presentation component for the scan history filter UI.
 *
 * Receives the current filter values and change handlers as props.
 * Does NOT manage React state, access the router, or fetch data.
 * The filtering logic lives in `lib/scan-filter.ts` (pure `filterScans()`).
 *
 * This component is pure so it can be tested with `renderToString`
 * from `react-dom/server` — no DOM environment required.
 *
 * Layout:
 *   [Search scans] [input]
 *   [Status] [select: All, Pending, Running, Completed, Failed]
 *   [Reset filters]  (only shown when a filter is active)
 *   "12 scans" or '3 scans matching "example.com"'
 *   (empty state when resultCount === 0)
 */

import Link from 'next/link';
import { SCAN_STATUSES, statusLabel } from '../lib/scan-filter';
import styles from './ScanCard.module.css';

export interface ScanFiltersProps {
  /** Current search text (value of the search input) */
  search: string;
  /** Current status filter ('', 'pending', 'running', 'completed', 'failed') */
  status: string;
  /** Number of scans after filtering */
  resultCount: number;
  /** Total number of scans before filtering (for empty-state distinction) */
  totalScans: number;
  /** Called when the search input changes */
  onSearchChange: (value: string) => void;
  /** Called when the status select changes */
  onStatusChange: (value: string) => void;
  /** Called when the reset button is clicked */
  onReset: () => void;
}

/**
 * Returns the result count text shown below the filter controls.
 */
function resultCountText(search: string, resultCount: number): string {
  const noun = resultCount === 1 ? 'scan' : 'scans';
  if (search) {
    return `${resultCount} ${noun} matching "${search}"`;
  }
  return `${resultCount} ${noun}`;
}

/**
 * Returns `true` if any filter is currently active (non-default).
 */
function hasActiveFilters(search: string, status: string): boolean {
  return search.length > 0 || status.length > 0;
}

export function ScanFilters({
  search,
  status,
  resultCount,
  totalScans,
  onSearchChange,
  onStatusChange,
  onReset,
}: ScanFiltersProps): React.ReactElement {
  const active = hasActiveFilters(search, status);

  return (
    <section className={styles.scanFilters}>
      {/* ── Filter controls ── */}
      <div className={styles.filterControls}>
        <div className={styles.filterGroup}>
          <label htmlFor="scan-search" className={styles.filterLabel}>
            Search scans
          </label>
          <input
            id="scan-search"
            type="search"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="example.com"
            className={styles.searchInput}
          />
        </div>

        <div className={styles.filterGroup}>
          <label htmlFor="scan-status" className={styles.filterLabel}>
            Status
          </label>
          <select
            id="scan-status"
            value={status}
            onChange={(e) => onStatusChange(e.target.value)}
            className={styles.statusSelect}
          >
            <option value="">All</option>
            {SCAN_STATUSES.map((s) => (
              <option key={s} value={s}>
                {statusLabel(s)}
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
          {totalScans === 0 ? <p>No scans yet.</p> : <p>No scans match the current filters.</p>}
          {active && (
            <button type="button" onClick={onReset} className={styles.resetButton}>
              Reset filters
            </button>
          )}
          {totalScans === 0 && (
            <Link href="/scans/new" className={styles.emptyLink}>
              New scan →
            </Link>
          )}
        </div>
      )}
    </section>
  );
}
