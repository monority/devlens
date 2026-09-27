/**
 * Technology detection history — quality & stability summary (Step 89).
 *
 * A pure, deterministic projection that answers:
 *
 *   "Across the scans where this technology was detected, how stable has its
 *   observation been?"
 *
 * It consumes the `TechnologyDetectionHistoryEntry[]` already produced by
 * `technology-detection-history.ts` (which itself reuses the exact scan-detail
 * pipeline), so every diagnostic field it compares — confidence, version,
 * provenance, integrity, signal quality — is the *same* value the user sees on
 * the scan detail and timeline. No diagnostic primitive is reimplemented here.
 *
 * Properties (Step 89 §3/§13):
 * - Pure (no React, HTTP, DB, browser)
 * - Deterministic (canonical ordering reused; never invents a new one)
 * - Non-mutating (the input history and its elements/issues are never mutated)
 * - Synchronous
 *
 * §5 comparison semantics (compare structured values, never formatted strings):
 * - confidence: exact value (no rounding)
 * - version: the already-normalized `version` (`null` on conflict/absent — see
 *   `TechnologyDetectionHistoryEntry.version`)
 * - provenance: the canonical provenance representation (evidenceCount, the
 *   canonically-ordered evidenceTypes, strongestEvidenceType); absent for
 *   relationship-derived entries — so direct→derived and derived→direct are
 *   both detected as changes
 * - integrity: canonical issue set, sorted by the existing `INTEGRITY_ISSUE_ORDER`
 *   (§5: reuse the repository's canonical issue ordering — never invent one)
 * - signal quality: structured (`level` + `sourceCount`)
 */

import {
  INTEGRITY_ISSUE_ORDER,
  type DetectionIntegrityIssue,
  type DetectionProvenance,
} from '@devlens/core';
import type { SignalQuality } from './types.js';
import type { TechnologyDetectionHistoryEntry } from './technology-detection-history.js';

/** Stability verdict derived from consecutive observations. */
export type HistoryStability = 'stable' | 'changed' | 'indeterminate';

export interface TechnologyDetectionHistorySummary {
  /** Number of completed scans in which the technology was detected. */
  readonly scanCount: number;
  /** Earliest detection (chronologically first) — `null` when no history. */
  readonly firstDetectedAt: string | null;
  /** Most recent detection (chronologically last) — `null` when no history. */
  readonly lastDetectedAt: string | null;
  /** Latest observed confidence (exact value, never rounded). `null` when no history. */
  readonly confidence: number | null;
  /** True if confidence differed between any two consecutive observations. */
  readonly confidenceChanged: boolean;
  /** True if the normalized version state differed between consecutive observations. */
  readonly versionChanged: boolean;
  /** True if the canonical provenance representation differed between consecutive observations. */
  readonly provenanceChanged: boolean;
  /** True if the canonical integrity verdict differed between consecutive observations. */
  readonly integrityChanged: boolean;
  /** True if the structured signal quality differed between consecutive observations. */
  readonly signalQualityChanged: boolean;
  /**
   * `indeterminate` (< 2 observations), `changed` (≥2 and a tracked dimension
   * changed), or `stable` (≥2 and none changed).
   */
  readonly stability: HistoryStability;
}

/** Sort integrity issues into the canonical `INTEGRITY_ISSUE_ORDER` (non-mutating). */
function canonicalIntegrityKey(integrity: TechnologyDetectionHistoryEntry['integrity']): string {
  if (integrity === null) {
    return 'valid';
  }
  // §5: reuse the repository's canonical ordering — a copy is sorted so the
  // input `issues` array is never mutated, and "issue ordering must not create
  // false changes" (same set, different raw order → same key).
  const ordered = [...integrity.issues].sort(
    (a, b) => compareIntegrityRank(a) - compareIntegrityRank(b),
  );
  const joined = ordered.length === 0 ? '' : ordered.join(',');
  return `invalid:${joined}`;
}

