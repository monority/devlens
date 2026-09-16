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

/**
 * Produces a canonical identity string for an evidence item.
 *
 * This mirrors the identity semantics already established in
 * `scan-insights.ts` (`evidenceIdentity`) and replicated in
 * `scan-detection-results.ts` (`evidenceKey`). Each evidence type uses
 * its type-specific primary identifier:
 * - html               → selector
 * - http_header        → name
 * - script_url         → url
 * - script_content     → snippet
 * - meta_tag           → name
 * - javascript_global  → globalName
 * - resource           → url
 *   link               → url
 * - unknown            → full JSON serialization
 *
 * No second algorithm is introduced.
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
 * Preserves order of first occurrence. Does not mutate input.
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
