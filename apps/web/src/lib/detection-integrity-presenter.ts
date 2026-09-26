/**
 * Detection-integrity presentation layer (Step 86).
 *
 * The Step 81 `computeDetectionIntegrity` verifier already produced a
 * `DetectionIntegrity` verdict and attached it to `DetectionResponse.integrity`
 * — and, per the API contract, ONLY when a detection is structurally invalid
 * (`valid === false`); clean detections omit the field entirely.
 *
 * This module is the *pure* UI-side counterpart:
 *   - maps each of the 5 canonical `DetectionIntegrityIssue` types to a
 *     human label + explanation (single source of truth: `INTEGRITY_ISSUE_LABELS`),
 *   - aggregates the per-detection verdicts into a scan-level summary that
 *     preserves canonical `INTEGRITY_ISSUE_ORDER`.
 *
 * It NEVER recomputes integrity (no `computeDetectionIntegrity` call) and holds
 * no React / HTTP / DB concerns — it only translates already-computed verdicts.
 *
 * Verified against the Step 81 contract:
 *   - `DetectionIntegrity = { readonly valid: boolean; readonly issues: readonly DetectionIntegrityIssue[] }`
 *   - `INTEGRITY_ISSUE_ORDER` =
 *     [INVALID_DETECTION_IDENTITY, INVALID_EVIDENCE_TYPE, DUPLICATE_EVIDENCE,
 *      PROVENANCE_MISMATCH, EMPTY_EVIDENCE]
 */

import { INTEGRITY_ISSUE_ORDER, type DetectionIntegrityIssue } from '@devlens/core';
import type { DetectionResponse } from './types.js';

/**
 * Human-readable label + explanation for a single canonical integrity issue.
 * `label` is the short tagline shown in the UI; `description` is the longer
 * explanation surfaced as a tooltip on the per-detection notice.
 */
export interface IntegrityIssueLabel {
  readonly issue: DetectionIntegrityIssue;
  readonly label: string;
  readonly description: string;
}

/**
 * Canonical label + explanation for each of the 5 Step 81 issue types.
 * Every key of `DetectionIntegrityIssue` is present — TypeScript enforces that
 * this map cannot drift out of sync with the core taxonomy.
 */
export const INTEGRITY_ISSUE_LABELS: Readonly<
  Record<DetectionIntegrityIssue, IntegrityIssueLabel>
> = {
  INVALID_DETECTION_IDENTITY: {
    issue: 'INVALID_DETECTION_IDENTITY',
    label: 'Invalid detection identity',
    description:
      'The detection is missing a technology identity or confidence and cannot be reliably surfaced.',
  },
  INVALID_EVIDENCE_TYPE: {
    issue: 'INVALID_EVIDENCE_TYPE',
    label: 'Invalid evidence type',
    description: 'One or more evidence entries use an evidence type this UI cannot render.',
  },
  DUPLICATE_EVIDENCE: {
    issue: 'DUPLICATE_EVIDENCE',
    label: 'Duplicate evidence',
    description: 'The same evidence source appears more than once for this detection.',
  },
  PROVENANCE_MISMATCH: {
    issue: 'PROVENANCE_MISMATCH',
    label: 'Provenance mismatch',
    description: 'The detection’s recorded provenance does not match its evidence.',
  },
  EMPTY_EVIDENCE: {
    issue: 'EMPTY_EVIDENCE',
    label: 'Empty evidence',
    description: 'The detection has no supporting evidence to corroborate it.',
  },
};

/**
 * Per-issue tally for the scan-level summary, in canonical order.
 */
export interface IntegrityIssueTally {
  readonly issue: DetectionIntegrityIssue;
  readonly label: string;
  readonly count: number;
}

/**
 * Scan-level aggregation of per-detection integrity verdicts.
 *
 * - `affectedDetectionCount`: detections carrying ≥1 integrity issue.
 * - `totalIssues`: sum of all issues across affected detections.
 * - `issueCounts`: non-zero per-issue tallies, in canonical
 *   `INTEGRITY_ISSUE_ORDER` (the spec's "Map<issue, n> in canonical order").
 */
export interface ScanIntegritySummary {
  readonly affectedDetectionCount: number;
  readonly totalIssues: number;
  readonly issueCounts: readonly IntegrityIssueTally[];
}

/** No-op summary — no integrity issues in the scan. */
export const EMPTY_SCAN_INTEGRITY_SUMMARY: ScanIntegritySummary = {
  affectedDetectionCount: 0,
  totalIssues: 0,
  issueCounts: [],
};

/**
 * Human label for a single integrity issue (e.g. "Duplicate evidence").
 */
export function integrityIssueLabel(issue: DetectionIntegrityIssue): string {
  return INTEGRITY_ISSUE_LABELS[issue].label;
}

/**
 * Longer explanation for a single integrity issue (used as a tooltip).
 */
export function integrityIssueDescription(issue: DetectionIntegrityIssue): string {
  return INTEGRITY_ISSUE_LABELS[issue].description;
}

/**
 * Aggregates per-detection integrity verdicts into a scan-level summary.
 *
 * Per the Step 81 contract, `DetectionResponse.integrity` is present ONLY when a
 * detection is structurally invalid; clean detections omit it (and a present
 * but `valid` verdict is treated as clean). This function reads only those
 * already-computed verdicts — it does NOT call `computeDetectionIntegrity`.
 *
 * Ordering is deterministic: `issueCounts` is filtered through (and ordered
 * by) the canonical `INTEGRITY_ISSUE_ORDER`, so the same scan always renders
 * the same sequence of issue rows.
 *
 * Pure: no React / HTTP / DB. Takes a readonly detections slice.
 */
export function summarizeIntegrity(detections: readonly DetectionResponse[]): ScanIntegritySummary {
  const counts: Record<DetectionIntegrityIssue, number> = {
    INVALID_DETECTION_IDENTITY: 0,
    INVALID_EVIDENCE_TYPE: 0,
    DUPLICATE_EVIDENCE: 0,
    PROVENANCE_MISMATCH: 0,
    EMPTY_EVIDENCE: 0,
  };

  let affectedDetectionCount = 0;
  let totalIssues = 0;

  for (const detection of detections) {
    const integrity = detection.integrity;
    // Clean detection: `integrity` is absent (omitted when valid) or, defensively,
    // present-but-valid. Either way there is nothing to tally.
    if (!integrity || integrity.valid) {
      continue;
    }
    // A verdict with zero issues is not actionable — guard defensively.
    if (integrity.issues.length === 0) {
      continue;
    }
    affectedDetectionCount += 1;
    for (const issue of integrity.issues) {
      counts[issue] += 1;
      totalIssues += 1;
    }
  }

  // Preserve canonical order; emit only non-zero tallies.
  const issueCounts = INTEGRITY_ISSUE_ORDER.filter((issue) => counts[issue] > 0).map((issue) => ({
    issue,
    label: integrityIssueLabel(issue),
    count: counts[issue],
  }));

  return {
    affectedDetectionCount,
    totalIssues,
    issueCounts,
  };
}
