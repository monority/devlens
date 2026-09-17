/**
 * Pure comparison logic for comparing two scan results.
 *
 * This module is:
 * - Pure (no side effects, no I/O)
 * - Deterministic (same inputs → same outputs)
 * - Independent of React, HTTP, and the database
 * - Independently testable
 *
 * The comparison adapter (in `comparison-api.ts`) fetches the two scans
 * via the existing HTTP API and then delegates to `compareScans()`.
 *
 * Technology identity uses the stable `technology.id` from the API —
 * NOT display name and NOT array ordering.
 *
 * Evidence identity uses a deterministic key derived from the evidence
 * type and its identifying fields (e.g. `http_header:X-Powered-By`).
 * This is a presentation-level identity, not a detector-level one.
 */

import type { ScanDetailResponse, DetectionResponse, EvidenceResponse } from './types.js';
import { getEvidenceIdentity } from './evidence-identity';

// Re-export as evidenceKey for backward compatibility with consumers that
// import from comparison.ts.
export const evidenceKey = getEvidenceIdentity;

// ─── Public types ────────────────────────────────────────────────────

/**
 * Input for `compareScans` — two scan results (nullable for 404).
 */
export interface ComparisonInput {
  left: ScanDetailResponse | null;
  right: ScanDetailResponse | null;
}

/**
 * The status of an evidence item relative to the other scan.
 */
export type EvidenceStatus = 'added' | 'removed' | 'unchanged';

/**
 * One evidence item in a comparison.
 */
export interface EvidenceComparison {
  key: string;
  type: string;
  status: EvidenceStatus;
  left: EvidenceResponse | null;
  right: EvidenceResponse | null;
}

/**
 * A technology comparison result.
 */
export interface TechnologyComparison {
  id: string;
  name: string;
  category: string;
  status: 'added' | 'removed' | 'unchanged';
  leftConfidence: number | null;
  rightConfidence: number | null;
  /** Difference: rightConfidence - leftConfidence. Null if either side is null. */
  scoreDelta: number | null;
  /** Whether the confidence values differ. */
  scoreChanged: boolean;
  evidenceChanges: EvidenceComparison[];
}

/**
 * The full comparison result between two scans.
 */
export interface ComparisonResult {
  /** The left (previous) scan, or null if not found. */
  left: ScanDetailResponse | null;
  /** The right (current) scan, or null if not found. */
  right: ScanDetailResponse | null;
  /** True if the left scan could not be resolved. */
  leftNotFound: boolean;
  /** True if the right scan could not be resolved. */
  rightNotFound: boolean;
  /** True if both scans resolved successfully. */
  hasBoth: boolean;
  /** True if the scan targets differ. */
  targetsDiffer: boolean;
  /** True if the left scan has a 'failed' status. */
  leftFailed: boolean;
  /** True if the right scan has a 'failed' status. */
  rightFailed: boolean;
  /** All technologies, grouped by change status. */
  technologies: TechnologyComparison[];
  /** Technologies only in the right (current) scan. */
  added: TechnologyComparison[];
  /** Technologies only in the left (previous) scan. */
  removed: TechnologyComparison[];
  /** Technologies present in both scans. */
  unchanged: TechnologyComparison[];
  /** Technologies where confidence changed. */
  scoreChanges: TechnologyComparison[];
  /** All evidence changes across all technologies. */
  evidenceChanges: EvidenceComparison[];
  /** True if there are ANY changes (added, removed, score changes, evidence changes). */
  hasChanges: boolean;
}

// ─── Pure comparison function ────────────────────────────────────────

/**
 * Compares two scan results and produces a presentation-oriented diff.
 *
 * - Technologies are compared by stable `technology.id` (not name, not order).
 * - Ordering changes are ignored.
 * - Score/confidence changes are exposed as deltas.
 * - Evidence changes are computed for technologies present in both scans.
 * - Failed scans are handled honestly — detection comparison is limited.
 * - Null inputs (404) are handled gracefully.
 *
 * @param left The "previous" scan result, or null if not found.
 * @param right The "current" scan result, or null if not found.
 */
