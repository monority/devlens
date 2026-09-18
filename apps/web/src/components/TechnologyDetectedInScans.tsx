/**
 * TechnologyDetectedInScans — pure presentation component for the
 * "Detected in scans" section on the technology detail page.
 *
 * This is a pure component: it receives pre-computed data as props and
 * renders HTML. It does not fetch data, call APIs, or access the database.
 *
 * States:
 * - `null`  → error / data-unavailable (the page caught a fetch error)
 * - `[]`    → empty state (technology is valid, but no scans detected it)
 * - `[...]`  → list of matching scans, each rendered via the existing
 *              `ScanCard` component for visual consistency
 *
 * Uses `ScanCard` from `ScanViews.tsx` — the same card used in the scan
 * history list — so each entry shows target, hostname, status, date/time,
 * and a link to `/scans/{id}`.
 */

import { ScanCard } from '@/components/ScanViews';
import type { ScanSummary } from '@/lib/types.js';
import cardStyles from '@/components/ScanCard.module.css';
import styles from '@/app/technologies/[id]/page.module.css';

export interface TechnologyDetectedInScansProps {
  /**
   * The scans whose detections include the technology being viewed.
   *
   * - `null`  → scan data could not be loaded (error state)
   * - `[]`    → no scans detected this technology (empty state)
   * - `[...]`  → one or more matching scans
   */
  readonly scans: ScanSummary[] | null;
}

export function TechnologyDetectedInScans({
  scans,
}: TechnologyDetectedInScansProps): React.ReactElement {
  if (scans === null) {
    return (
      <section className={styles.detectedSection} aria-label="Scan data unavailable">
        <h2 className={styles.detectedHeading}>Detected in scans</h2>
        <p className={styles.detectedError}>Unable to load scan data for this technology.</p>
      </section>
    );
  }

  if (scans.length === 0) {
    return (
      <section className={styles.detectedSection} aria-label="No detections found">
        <h2 className={styles.detectedHeading}>Detected in scans</h2>
        <p className={styles.detectedEmpty}>No scans have detected this technology yet.</p>
      </section>
    );
  }

  return (
    <section className={styles.detectedSection} aria-labelledby="detected-in-scans-heading">
      <h2 id="detected-in-scans-heading" className={styles.detectedHeading}>
        Detected in {scans.length} scan{scans.length === 1 ? '' : 's'}
      </h2>
      <div className={cardStyles.cards}>
        {scans.map((scan) => (
          <ScanCard key={scan.id} scan={scan} />
        ))}
      </div>
    </section>
  );
}
