/**
 * Detection coverage — pure, in-memory derivation of a compact evidence
 * coverage summary from an already-loaded set of detection responses.
 *
 * This module computes coverage metrics exclusively from the existing
 * API response shapes. No new API endpoint, no database query, no
 * asynchronous processing, and no detection/scoring changes.
 *
 * Pipeline:
 *
 *   DetectionResponse[] → getDetectionCoverage() → coverage summary
 *
 * Counting semantics (documented to avoid competing definitions):
 *   - technologyCount   — unique technology IDs (same as ScanOverview, Step 37)
 *   - detectionCount    — raw detection entries (same as ScanInsights)
 *   - evidenceCount     — deduplicated evidence using the canonical
 *                         evidenceIdentity (NOT the raw sum used by
 *                         ScanOverview or ScanInsights)
 *   - evidenceTypeCount — number of distinct evidence types
 *   - evidenceTypes     — unique type labels, sorted alphabetically ASC
 *
 * The deduplicated evidenceCount is intentionally different from both
 * ScanOverview.evidenceCount and ScanInsights.evidenceCount (both of which
 * use the raw sum). This is the single authoritative meaning for
 * deduplicated evidence coverage.
 *
 * Properties:
 *   - Pure (no React, HTTP, DB, browser)
 *   - Synchronous
 *   - Deterministic
 *   - Immutable (does not mutate input)
 */

import type { DetectionResponse, EvidenceResponse } from '../lib/types.js';
import { evidenceTypeLabel } from '../lib/evidence-presenter';
import { deduplicateEvidence } from '../lib/evidence-identity';

// ─── Types ───────────────────────────────────────────────────────────

/**
 * Compact coverage summary for the detection results.
 */
export interface DetectionCoverage {
  /** Number of unique detected technology IDs (deduplicated by ID). */
  readonly technologyCount: number;
  /** Number of raw detection entries (before deduplication). */
  readonly detectionCount: number;
  /** Total unique evidence items (deduplicated via canonical identity). */
  readonly evidenceCount: number;
  /** Number of distinct evidence types represented. */
  readonly evidenceTypeCount: number;
  /** Unique evidence type labels, sorted alphabetically ASC. */
  readonly evidenceTypes: string[];
}

// ─── Internal helpers ───────────────────────────────────────────────

// Uses canonical getEvidenceIdentity + deduplicateEvidence from evidence-identity.ts

// ─── Pure coverage function ──────────────────────────────────────────

/**
 * Produces a compact, deterministic coverage summary from detection
 * results.
 *
 * Counts:
 *   - `technologyCount`: unique technology IDs (deduplicated by Set)
 *   - `detectionCount`: raw detection entries
 *   - `evidenceCount`: deduplicated evidence using canonical identity
 *
 * Evidence types:
 *   - `evidenceTypes`: unique type labels, sorted alphabetically ASC
 *   - `evidenceTypeCount`: length of `evidenceTypes`
 *
 * Does not mutate the input. Returns a new readonly object.
 *
 * @param detections Array of detection responses (from API, already loaded)
 * @returns A deterministic coverage summary
 */
export function getDetectionCoverage(detections: DetectionResponse[]): DetectionCoverage {
  // Collect unique technology IDs and all evidence for global deduplication
  const uniqueTechIds = new Set<string>();
  const allEvidence: EvidenceResponse[] = [];

  for (const detection of detections) {
    uniqueTechIds.add(detection.technology.id);
    allEvidence.push(...detection.evidence);
  }

  // Deduplicate evidence globally using the canonical identity
  const uniqueEvidence = deduplicateEvidence(allEvidence);

  // Collect unique evidence type labels, sorted alphabetically
  const evidenceTypeSet = new Set<string>();
  for (const item of uniqueEvidence) {
    evidenceTypeSet.add(evidenceTypeLabel(item.type));
  }
  const evidenceTypes = [...evidenceTypeSet].sort();

  return {
    technologyCount: uniqueTechIds.size,
    detectionCount: detections.length,
    evidenceCount: uniqueEvidence.length,
    evidenceTypeCount: evidenceTypes.length,
    evidenceTypes,
  };
}
