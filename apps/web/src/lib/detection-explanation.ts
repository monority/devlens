/**
 * Detection explanation — pure, in-memory derivation of a neutral
 * explanation for why a technology was detected.
 *
 * This module turns the existing detection data (technology, confidence,
 * evidence) into a concise presentation model. It does NOT recalculate
 * scores, invent evidence, or add new evidence types.
 *
 * Pipeline:
 *
 *   DetectionResponse → getDetectionExplanation() → explanation object
 *
 * All derived strings are deterministic — no locale-dependent formatting,
 * no random values, no object insertion order reliance.
 */

import type { DetectionResponse } from '../lib/types.js';
import { evidenceTypeLabel } from '../lib/evidence-presenter';

// ─── Types ───────────────────────────────────────────────────────────

/**
 * A neutral, deterministic explanation of a single detection.
 */
export interface DetectionExplanation {
  /** Human-readable summary of the evidence coverage. */
  summary: string;
  /** The existing confidence value (not recalculated). */
  confidence: number;
  /** Total number of evidence items. */
  evidenceCount: number;
  /** Unique evidence type labels, sorted alphabetically. */
  evidenceTypes: string[];
}

// ─── Pure functions ──────────────────────────────────────────────────

/**
 * Counts total evidence items in a detection.
 */
function countEvidence(detection: DetectionResponse): number {
  return detection.evidence.length;
}

/**
 * Returns unique evidence type labels, sorted alphabetically.
 *
 * Uses the existing `evidenceTypeLabel()` presenter — no new label
 * mapping is introduced. Unknown evidence types fall back to "Evidence".
 */
function uniqueEvidenceTypes(detection: DetectionResponse): string[] {
  const seen = new Set<string>();
  const types: string[] = [];
  for (const item of detection.evidence) {
    const label = evidenceTypeLabel(item.type);
    if (!seen.has(label)) {
      seen.add(label);
      types.push(label);
    }
  }
  return types.sort();
}

/**
 * Generates a neutral, deterministic summary string based on the
 * detection's actual evidence.
 *
 * - Zero evidence: "No evidence details are available."
 * - One type: "Detected from {type} evidence."
 * - Two types: "Detected from {type1} and {type2} evidence."
 * - Three+ types: "Detected from {type1}, {type2}, and {type3} evidence."
 *
 * The count is always derivable from `evidenceCount`. This function
 * never invents evidence that does not exist.
 */
function buildSummary(types: string[], evidenceCount: number): string {
  if (evidenceCount === 0) {
    return 'No evidence details are available.';
  }

  if (types.length === 0) {
    // Evidence exists but no type labels (shouldn't happen with known types,
    // but handle gracefully).
    return `Detected from ${evidenceCount} evidence source${evidenceCount === 1 ? '' : 's'}.`;
  }

  if (types.length === 1) {
    return `Detected from ${types[0]} evidence.`;
  }

  if (types.length === 2) {
    return `Detected from ${types[0]} and ${types[1]} evidence.`;
  }

  // 3+ types: comma-separated with Oxford comma
  const allButLast = types.slice(0, -1);
  const last = types[types.length - 1];
  return `Detected from ${allButLast.join(', ')}, and ${last} evidence.`;
}

/**
 * Produces a concise, deterministic explanation for a technology detection.
 *
 * The confidence value is passed through exactly as-is from the detection
 * — it is never recalculated or relabeled. Every field is derived
 * exclusively from the detection's own data.
 *
 * @param detection The detection response (from API, already loaded)
 * @returns A deterministic explanation object
 */
export function getDetectionExplanation(detection: DetectionResponse): DetectionExplanation {
  const evidenceCount = countEvidence(detection);
  const evidenceTypes = uniqueEvidenceTypes(detection);
  const summary = buildSummary(evidenceTypes, evidenceCount);

  return {
    summary,
    confidence: detection.confidence,
    evidenceCount,
    evidenceTypes,
  };
}
