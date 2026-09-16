/**
 * Detection explainability — pure, in-memory derivation of a structured
 * explanation for a technology detection, including per-evidence origin
 * descriptions.
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
 *
 * All derived strings are deterministic: no locale-dependent formatting,
 * no random values, no object-key insertion-order reliance.
 */

import type { DetectionResponse, EvidenceResponse } from '../lib/types.js';
import { evidenceTypeLabel, evidenceFields } from '../lib/evidence-presenter';
import { getDetectionExplanation } from '../lib/detection-explanation';

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
  /** The primary identifying value (e.g. header name, selector, URL). */
  value: string;
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
  /** Total evidence count. */
  evidenceCount: number;
  /** Unique evidence type labels, sorted alphabetically. */
  evidenceTypes: string[];
  /** Per-evidence origin descriptions, in evidence order. */
  evidenceSources: EvidenceSource[];
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
 * Every evidence-source description is constructed from the evidence's own
 * fields; no new data is invented.
 *
 * @param detection The detection response (from API, already loaded)
 * @returns A deterministic explainability model
 */
export function getDetectionExplainability(detection: DetectionResponse): DetectionExplainability {
  const { technology, confidence, evidence } = detection;

  // Reuse the existing explanation module for the summary
  const { summary } = getDetectionExplanation(detection);

  // Collect unique evidence type labels, sorted alphabetically
  const seenTypes = new Set<string>();
  const evidenceTypes: string[] = [];
  for (const item of evidence) {
    const label = evidenceTypeLabel(item.type);
    if (!seenTypes.has(label)) {
      seenTypes.add(label);
      evidenceTypes.push(label);
    }
  }
  evidenceTypes.sort();

  // Build per-evidence source descriptions (deterministic order = evidence array order)
  const evidenceSources: EvidenceSource[] = evidence.map((item) => ({
    type: evidenceTypeLabel(item.type),
    source: evidenceSourceDescription(item),
    value: evidenceSourceValue(item),
  }));

  return {
    technology: {
      name: technology.name,
      category: technology.category,
    },
    confidence,
    summary,
    evidenceCount: evidence.length,
    evidenceTypes,
    evidenceSources,
  };
}
