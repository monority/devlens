/**
 * Detection explainability — pure, in-memory derivation of a structured
 * explanation for a technology detection, including per-evidence origin
 * descriptions, canonical identity, and deduplication.
 *
 * This module turns the existing detection data (technology, confidence,
 * evidence) into a richer presentation model that explains — using only
 * data already present in the evidence — where each piece of evidence
 * originated.
 *
 * It does NOT:
 *   - recalculate scores or confidence
 *   - invent evidence that does not exist
 *   - fabricate detector names, paths, or reasons
 *   - introduce a second confidence/scoring algorithm
 *   - define a local evidence identity algorithm (uses canonical
 *     `getEvidenceIdentity` from `lib/evidence-identity.ts`)
 *
 * All derived strings are deterministic: no locale-dependent formatting,
 * no random values, no object-key insertion-order reliance.
 */

import type { DetectionResponse, EvidenceResponse } from '../lib/types.js';
import { evidenceTypeLabel, evidenceFields } from '../lib/evidence-presenter';
import { getDetectionExplanation } from '../lib/detection-explanation';
import { getEvidenceIdentity, deduplicateEvidence } from '../lib/evidence-identity';

// ─── Types ───────────────────────────────────────────────────────────

/**
 * A human-readable description of a single evidence item's origin,
 * derived from the evidence's own fields.
 */
export interface EvidenceSource {
  /** Human-readable evidence type label (e.g. "HTTP Header"). */
  type: string;
  /** Short description of where this evidence originated. */
  source: string;
  /** The primary identifying value (e.g. "Server: nginx"). */
  value: string;
  /** Canonical evidence identity key (e.g. "http_header:Server"). */
  identity: string;
}

/**
 * A structured, deterministic explanation of a single technology detection.
 */
export interface DetectionExplainability {
  technology: {
    name: string;
    category: string;
  };
  /** The existing confidence value — never recalculated. */
  confidence: number;
  /** Neutral summary string (reused from getDetectionExplanation). */
  summary: string;
  /** Total evidence count (after deduplication). */
  evidenceCount: number;
  /** Unique evidence type labels, sorted alphabetically. */
  evidenceTypes: string[];
  /** Per-evidence origin descriptions, deduplicated and deterministically ordered. */
  evidenceSources: EvidenceSource[];
  /** Deduplicated, sorted evidence items — for reuse with EvidenceList. */
  evidence: EvidenceResponse[];
}

// ─── Internal helpers ───────────────────────────────────────────────

/**
 * Builds a human-readable source description for a single evidence item,
 * using only fields that already exist on the evidence object.
 *
 * - http_header → "HTTP header 'Server'"
 * - meta_tag → "Meta tag 'generator'"
 * - script_url → "Script from 'https://...'"
 * - script_content → "JavaScript snippet"
 * - html → "HTML element at '#app'"
 * - javascript_global → "JavaScript global 'React'"
 * - resource → "Resource at 'https://...'"
 * - link → "Link to 'https://...'"
 */
function evidenceSourceDescription(item: EvidenceResponse): string {
  switch (item.type) {
    case 'http_header':
      return `HTTP header '${item.name}'`;
    case 'meta_tag':
      return `Meta tag '${item.name}'`;
    case 'script_url':
      return `Script from '${item.url}'`;
    case 'script_content':
      return 'JavaScript snippet';
    case 'html':
      return `HTML element at '${item.selector}'`;
    case 'javascript_global':
      return `JavaScript global '${item.globalName}'`;
    case 'resource':
      return `Resource at '${item.url}'`;
    case 'link':
      return `Link to '${item.url}'`;
    default:
      return 'Evidence';
  }
}

/**
 * Extracts the primary identifying value for an evidence item.
 * This is the most human-distinctive piece of the evidence.
 */
function evidenceSourceValue(item: EvidenceResponse): string {
  const fields = evidenceFields(item);
  // The "value" field is the first presentation field's value.
  // For http_header, this is "Server: nginx". For html, this is "#app".
  // For script_url, this is the URL.
  return fields[0]?.value ?? '';
}

// ─── Public API ──────────────────────────────────────────────────────

/**
 * Produces a structured, deterministic explanation of a technology detection.
 *
 * The confidence value is passed through exactly as-is from the detection
 * — it is never recalculated or relabeled. The summary string is derived
 * from the existing `getDetectionExplanation` module — not reimplemented.
 *
 * Evidence is:
 *   - Deduplicated using the canonical `getEvidenceIdentity` algorithm
 *     (from `lib/evidence-identity.ts`)
 *   - Sorted deterministically by type label ASC, then identity ASC
 *   - Described using only fields that exist on each evidence object
 *
 * @param detection The detection response (from API, already loaded)
 * @returns A deterministic explainability model
 */
export function getDetectionExplainability(detection: DetectionResponse): DetectionExplainability {
  const { technology, confidence } = detection;

  // Reuse the existing explanation module for the summary
  const { summary } = getDetectionExplanation(detection);

  // Deduplicate evidence using the canonical identity, then sort
  // deterministically by type label ASC → canonical identity ASC
  const uniqueEvidence = deduplicateEvidence(detection.evidence).sort((a, b) => {
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

  // Collect unique evidence type labels, sorted alphabetically
  const evidenceTypes = Array.from(
    new Set(uniqueEvidence.map((item) => evidenceTypeLabel(item.type))),
  ).sort();

  // Build per-evidence source descriptions with canonical identity
  const evidenceSources: EvidenceSource[] = uniqueEvidence.map((item) => ({
    type: evidenceTypeLabel(item.type),
    source: evidenceSourceDescription(item),
    value: evidenceSourceValue(item),
    identity: getEvidenceIdentity(item),
  }));

  return {
    technology: {
      name: technology.name,
      category: technology.category,
    },
    confidence,
    summary,
    evidenceCount: uniqueEvidence.length,
    evidenceTypes,
    evidenceSources,
    evidence: uniqueEvidence,
  };
}
