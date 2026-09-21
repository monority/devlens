/**
 * Scan result quality — a pure, descriptive, non-probabilistic model of
 * *how interpretable and complete the detection results of a scan are*.
 *
 * Step 79. This describes observability + evidence quality, NOT truth
 * probability, NOT accuracy, and NOT a single opaque score. It must NEVER
 * be misread as "this scan is correct / no technologies present" — see the
 * per-bucket semantics below.
 *
 * What it is NOT:
 *   - a new detector
 *   - a new scoring / confidence algorithm
 *   - a probability or percentage
 *   - a ranking of technologies
 *
 * What it IS:
 *   - a categorical verdict (`quality`) derived from FACTS that already
 *     exist on the scan result:
 *       * detection corroboration (Step 76 `signalQuality`, attached to
 *         each `DetectionResponse` by `detectionToResponse`),
 *       * direct vs relationship-derived provenance (`Detection.source`,
 *         Step 69),
 *       * version conflicts (`Detection.versionConflict`, Step 72),
 *       * observation coverage (Step 78 `ObservationCoverage`).
 *   - the underlying counts (`detectionCount`, `failedObservationCount`,
 *     `hasPartialObservation`, …) so the verdict is never the only signal.
 *
 * The `quality` bucket is intentionally coarse; the factual counts let the
 * UI (and the reader) see *why* a bucket was chosen without inventing
 * reasons.
 *
 * Properties:
 *   - Pure (no React, HTTP, DB, browser)
 *   - Synchronous / O(n)
 *   - Deterministic
 *   - No IO, no DB, no React
 */

// ─── Categorical verdict (§3) ─────────────────────────────────────────

/**
 * Coarse, descriptive verdict for a completed scan's result quality.
 *
 * The classification is intentionally non-probabilistic:
 * - `no_observations`     — no detections exist. The coverage counts +
 *                           `hasPartialObservation` carry the *why*
 *                           (truly nothing observed, or everything observed
 *                           but no technology found).
 * - `limited_observation` — too little usable coverage, or
 *                           failed/skipped surfaces dominate what was
 *                           attempted.
 * - `partially_observed`   — detections exist but some observation
 *                           surfaces failed/skipped (the result may be
 *                           incomplete).
 * - `well_supported`       — detections exist, the site was observably
 *                           covered (no failures/skips), and the
 *                           observations are present. This is NOT a claim
 *                           of correctness or completeness of technology
 *                           coverage — only that the available signals are
 *                           well-corroborated.
 */
export type ScanResultQuality =
  'well_supported' | 'partially_observed' | 'limited_observation' | 'no_observations';

// ─── Summary shape (§2) ───────────────────────────────────────────────

/**
 * Scan-level result-quality summary. All facts are read verbatim from the
 * existing detection/coverage data — nothing is recomputed or invented.
 *
 * `quality` is the coarse verdict; every other field is the factual
 * breakdown that justifies it (and that the UI can surface on demand).
 */
export interface ScanResultQualitySummary {
  /** Coarse categorical verdict (§3). Never collapses failed vs skipped. */
  readonly quality: ScanResultQuality;
  /** Total number of detections (direct + derived). */
  readonly detectionCount: number;
  /** Detections that are directly observed (source absent or `'direct'`). */
  readonly directDetectionCount: number;
  /** Detections derived from a catalog `implies` edge (`source === 'relationship'`). */
  readonly derivedDetectionCount: number;
  /** Detections corroborated by ≥ 2 independent source families (level `corroborated` or `strong`). */
  readonly corroboratedDetectionCount: number;
  /** Detections supported by exactly one source family (level `single_signal`). */
  readonly singleSignalDetectionCount: number;
  /** Detections with no direct evidence (level `no_evidence` — typically derived). */
  readonly noEvidenceDetectionCount: number;
  /** Detections carrying a version conflict (`versionConflict === true`). */
  readonly versionConflictCount: number;
  /** Total failed resource acquisitions across all observation surfaces. */
  readonly failedObservationCount: number;
  /** Total skipped resource acquisitions across all observation surfaces. */
  readonly skippedObservationCount: number;
  /** True when any surface is `partial`/`failed`/`skipped` (the scan is not fully observed). */
  readonly hasPartialObservation: boolean;
}

/**
 * Empty / absent result-quality summary (default when a scan has no
 * detections and no coverage facts — e.g. a failed scan or a scan with no
 * snapshot). All counts are `0`, `quality` is `no_observations`, and
 * `hasPartialObservation` is `false`.
 */
export const EMPTY_SCAN_RESULT_QUALITY: ScanResultQualitySummary = {
  quality: 'no_observations',
  detectionCount: 0,
  directDetectionCount: 0,
  derivedDetectionCount: 0,
  corroboratedDetectionCount: 0,
  singleSignalDetectionCount: 0,
  noEvidenceDetectionCount: 0,
  versionConflictCount: 0,
  failedObservationCount: 0,
  skippedObservationCount: 0,
  hasPartialObservation: false,
};