/** Canonical rank of an integrity issue (falls back after known issues). */
function compareIntegrityRank(issue: DetectionIntegrityIssue): number {
  const i = INTEGRITY_ISSUE_ORDER.indexOf(issue);
  return i === -1 ? INTEGRITY_ISSUE_ORDER.length : i;
}

/**
 * Canonical provenance signature. `evidenceTypes` is already canonically
 * ordered by `computeDetectionProvenance`, so an element-wise comparison of the
 * pre-sorted arrays is itself canonical — no second ordering is introduced.
 */
function canonicalProvenanceKey(provenance: DetectionProvenance | undefined): string {
  if (provenance === undefined) {
    return 'none';
  }
  return JSON.stringify({
    evidenceCount: provenance.evidenceCount,
    evidenceTypes: provenance.evidenceTypes,
    strongestEvidenceType: provenance.strongestEvidenceType ?? null,
  });
}

/** Structured signal-quality signature (level + source count — never formatted strings). */
function canonicalSignalQualityKey(sq: SignalQuality): string {
  return `${sq.level}|${sq.sourceCount}`;
}

/**
 * Derives a compact quality/stability summary from a technology's detection
 * history.
 *
 * The history is consumed in the ordering produced by
 * `technologyDetectionHistory()` (newest-first, equal-timestamp tie-broken by
 * scan id ascending) — §8 "history is consumed according to the existing
 * deterministic ordering; tie behavior remains deterministic."
 *
 * @returns `null` when there is no detection history (§8/§6: the summary
 *          disappears when there are no observations).
 */
export function technologyDetectionHistorySummary(
  history: readonly TechnologyDetectionHistoryEntry[],
): TechnologyDetectionHistorySummary | null {
  if (history.length === 0) {
    return null;
  }

  const n = history.length;
  // Newest-first ordering ⇒ entries[0] is most recent, entries[n-1] earliest.
  const newest = history[0]!;
  const oldest = history[n - 1]!;

  let confidenceChanged = false;
  let versionChanged = false;
  let provenanceChanged = false;
  let integrityChanged = false;
  let signalQualityChanged = false;

  // Compare consecutive observations. Equality is symmetric, so the newest-first
  // direction is irrelevant to the boolean result — it is deterministic because
  // the input ordering is deterministic (§10).
  for (let i = 0; i < n - 1; i++) {
    const a = history[i]!;
    const b = history[i + 1]!;

    // §5: exact value comparison — no rounding (confidence is never recalculated).
    if (a.confidence !== b.confidence) {
      confidenceChanged = true;
    }
    // `version` is already normalized (null on conflict/absent; see entry docs).
    if (a.version !== b.version) {
      versionChanged = true;
    }
    if (canonicalProvenanceKey(a.provenance) !== canonicalProvenanceKey(b.provenance)) {
      provenanceChanged = true;
    }
    if (canonicalIntegrityKey(a.integrity) !== canonicalIntegrityKey(b.integrity)) {
      integrityChanged = true;
    }
    if (canonicalSignalQualityKey(a.signalQuality) !== canonicalSignalQualityKey(b.signalQuality)) {
      signalQualityChanged = true;
    }
  }

  const anyChanged =
    confidenceChanged ||
    versionChanged ||
    provenanceChanged ||
    integrityChanged ||
    signalQualityChanged;

  // < 2 observations ⇒ indeterminate (no consecutive pair to compare).
  const stability: HistoryStability = n < 2 ? 'indeterminate' : anyChanged ? 'changed' : 'stable';

  return {
    scanCount: n,
    firstDetectedAt: oldest.scanCreatedAt,
    lastDetectedAt: newest.scanCreatedAt,
    confidence: newest.confidence,
    confidenceChanged,
    versionChanged,
    provenanceChanged,
    integrityChanged,
    signalQualityChanged,
    stability,
  };
}
