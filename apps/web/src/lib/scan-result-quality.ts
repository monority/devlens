/**
 * Scan result quality — pure, in-memory derivation of a scan-level
 * result-quality summary from an already-loaded `ScanDetailResponse`
 * (Step 79).
 *
 * This module computes presentation data exclusively from the EXISTING API
 * response shapes — it does not recompute signal quality (Step 76), does
 * not touch detectors, does not re-run coverage (Step 78), and performs no
 * IO/DB/network work.
 *
 * Reuse:
 *   - `DetectionResponse.explanation.signalQuality` — already pre-computed
 *     server-side by `detectionToResponse` → `getDetectionExplainability`
 *     → `computeSignalQuality`. Read verbatim; never reconstructed. (§9.I)
 *   - `ScanDetailResponse.observationCoverage` — already computed
 *     server-side by the handler via `getObservationCoverage`. (§3)
 *
 * Determinism: counts are order-independent; the categorical `quality` is
 * a pure function of the aggregate counts above. Permuting detections or
 * resources cannot change the summary (§9.H).
 *
 * Pipeline:
 *   ScanDetailResponse  (already has `detections[].explanation.signalQuality`
 *                        + `observationCoverage`)
 *     → getScanResultQuality()
 *     → ScanResultQualitySummary
 */

import type { ScanResultQuality, ScanResultQualitySummary } from '@devlens/core';
import type { ScanDetailResponse } from '../lib/types.js';

/**
 * Reads a detection's pre-computed signal-quality level (Step 76), if
 * present. Returns `undefined` for detections whose explainability was not
 * shipped (backward compatibility).
 */
function signalQualityLevel(detection: {
  explanation?: { signalQuality?: { level?: string; corroborated?: boolean } };
}): string | undefined {
  return detection.explanation?.signalQuality?.level;
}

/**
 * Builds a `ScanResultQualitySummary` from a scan detail response.
 *
 * The input is the existing `ScanDetailResponse` shape (or a subset
 * thereof): it consumes `detections` (each already carrying
 * `explanation.signalQuality`) and the server-computed
 * `observationCoverage`. No evidence family is re-derived here — the
 * per-detection signal quality is reused verbatim (§9.I).
 *
 * Classification rules (§3 — deterministic, parameter-light; the only
 * thresholds are "≤2 usable surfaces = very little coverage" and
 * "failures+skips outweigh successful fetches = dominant failure"):
 *
 *   no_observations      — no detections. (Coverage facts stay exposed via
 *                          the failure/skip counts and `hasPartialObservation`,
 *                          so "fully scanned but nothing found" is distinguishable
 *                          from "nothing observed at all".)
 *   limited_observation  — very little usable coverage (≤2 surfaces) OR
 *                          failed+skipped resources outnumber fetched ones.
 *   partially_observed   — detections exist and some surfaces failed/skipped
 *                          (result may be incomplete), but failures are not
 *                          dominant and coverage is not very thin.
 *   well_supported       — detections exist, no failure/skip, and coverage is
 *                          not very thin (≥3 surfaces). Requires >0 detections
 *                          (§11 self-audit: never label an empty scan as
 *                          "well supported" / "correct").
 *
 * @param result A scan detail response (or a `{ detections, observationCoverage }` subset).
 * @returns A deterministic result-quality summary.
 */
export function getScanResultQuality(
  result: Pick<ScanDetailResponse, 'detections' | 'observationCoverage'>,
): ScanResultQualitySummary {
  const detections = result.detections ?? [];
  const coverage = result.observationCoverage;

  const detectionCount = detections.length;
  const directDetectionCount = detections.filter((d) => d.source !== 'relationship').length;
  const derivedDetectionCount = detections.filter((d) => d.source === 'relationship').length;

  // Reused verbatim (§9.I) — read, never recomputed.
  const corroboratedDetectionCount = detections.filter(
    (d) => d.explanation?.signalQuality?.corroborated,
  ).length;
  const singleSignalDetectionCount = detections.filter(
    (d) => signalQualityLevel(d) === 'single_signal',
  ).length;
  const noEvidenceDetectionCount = detections.filter(
    (d) => signalQualityLevel(d) === 'no_evidence',
  ).length;

  const versionConflictCount = detections.filter((d) => d.versionConflict === true).length;

  // Observation facts (Step 78 — counted, never fabricated).
  const failedObservationCount = coverage?.failed ?? 0;
  const skippedObservationCount = coverage?.skipped ?? 0;
  const fetchedObservationCount = coverage?.fetched ?? 0;

  // A surface is "usable" when it is observed or partial; `failed`/`skipped`
  // surfaces are present-but-broken; `not_observed` surfaces are absent.
  const hasPartialObservation = coverage
    ? coverage.sources.some(
        (s) => s.status === 'partial' || s.status === 'failed' || s.status === 'skipped',
      )
    : false;
  const observedSurfaceCount = coverage
    ? coverage.sources.filter((s) => s.status === 'observed' || s.status === 'partial').length
    : 0;

  let quality: ScanResultQuality;
  if (detectionCount === 0) {
    quality = 'no_observations';
  } else if (observedSurfaceCount <= 2) {
    quality = 'limited_observation';
  } else if (
    hasPartialObservation &&
    failedObservationCount + skippedObservationCount > fetchedObservationCount
  ) {
    quality = 'limited_observation';
  } else if (hasPartialObservation) {
    quality = 'partially_observed';
  } else {
    quality = 'well_supported';
  }

  return {
    quality,
    detectionCount,
    directDetectionCount,
    derivedDetectionCount,
    corroboratedDetectionCount,
    singleSignalDetectionCount,
    noEvidenceDetectionCount,
    versionConflictCount,
    failedObservationCount,
    skippedObservationCount,
    hasPartialObservation,
  };
}
