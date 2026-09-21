/**
 * ResultQualitySummary — Step 79 §6 compact factual panel.
 *
 * One-line-per-relevant-dimension rendering of the scan-level result-quality
 * verdict produced by `getScanResultQuality` (web lib). That function is a
 * thin aggregate over the per-detection `DetectionExplainability.signalQuality`
 * (pre-computed server-side by `detectionToResponse` → `computeSignalQuality`,
 * reused, never recomputed here) and the snapshot's `observationCoverage`
 * (Step 78).
 *
 * §6/§13: calm gray palette (#4b5563 heading / #6b7280 body), `.8rem`,
 * no icons, no stars, no grades, no green "trusted" / red "bad scan"
 * coloring, no percentages. Only dimensions that are relevant (non-zero or
 * otherwise meaningful) are rendered.
 *
 * §7: the incomplete-observation warning reuses the exact Step-78 wording
 * and the `.partialWarning` CSS class (no new warning vocabulary). It is shown
 * only when there are detections AND some surface is incomplete; for the
 * zero-detection case the blind-spot warning stays owned by `EmptyDetections`
 * (Step 78), so this section never duplicates it (§8).
 *
 * Pure presentation (no state, hooks, HTTP/DB).
 */

import type { ScanResultQualitySummary } from '@devlens/core';
import styles from './ScanCard.module.css';

export interface ResultQualitySummaryProps {
  resultQuality: ScanResultQualitySummary;
}

const QUALITY_LABELS: Readonly<Record<ScanResultQualitySummary['quality'], string>> = {
  no_observations: 'No observations',
  limited_observation: 'Limited observation',
  partially_observed: 'Partially observed',
  well_supported: 'Well supported',
};

// §14 — exact Step-78 wording, reused verbatim (see EmptyDetections).
const INCOMPLETE_WARNING =
  'Some resources could not be inspected, so the result may be incomplete.';

/**
 * Formats `${count} ${word}`, using `plural` when count != 1. Labels whose
 * singular and plural spelling are identical (`direct`, `derived`,
 * `corroborated`, `single-signal`) pass the same value for both so the word
 * is never mangled with a stray `s`.
 */
function noun(count: number, singular: string, plural: string = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function ResultQualitySummary({
  resultQuality,
}: ResultQualitySummaryProps): React.ReactElement {
  const {
    quality,
    detectionCount,
    directDetectionCount,
    derivedDetectionCount,
    corroboratedDetectionCount,
    singleSignalDetectionCount,
    versionConflictCount,
    failedObservationCount,
    skippedObservationCount,
    hasPartialObservation,
  } = resultQuality;

  // §6: build only the lines for dimensions that actually exist.
  const detailLines: string[] = [];

  if (detectionCount > 0) {
    // group 1: detections + direct/derived split (only the non-zero halves)
    const parts: string[] = [noun(detectionCount, 'detection')];
    if (directDetectionCount > 0) parts.push(noun(directDetectionCount, 'direct', 'direct'));
    if (derivedDetectionCount > 0) parts.push(noun(derivedDetectionCount, 'derived', 'derived'));
    detailLines.push(parts.join(' · '));

    // group 2: corroborated / single-signal (only the non-zero halves)
    const signalParts: string[] = [];
    if (corroboratedDetectionCount > 0) {
      signalParts.push(noun(corroboratedDetectionCount, 'corroborated', 'corroborated'));
    }
    if (singleSignalDetectionCount > 0) {
      signalParts.push(`${singleSignalDetectionCount} single-signal`);
    }
    if (signalParts.length > 0) detailLines.push(signalParts.join(' · '));
  }

  // group 3: version conflicts (only relevant when > 0)
  if (versionConflictCount > 0) {
    detailLines.push(noun(versionConflictCount, 'version conflict', 'version conflicts'));
  }

  // group 4: failed / skipped observation surfaces
  if (failedObservationCount > 0) {
    detailLines.push(noun(failedObservationCount, 'failed observation', 'failed observations'));
  }
  if (skippedObservationCount > 0) {
    detailLines.push(noun(skippedObservationCount, 'skipped observation', 'skipped observations'));
  }

  return (
    <section className={styles.resultQuality}>
      <h2>Result quality</h2>
      <p className={styles.resultQualityLabel}>{QUALITY_LABELS[quality]}</p>

      {detectionCount === 0 ? (
        // §8.A — no detections: make clear there was nothing observable to
        // support a detection. The blind-spot warning for this case is owned
        // by EmptyDetections (Step 78), so it is intentionally not rendered here.
        <p className={styles.resultQualityContext}>
          Nothing was observable to support a detection.
        </p>
      ) : (
        detailLines.map((line) => (
          <p key={line} className={styles.resultQualityLine}>
            {line}
          </p>
        ))
      )}

      {hasPartialObservation && detectionCount > 0 && (
        <p className={styles.partialWarning}>{INCOMPLETE_WARNING}</p>
      )}
    </section>
  );
}
