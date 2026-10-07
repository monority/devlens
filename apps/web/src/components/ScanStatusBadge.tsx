/**
 * ScanStatusBadge — a small, accessible status badge for scan lifecycle states.
 *
 * Renders a rounded pill with a colored dot indicator. The color is derived
 * from the scan status via CSS variables (see `page.module.css`):
 *
 * - completed → green
 * - failed    → red
 * - running   → blue
 * - pending   → gray
 *
 * Usage:
 * ```tsx
 * <ScanStatusBadge status="completed" />
 * ```
 */

import styles from './ScanCard.module.css';

type ScanStatus = 'pending' | 'running' | 'completed' | 'failed';

const statusMeta: Record<ScanStatus, { label: string; className: string }> = {
  completed: { label: 'Completed', className: styles.statusCompleted ?? '' },
  failed: { label: 'Failed', className: styles.statusFailed ?? '' },
  running: { label: 'Running', className: styles.statusRunning ?? '' },
  pending: { label: 'Pending', className: styles.statusPending ?? '' },
};

export interface ScanStatusBadgeProps {
  status: ScanStatus;
  showDot?: boolean;
}

export function ScanStatusBadge({ status, showDot = true }: ScanStatusBadgeProps): React.ReactElement {
  const meta = statusMeta[status];
  return (
    <span className={`${styles.statusBadge} ${meta.className}`}>
      {showDot && <span className={styles.statusDot} aria-hidden="true" />}
      <span>{meta.label}</span>
    </span>
  );
}
