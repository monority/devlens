/**
 * Technology detection history — a pure, deterministic projection of *how one
 * technology's detection has evolved across completed scans.
 *
 * This is a **presentation helper**: it turns the existing `ScanResult[]`
 * (already loaded by the technology detail page via `getAllScanResults`) into a
 * chronological history for a single technology, reusing — and only reusing —
 * the existing detection pipeline so the history is byte-for-byte consistent
 * with the scan-detail view:
 *
 *   ScanResult[]
 *     → detectionToResponse(detection)      (Step 73 API mapping: +explanation/+provenance/+integrity)
 *     → getScanDetectionResults(responses)  (canonicalize: sort, dedup by tech ID, recompute explanation)
 *     → pick the entry whose technology.id === techId
 *
 * Nothing here recomputes provenance, integrity, signal quality, or evidence
 * identity from scratch — it reads those already-attached diagnostics off the
 * canonical `DetectionResponse`, exactly as `DetectionItem` / `ScanComparison`
 * do. See Step 88 §4/§5.
 *
 * Properties (Step 88 §13):
 * - Pure (no React, HTTP, DB, browser)
 * - Synchronous / deterministic (scan ordering is canonical: createdAt DESC,
 *   scanId ASC — the repo's scan chronology; equal timestamps tie-break by id)
 * - Immutable — never mutates the input `ScanResult[]` or any of its nested
 *   detection/evidence objects (`detectionToResponse` and
 *   `getScanDetectionResults` both allocate new arrays/objects).
 * - Serializable (plain objects, no runtime classes, no circular refs).
 *
 * §9 integrity normalization (presentation only, never changes the API
 * contract): `integrity` is `null` when a detection is structurally valid
 * (absent on the response = valid), and the attached verdict when invalid.
 */

import type { ScanResult } from '@devlens/application';
import type { DetectionProvenance, DetectionIntegrity } from '@devlens/core';
import type { DetectionResponse, SignalQuality } from './types.js';
import { detectionToResponse } from './detection-to-response';
import { getScanDetectionResults } from './scan-detection-results';
import { computeSignalQuality } from './signal-quality';

/**
 * A single row in a technology's detection timeline — one scan, one detection.
 *
 * All diagnostic fields mirror the canonical `DetectionResponse` produced by
 * the scan-detail pipeline (`detectionToResponse` + `getScanDetectionResults`):
 *   - `confidence`, `version`, `versionConflict`, `versionSource`, `evidence`,
 *     `provenance`, `integrity`, `source`, `derivedFrom`
 *   so the timeline renders the *same* facts the user sees on the scan detail
 *   page for that detection.
 *
 * §9 normalization for integrity: `integrity` is `null` when the detection is
 * structurally valid (the response omits `integrity` for clean detections), and
 * the verbatim `DetectionIntegrity` verdict when issues were found.
 */
export interface TechnologyDetectionHistoryEntry {
  /** Stable scan identifier — the row's navigation key (links to `/scans/{id}`). */
  readonly scanId: string;
  /** Scan creation timestamp (ISO 8601), used as the primary chronological key. */
  readonly scanCreatedAt: string;
  /** Terminal timestamp when the scan finished (`completedAt` for completed). Always present for completed scans. */
  readonly scanCompletedAt: string | null;
  /** Always `'completed'` — only completed scans carry detections (by domain design). */
  readonly scanStatus: 'completed';
  /** The exact confidence value carried by the canonical detection (never recalculated). */
  readonly confidence: number;
  /**
   * Resolved version, or `null` when absent or when a version conflict is
   * present (mirrors `DetectionResponse.version` semantics).
   */
  readonly version: string | null;
  /** `true` when disagreeing version observations were merged (see versionConflictDetail). */
  readonly versionConflict: boolean;
  /** The evidence-source modality the resolved version came from, when unambiguous. */
  readonly versionSource?: string;
  /**
   * Distinct evidence item count **after** canonical deduplication — matches
   * the evidence list rendered on the scan-detail page for this detection.
   */
  readonly evidenceCount: number;
  /**
   * Descriptive corroboration summary (Step 76), computed from the
   * deduplicated evidence — identical to the scan-detail view's signal quality.
   */
  readonly signalQuality: SignalQuality;
  /**
   * Step 80 deterministic provenance — present for directly-observed
   * detections (those carrying evidence); absent for relationship-derived
   * detections. Forwarded verbatim from the canonical response.
   */
  readonly provenance?: DetectionProvenance;
  /**
   * Step 81 structural integrity verdict — `null` when valid (absent on the
   * response), the verbatim `{ valid: false, issues }` when invalid (§9).
   */
  readonly integrity: DetectionIntegrity | null;
  /** `'relationship'` when derived via an `implies` edge, else `'direct'`. */
  readonly source: 'direct' | 'relationship';
  /**
   * Source technologies for a derived detection (present iff `source` is
   * `'relationship'`), each with a canonical `implies` edge.
   */
  readonly derivedFrom?: ReadonlyArray<{
    source: string;
    sourceName: string;
    type: 'implies';
  }>;
}