export function compareScans(
  left: ScanDetailResponse | null,
  right: ScanDetailResponse | null,
): ComparisonResult {
  const leftNotFound = left === null;
  const rightNotFound = right === null;
  const hasBoth = !leftNotFound && !rightNotFound;

  const leftFailed = left !== null && left.scan.status === 'failed';
  const rightFailed = right !== null && right.scan.status === 'failed';

  const targetsDiffer =
    hasBoth && left !== null && right !== null && left.scan.target !== right.scan.target;

  // Build technology maps by ID.
  const leftDetections = left !== null ? left.detections : [];
  const rightDetections = right !== null ? right.detections : [];

  const leftMap = new Map<string, DetectionResponse>();
  const rightMap = new Map<string, DetectionResponse>();

  for (const d of leftDetections) {
    leftMap.set(d.technology.id, d);
  }
  for (const d of rightDetections) {
    rightMap.set(d.technology.id, d);
  }

  const allIds = new Set<string>([...leftMap.keys(), ...rightMap.keys()]);
  const comparisons: TechnologyComparison[] = [];

  for (const id of allIds) {
    const leftD = leftMap.get(id) ?? null;
    const rightD = rightMap.get(id) ?? null;

    const tech = (leftD ?? rightD)!.technology;
    const status: 'added' | 'removed' | 'unchanged' =
      leftD !== null && rightD !== null ? 'unchanged' : leftD !== null ? 'removed' : 'added';

    const leftConfidence = leftD !== null ? leftD.confidence : null;
    const rightConfidence = rightD !== null ? rightD.confidence : null;
    const scoreDelta =
      leftConfidence !== null && rightConfidence !== null ? rightConfidence - leftConfidence : null;
    const scoreChanged =
      leftConfidence !== null && rightConfidence !== null && leftConfidence !== rightConfidence;

    const evidenceChanges = compareEvidence(leftD, rightD);

    comparisons.push({
      id,
      name: tech.name,
      category: tech.category,
      status,
      leftConfidence,
      rightConfidence,
      scoreDelta,
      scoreChanged,
      evidenceChanges,
    });
  }

  const added = comparisons.filter((c) => c.status === 'added');
  const removed = comparisons.filter((c) => c.status === 'removed');
  const unchanged = comparisons.filter((c) => c.status === 'unchanged');
  const scoreChanges = comparisons.filter((c) => c.scoreChanged);
  const evidenceChanges = comparisons.flatMap((c) => c.evidenceChanges);

  // hasChanges is true if there are any additions, removals, score changes,
  // or evidence changes among technologies present in both scans.
  const hasChanges =
    added.length > 0 ||
    removed.length > 0 ||
    scoreChanges.length > 0 ||
    evidenceChanges.filter((e) => e.status !== 'unchanged').length > 0;

  return {
    left,
    right,
    leftNotFound,
    rightNotFound,
    hasBoth,
    targetsDiffer,
    leftFailed,
    rightFailed,
    technologies: comparisons,
    added,
    removed,
    unchanged,
    scoreChanges,
    evidenceChanges,
    hasChanges,
  };
}

// ─── Internal: evidence comparison ────────────────────────────────────

/**
 * Compares evidence arrays for a single technology between two scans.
 *
 * Only called for technologies present in both scans (leftD and rightD
 * are not both null). Evidence is matched by `evidenceKey`.
 */
function compareEvidence(
  leftD: DetectionResponse | null,
  rightD: DetectionResponse | null,
): EvidenceComparison[] {
  const leftEvidence: EvidenceResponse[] = leftD?.evidence ?? [];
  const rightEvidence: EvidenceResponse[] = rightD?.evidence ?? [];

  const leftMap = new Map<string, EvidenceResponse>();
  const rightMap = new Map<string, EvidenceResponse>();

  for (const item of leftEvidence) {
    leftMap.set(evidenceKey(item), item);
  }
  for (const item of rightEvidence) {
    rightMap.set(evidenceKey(item), item);
  }

  const allKeys = new Set<string>([...leftMap.keys(), ...rightMap.keys()]);
  const result: EvidenceComparison[] = [];

  for (const key of allKeys) {
    const leftItem = leftMap.get(key) ?? null;
    const rightItem = rightMap.get(key) ?? null;
    const status: EvidenceStatus =
      leftItem !== null && rightItem !== null
        ? 'unchanged'
        : leftItem !== null
          ? 'removed'
          : 'added';

    result.push({
      key,
      type: (leftItem ?? rightItem)?.type ?? 'unknown',
      status,
      left: leftItem,
      right: rightItem,
    });
  }

  return result;
}
