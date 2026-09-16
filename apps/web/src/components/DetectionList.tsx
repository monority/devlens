/**
 * DetectionList — renders a list of detections in API-returned order.
 *
 * The API returns detections in ranked order. This component preserves
 * that order — it does NOT re-sort or re-score on the frontend.
 *
 * For zero detections, delegates to `EmptyDetections` which provides
 * a dedicated valid state (not an error).
 */

import type { DetectionResponse } from '../lib/types.js';
import { DetectionItem } from './DetectionItem';
import { EmptyDetections } from './EmptyDetections';
import styles from './ScanCard.module.css';

export interface DetectionListProps {
  detections: DetectionResponse[];
}

export function DetectionList({ detections }: DetectionListProps): React.ReactElement {
  if (detections.length === 0) {
    return <EmptyDetections />;
  }

  return (
    <>
      <h2 className={styles.detectionsHeading}>Detections ({detections.length})</h2>
      <ol className={styles.detectionList}>
        {detections.map((detection, index) => (
          <DetectionItem
            key={`${detection.technology.id}-${index}`}
            detection={detection}
            index={index}
          />
        ))}
      </ol>
    </>
  );
}
