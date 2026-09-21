/**
 * Detection presentation — Step 77 §4.
 *
 * A pure, deterministic formatting layer that turns a `DetectionResponse`
 * (and its already-computed `DetectionExplainability`) into the compact
 * labels consumed by `DetectionItem` and `ScanComparison`.
 *
 * This module is PURE (Step 77 §16): O(n) over the evidence, no I/O, no
 * network/DB, no catalogue traversal. It REUSES `explanation.signalQuality`
 * (computed once by `getDetectionExplainability`, Step 76) and the Step-76
 * `signalQualityLabel` — it is NOT a second signal-quality implementation
 * (Step 77 §7). It does NOT recompute confidence, score, or signal quality.
 *
 * All strings are deterministic: no locale-dependent formatting, no random
 * values, no object-key insertion-order reliance.
 */

import type { DetectionResponse, DetectionExplainability, DetectionPresentation } from './types.js';
import { getDetectionExplainability } from './detection-explainability';
import { signalQualityLabel } from './signal-quality';

/**
 * Builds the presentation labels for a single detection.
 *
 * @param detection      The detection to present.
 * @param explainability When supplied (the API already attached
 *                       `explanation` via `detection-to-response.ts`), it is
 *                       reused directly so the signal quality is never
 *                       recomputed (Step 77 §7). When omitted/legacy, the
 *                       pure `getDetectionExplainability` is used as a
 *                       fallback — identical to what `DetectionItem` already
 *                       does client-side.
 */
export function getDetectionPresentation(
  detection: DetectionResponse,
  explainability?: DetectionExplainability | null,
): DetectionPresentation {
  const ex = explainability ?? getDetectionExplainability(detection);
  const confidence = detection.confidence;
  const isDerived = detection.source === 'relationship';
  const provenanceLabel: 'Direct' | 'Derived' = isDerived ? 'Derived' : 'Direct';

  // Step 76: reuse the single source of truth for signal quality.
  const sq = ex.signalQuality;
  const signalQuality = sq ? signalQualityLabel(detection, sq) : '';

  // Confidence is a 0–100 ranking score, NOT a probability — never a '%'.
  const confidenceLabel = `Confidence: ${confidence}`;

  // Compact, non-duplicative evidence hint (distinct from the `N sources`
  // token already carried by `signalQuality`, Step 77 §8).
  const evidenceSummary = `${ex.evidenceCount} evidence ${ex.evidenceCount === 1 ? 'item' : 'items'}`;

  // Combined header line (Step 77 §6):
  //   direct:  "Confidence: N · Strong · Direct"
  //   derived: "Confidence: 0 · Derived · no direct evidence" (§10 — never
  //            surfaces a signal-quality level, never borrows the source's
  //            evidence, never "Strong").
  let combinedHeaderLabel: string;
  if (isDerived) {
    combinedHeaderLabel = `${confidenceLabel} · Derived · no direct evidence`;
  } else if (sq) {
    combinedHeaderLabel = `${confidenceLabel} · ${signalQuality} · ${provenanceLabel}`;
  } else {
    // Legacy response: `explanation.signalQuality` is absent — omit it rather
    // than fabricate one (Step 77 §10).
    combinedHeaderLabel = `${confidenceLabel} · ${provenanceLabel}`;
  }

  return {
    confidenceLabel,
    signalQualityLabel: signalQuality,
    provenanceLabel,
    evidenceSummary,
    combinedHeaderLabel,
  };
}
