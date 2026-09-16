/**
 * ScanDetectionResults — renders detection results in deterministic order.
 *
 * Pure presentation component (no React state, no hooks, no HTTP/DB).
 * Receives already-filtered detections (from Step 36's `filterDetections`
 * or the raw detections for unfiltered completed scans) and renders them
 * using the pure `getScanDetectionResults()` function from
 * `lib/scan-detection-results.ts`, followed by `DetectionList` for the
 * actual rendering of each detection item.
 *
 * Ordering: confidence DESC, then technology name ASC (deterministic).
 * Deduplication: by technology ID (highest confidence wins).
 * Evidence: deduplicated using existing evidence identity semantics.
 *
 * The overview metrics (Step 37) remain unaffected — this component only
 * renders the detection results section.
 *
 * This component is pure so it can be tested with `renderToString` from
 * `react-dom/server` — no DOM environment required.
 */

import type { DetectionResponse } from '../lib/types.js';
import { getScanDetectionResults } from '../lib/scan-detection-results';
import { DetectionList } from './DetectionList';

export interface ScanDetectionResultsProps {
  /** Already-filtered detection results from the API */
  detections: DetectionResponse[];
}

export function ScanDetectionResults({
  detections,
}: ScanDetectionResultsProps): React.ReactElement {
  const sorted = getScanDetectionResults(detections);
  return <DetectionList detections={sorted} />;
}
