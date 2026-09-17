/**
 * ScanComparisonSelector — client component for selecting two scans to compare.
 *
 * Replaces the static "Compare two scans" link on the scan history page
 * with a working scan-selection UI. When the user selects two distinct
 * completed scans, the component navigates to:
 *
 *   /scans/compare?left=<id>&right=<id>
 *
 * which is then served by the existing `ScanComparisonPage` / `ScanComparison`
 * component. No comparison logic is duplicated here — the comparison
 * page remains the single source of truth for the comparison report.
 *
 * Selection behavior:
 * - Only `completed` scans are selectable (pending / running / failed are shown
 *   but disabled — users see why a scan can't be chosen)
 * - First selection → "Previous" (left)
 * - Second selection → "Current" (right)
 * - A scan already selected as "left" cannot be chosen as "right" (and vice-versa)
 * - Clicking a selected scan's checkbox again deselects it (explicit control)
 * - The Compare button is disabled until two distinct scans are selected
 *
 * Pure helper logic lives in `lib/comparison-selector.ts`.
 */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ScanSummary } from '../lib/types.js';
import { isComparable, buildCompareUrl, isValidSelection } from '../lib/comparison-selector';
import styles from '../app/scans/page.module.css';
import cardStyles from './ScanCard.module.css';

export interface ScanComparisonSelectorProps {
  /** All scans from the server (unfiltered; includes non-completed) */
  scans: ScanSummary[];
}

export function ScanComparisonSelector({ scans }: ScanComparisonSelectorProps): React.ReactElement {
  const router = useRouter();

  const [enabled, setEnabled] = useState(false);
  const [left, setLeft] = useState<string | null>(null);
  const [right, setRight] = useState<string | null>(null);

  const hasCompleted = scans.some(isComparable);

  // Handle checkbox toggles: clicking a selected scan deselects it.
  const selectLeft = (scanId: string) => {
    setLeft(left === scanId ? null : scanId);
    // A scan can't be both left and right.
    if (right === scanId) setRight(null);
  };

  const selectRight = (scanId: string) => {
    setRight(right === scanId ? null : scanId);
    if (left === scanId) setLeft(null);
  };

  const canCompare = isValidSelection(left, right);

  const handleCompare = () => {
    if (left && right && left !== right) {
      router.push(buildCompareUrl(left, right));
    }
  };

  const handleCancel = () => {
    setEnabled(false);
    setLeft(null);
    setRight(null);
  };

  // ── Collapsed (default) state: show button ──
  if (!enabled) {
    return (
      <div className={styles.compareSection}>
        <button
          type="button"
          onClick={() => setEnabled(true)}
          className={styles.compareLink}
          aria-expanded="false"
        >
          Compare two scans
        </button>
      </div>
    );
  }

  // ── Expanded (selection mode) state ──
  return (
    <div className={styles.compareSection}>
      {/* ── Header ── */}
      <div className={styles.selectorHeader}>
        <h2 className={styles.selectorTitle}>Compare scans</h2>
        <button
          type="button"
          onClick={handleCancel}
          className={styles.cancelButton}
          aria-label="Cancel comparison selection"
        >
          Cancel
        </button>
      </div>

      {/* ── Hint ── */}
      <p className={styles.selectorHint}>
        Select one scan as <strong>Previous</strong> (left) and another as <strong>Current</strong>{' '}
        (right). Only completed scans can be compared.
      </p>

      {/* ── Scan list ── */}
      {!hasCompleted ? (
        <p className={styles.selectorEmpty}>No completed scans available for comparison.</p>
      ) : (
        <div className={styles.selectorCards}>
          {scans.map((scan) => {
            const comparable = isComparable(scan);

            return (
              <div
                key={scan.id}
                className={`${cardStyles.card} ${styles.selectorCard} ${!comparable ? styles.selectorCardDisabled : ''}`}
              >
                <div className={cardStyles.cardHeader}>
                  <span
                    className={`${cardStyles.statusBadge} ${
                      comparable ? cardStyles.statusCompleted : cardStyles.statusPending
                    }`}
                  >
                    {scan.status === 'completed' ? 'Completed' : scan.status}
                  </span>
                  <time dateTime={scan.createdAt}>{scan.createdAt}</time>
                </div>
                <div className={cardStyles.cardBody}>
                  <p className={cardStyles.target}>{scan.target}</p>
                  <p className={cardStyles.hostname}>{scan.hostname}</p>
                </div>

                {comparable ? (
                  <div
                    className={styles.selectionControls}
                    role="radiogroup"
                    aria-label={`Select ${scan.id}`}
                  >
                    <label className={styles.selectionOption}>
                      <input
                        type="checkbox"
                        checked={left === scan.id}
                        onChange={() => selectLeft(scan.id)}
                        aria-label={`${left === scan.id ? 'Deselect' : 'Select'} ${scan.id} as Previous (left)`}
                      />
                      <span>Previous</span>
                    </label>
                    <label className={styles.selectionOption}>
                      <input
                        type="checkbox"
                        checked={right === scan.id}
                        onChange={() => selectRight(scan.id)}
                        disabled={left === scan.id}
                        aria-label={`${right === scan.id ? 'Deselect' : 'Select'} ${scan.id} as Current (right)`}
                      />
                      <span>Current</span>
                    </label>
                  </div>
                ) : (
                  <div className={styles.selectionDisabled}>
                    <span className={styles.selectionHint}>
                      Not available for comparison ({scan.status})
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Selection summary ── */}
      {hasCompleted && (
        <div className={styles.selectionSummary}>
          <span
            className={left ? styles.selectionSet : styles.selectionUnset}
            aria-label="Previous (left) selection"
          >
            {left ? `Previous: ${left}` : 'Previous: —'}
          </span>
          <span
            className={right ? styles.selectionSet : styles.selectionUnset}
            aria-label="Current (right) selection"
          >
            {right ? `Current: ${right}` : 'Current: —'}
          </span>
        </div>
      )}

      {/* ── Action ── */}
      {hasCompleted && (
        <button
          type="button"
          onClick={handleCompare}
          disabled={!canCompare}
          className={styles.compareButton}
        >
          Compare
        </button>
      )}
    </div>
  );
}