/**
 * Chronological ordering for scan results: newest first, with a stable
 * scan-id ascending tie-break for equal timestamps (Step 88 §4).
 *
 * This matches the repository's scan chronology (`createdAt DESC, scanId ASC`
 * used by `listScans`), so the timeline's order agrees with the scan history.
 */
function compareScanChronological(a: ScanResult, b: ScanResult): number {
  if (a.scan.createdAt !== b.scan.createdAt) {
    return a.scan.createdAt < b.scan.createdAt ? 1 : -1;
  }
  return a.scan.id === b.scan.id ? 0 : a.scan.id < b.scan.id ? -1 : 1;
}

/**
 * Builds a history entry from the canonical detection response for a single
 * scan. Reads only already-computed fields (no re-derivation) so the result
 * stays consistent with the scan-detail view.
 */
function toHistoryEntry(
  scanResult: ScanResult,
  detection: DetectionResponse,
): TechnologyDetectionHistoryEntry {
  const meta = scanResult.scan;
  const status = meta.status;

  // §9 integrity normalization: absent on the response ⇒ valid (null).
  const integrity: DetectionIntegrity | null = detection.integrity ?? null;

  // `source` is the canonical direct/derived discriminant (mirrors
  // `DetectionExplainability.kind`): `'relationship'` only when the detection
  // is `implies`-derived, otherwise `'direct'`.
  const source: 'direct' | 'relationship' =
    detection.source === 'relationship' ? 'relationship' : 'direct';

  return {
    scanId: meta.id,
    scanCreatedAt: meta.createdAt,
    scanCompletedAt: status.type === 'completed' ? status.completedAt : null,
    scanStatus: 'completed',
    confidence: detection.confidence,
    // `version` is absent when never observed; null on a conflict. `?? null`
    // collapses absent ⇒ null so consumers see a stable `string | null`.
    version: detection.version ?? null,
    versionConflict: detection.versionConflict === true,
    ...(detection.versionSource ? { versionSource: detection.versionSource } : {}),
    evidenceCount: detection.evidence.length,
    // `explanation.signalQuality` is always attached by `getDetectionExplainability`;
    // the `??` fallback exists only for legacy/older-API responses that omit it,
    // so the field is provably non-null for the canonical pipeline.
    signalQuality: detection.explanation?.signalQuality ?? computeSignalQuality(detection.evidence),
    ...(detection.provenance ? { provenance: detection.provenance } : {}),
    integrity,
    source,
    ...(detection.derivedFrom ? { derivedFrom: detection.derivedFrom } : {}),
  };
}

/**
 * Derives a chronological, per-scan history of a single technology's detection
 * across completed scans.
 *
 * The history is built from the **same** two-stage pipeline the scan-detail
 * page uses (`detectionToResponse` → `getScanDetectionResults`), so each entry
 * carries the canonical, deduped detection — with the exact explanation,
 * provenance, integrity, and signal quality that the user sees on the detail
 * page for that scan. No diagnostic primitive is reimplemented here.
 *
 * - Returns entries ordered by scan creation (newest first), with equal
 *   timestamps tie-broken by scan id ascending (Step 88 §4).
 * - Only `completed` scans contribute (failed/pending/running carry no
 *   detections by domain-model design).
 * - A scan that did not detect the technology is omitted.
 * - Returns `[]` when no scan detected the technology.
 * - Never mutates the input `scans` (a shallow copy is sorted; downstream
 *   pipeline functions allocate new arrays — see module docs).
 *
 * @param scans       All scan results loaded for the technology catalog (order
 *                    is re-canonicalized here — callers need not pre-sort).
 * @param technologyId The canonical technology id to project history for.
 * @returns            Chronological detection history (newest first).
 */
export function technologyDetectionHistory(
  scans: ScanResult[],
  technologyId: string,
): TechnologyDetectionHistoryEntry[] {
  const entries: TechnologyDetectionHistoryEntry[] = [];

  // §4: chronological, deterministic, non-mutating (sorts a shallow copy).
  for (const scanResult of [...scans].sort(compareScanChronological)) {
    // Only completed scans carry detections (domain-model invariant — failed /
    // pending / running scans have empty detection arrays). Filtering here
    // mirrors the page's "completed-scan results" guarantee.
    if (scanResult.scan.status.type !== 'completed') continue;

    // Reuse the exact scan-detail pipeline so provenance / integrity /
    // signal quality / explanation are identical to the detail view.
    const canonical = getScanDetectionResults(scanResult.detections.map(detectionToResponse));

    // `find` returns the canonical (highest-confidence, deduped) detection for
    // this technology — the same one the detail page renders for this scan.
    const detection = canonical.find((d) => d.technology.id === technologyId);
    if (!detection) continue;

    entries.push(toHistoryEntry(scanResult, detection));
  }

  return entries;
}
