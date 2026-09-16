/**
 * EmptyDetections — dedicated empty state for a completed scan
 * with zero detections.
 *
 * This is a valid result — not an error. The scan completed
 * successfully; no supported technologies were detected.
 */

import styles from './ScanCard.module.css';

export function EmptyDetections(): React.ReactElement {
  return (
    <section className={styles.emptyDetections}>
      <h2>Detections (0)</h2>
      <p>The scan completed successfully.</p>
      <p>No supported technologies were detected on this site.</p>
    </section>
  );
}
