/**
 * Detection → API-response mapping (pure, Step 73 §3).
 *
 * Converts a domain `Detection` into the web `DetectionResponse` contract.
 *
 * - Pure: imports only `@devlens/core` types + web `lib` helpers. It does
 *   NOT import `@devlens/application`, so it stays out of the Next.js route
 *   handler's dependency graph and is trivially unit-testable.
 * - Always emits an `explanation` (computed from the assembled response) so a
 *   single source of truth is shipped to the UI. The UI still falls back to
 *   computing it client-side for hand-crafted/legacy data (see DetectionItem).
 * - Preserves "absent when absent" semantics via conditional spreads: it NEVER
 *   fabricates a `version`, `versionSource`, or `versionEvidence`.
 */

import type { Detection } from '@devlens/core';
import { computeDetectionProvenance, computeDetectionIntegrity } from '@devlens/core';
import type { DetectionResponse } from '../lib/types.js';
import { getDetectionExplainability } from './detection-explainability';

/**
 * Maps a single domain `Detection` to the JSON `DetectionResponse` the API
 * serves, attaching a precomputed explainability model.
 */
export function detectionToResponse(detection: Detection): DetectionResponse {
  const response: DetectionResponse = {
    technology: {
      id: detection.technology.id,
      name: detection.technology.name,
      category: detection.technology.category,
    },
    confidence: detection.confidence,
    // Mutable copy of the core evidence (structural core→web Evidence).
    evidence: [...detection.evidence],
  };

  // Version intelligence (Step 72) — conditional, never fabricated.
  if (detection.version) {
    response.version = detection.version;
  }
  if (detection.versionConflict === true) {
    // Conflict wins: version is null + flag set (§19).
    response.version = null;
    response.versionConflict = true;
  }
  if (detection.versionSource) {
    response.versionSource = detection.versionSource;
  }
  if (detection.versionEvidence) {
    response.versionEvidence = [...detection.versionEvidence];
  }

  // Relationship metadata (Step 69) — absent fields stay absent.
  if (detection.source) {
    response.source = detection.source;
  }
  if (detection.derivedFrom) {
    response.derivedFrom = [...detection.derivedFrom];
  }
  if (detection.relationshipConflicts) {
    response.relationshipConflicts = [...detection.relationshipConflicts];
  }

  // Ship a single, canonical explanation so the UI never has to reconcile
  // two independently-computed views of the same detection.
  response.explanation = getDetectionExplainability(response);

  // Step 80 — deterministic, derived provenance (evidence count, canonical
  // evidence types, strongest evidence type). Derived purely from the
  // detection's existing evidence + confidence; never persisted, never
  // fabricated. Attached only to directly-observed detections (which carry
  // evidence); relationship-derived detections (evidence === []) omit it,
  // matching "absent when absent" semantics above.
  if (detection.evidence.length > 0) {
    response.provenance = computeDetectionProvenance(detection);
  }

  // Step 81 — structural integrity validation. Pure, deterministic, and
  // never mutates the detection. Only surfaces `integrity` on the response
  // when structural issues are found (valid === false) — a clean detection
  // adds no API noise. The provenance that was just computed (or undefined
  // for derived detections) is passed so the validator can cross-check that
  // provenance is consistent with the evidence (§5.2 / §5.3 / §5.5).
  const integrity = computeDetectionIntegrity(detection, response.provenance);
  if (!integrity.valid) {
    response.integrity = integrity;
  }

  return response;
}
