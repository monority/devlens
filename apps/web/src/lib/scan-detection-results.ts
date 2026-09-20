/**
 * Detection results presentation — pure, in-memory derivation of a
 * deterministically-ordered detection result set from an already-loaded
 * array of `DetectionResponse` objects.
 *
 * This module is the presentation boundary between the filtered detection
 * list (produced by Step 36's `filterDetections`) and the rendered
 * detection results. It sorts and deduplicates detections for stable,
 * predictable output — regardless of API return order.
 *
 * Pipeline:
 *
 *   filtered Detection[] → getScanDetectionResults() → sorted, deduped array
 *
 * Ordering rules (deterministic):
 *   1. Confidence DESC (highest first)
 *   2. Technology name ASC (alphabetical tie-breaker)
 *   3. Technology ID ASC (final tie-breaker)
 *
 * Deduplication:
 *   - Detections are deduplicated by technology ID (first occurrence after
 *     sorting wins — i.e., the highest-confidence detection for that tech)
 *   - Evidence within each detection is deduplicated using the canonical
 *     evidence identity — the same algorithm already used in
 *     `scan-insights.ts` for the technology evidence matrix. No second
 *     algorithm is invented.
 *   - Evidence is sorted deterministically (by type label, then by
 *     canonical key) so rendering order is stable.
 *
 * Properties:
 *   - Pure (no React, HTTP, DB, browser)
 *   - Synchronous
 *   - Deterministic
 *   - Immutable (does not mutate input; creates new arrays for evidence)
 */

import type { DetectionResponse } from '../lib/types.js';
import { evidenceTypeLabel } from '../lib/evidence-presenter';
import { getEvidenceIdentity, deduplicateEvidence } from '../lib/evidence-identity';

// ─── Pure detection results function ─────────────────────────────────

/**
 * Produces a deterministically-ordered, deduplicated set of detection
 * results from already-filtered detections.
 *
 * Ordering:
 *   1. Confidence DESC (highest first)
 *   2. Technology name ASC (alphabetical tie-breaker)
 *   3. Technology ID ASC (final deterministic tie-breaker)
 *
 * Deduplication:
 *   - Detections deduplicated by technology ID (first after sort = highest confidence)
 *   - Evidence deduplicated within each detection using canonical identity
 *
 * The returned array contains new `DetectionResponse` objects (the input is
 * not mutated). Evidence arrays are new arrays — evidence item objects are
 * shared (they are never mutated by this function).
 *
 * @param detections Already-filtered detection results
 * @returns Sorted, deduplicated detection results
 */
export function getScanDetectionResults(detections: DetectionResponse[]): DetectionResponse[] {
  if (detections.length === 0) {
    return [];
  }

  // Sort by confidence DESC, then name ASC, then id ASC (deterministic)
  const sorted = [...detections].sort((a, b) => {
    if (b.confidence !== a.confidence) {
      return b.confidence - a.confidence;
    }
    if (a.technology.name !== b.technology.name) {
      return a.technology.name < b.technology.name ? -1 : 1;
    }
    return a.technology.id < b.technology.id ? -1 : a.technology.id > b.technology.id ? 1 : 0;
  });

  // Deduplicate by technology ID and sort evidence within each detection
  const seen = new Set<string>();
  const results: DetectionResponse[] = [];

  for (const detection of sorted) {
    const tech = detection.technology;
    if (seen.has(tech.id)) {
      continue;
    }
    seen.add(tech.id);

    // Deduplicate evidence using existing domain semantics, then sort by
    // type label (ASC) then canonical key (ASC) for deterministic ordering.
    const evidence = deduplicateEvidence(detection.evidence).sort((a, b) => {
      const labelA = evidenceTypeLabel(a.type);
      const labelB = evidenceTypeLabel(b.type);
      if (labelA !== labelB) {
        return labelA < labelB ? -1 : 1;
      }
      return getEvidenceIdentity(a) < getEvidenceIdentity(b)
        ? -1
        : getEvidenceIdentity(a) > getEvidenceIdentity(b)
          ? 1
          : 0;
    });

    results.push({
      technology: tech,
      confidence: detection.confidence,
      evidence,
      // Version is omitted when absent (exactOptionalPropertyTypes), so
      // callers can rely on "present ⇒ known version".
      ...(detection.version ? { version: detection.version } : {}),
      // Step 69: propagate relationship metadata (omit when absent) so the
      // UI can distinguish direct observations from derived/conflicted ones.
      ...(detection.source ? { source: detection.source } : {}),
      ...(detection.derivedFrom ? { derivedFrom: detection.derivedFrom } : {}),
      ...(detection.relationshipConflicts
        ? { relationshipConflicts: detection.relationshipConflicts }
        : {}),
    });
  }

  return results;
}
