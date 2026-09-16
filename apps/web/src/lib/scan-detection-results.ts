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

import type { DetectionResponse, EvidenceResponse } from '../lib/types.js';
import { evidenceTypeLabel } from '../lib/evidence-presenter';

// ─── Internal helper: evidence identity ──────────────────────────────

/**
 * Produces a canonical string for an evidence item, used for deduplication.
 *
 * This mirrors the identity semantics already established in the evidence
 * presenter layer (`scan-insights.ts` `evidenceIdentity`) — each evidence
 * type uses its type-specific primary identifier. No second algorithm is
 * introduced.
 */
function evidenceKey(item: EvidenceResponse): string {
  switch (item.type) {
    case 'html':
      return `html:${item.selector}`;
    case 'http_header':
      return `http_header:${item.name}`;
    case 'script_url':
      return `script_url:${item.url}`;
    case 'script_content':
      return `script_content:${item.snippet}`;
    case 'meta_tag':
      return `meta_tag:${item.name}`;
    case 'javascript_global':
      return `javascript_global:${item.globalName}`;
    case 'resource':
      return `resource:${item.url}`;
    case 'link':
      return `link:${item.url}`;
    default: {
      const unknown = item as { type: string; [key: string]: unknown };
      return `${unknown.type}:${JSON.stringify(unknown)}`;
    }
  }
}

/**
 * Deduplicates evidence items using the canonical identity key.
 * Preserves the first occurrence. Does not mutate the input array.
 */
function deduplicateEvidence(evidence: readonly EvidenceResponse[]): EvidenceResponse[] {
  const seen = new Set<string>();
  const result: EvidenceResponse[] = [];
  for (const item of evidence) {
    const key = evidenceKey(item);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(item);
    }
  }
  return result;
}

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
      return evidenceKey(a) < evidenceKey(b) ? -1 : evidenceKey(a) > evidenceKey(b) ? 1 : 0;
    });

    results.push({
      technology: tech,
      confidence: detection.confidence,
      evidence,
    });
  }

  return results;
}
