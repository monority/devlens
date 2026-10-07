/**
 * Pure comparison logic for comparing two scan results — "Detection Change
 * Intelligence".
 *
 * This module is:
 * - Pure (no side effects, no I/O)
 * - Deterministic (same inputs → same outputs, order-independent)
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
 * type and ALL of its identifying fields (e.g.
 * `http_header:Server|nginx`). This mirrors the canonical identity used
 * by the detector layer (`getEvidenceKey` in `@devlens/detectors`), so
 * the presentation layer never silently drops evidence that the detector
 * layer deliberately kept distinct (see Step 63 — Phase 2).
 *
 * Version identity (Step 74) respects the Step 72 rules: a `versionConflict`
 * on either side forbids fabricating a version transition, and a
 * `versionSource`-only difference is not a version change.
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
 * The classification of a single technology's change between two scans.
 *
 * Priority order (Step 74 §10): added → removed → version_changed →
 * provenance_changed → confidence_changed → unchanged.
 */
export type DetectionChangeKind =
  | 'added'
  | 'removed'
  | 'version_changed'
  | 'provenance_changed'
  | 'confidence_changed'
  | 'unchanged';

/**
 * A resolved version comparison for a technology present in both scans.
 *
 * - `before`/`after` are the raw `DetectionResponse.version` values
 *   (`string | null | undefined`). `null` means "absent/conflict-marker";
 *   `undefined` means "no version signal on that side".
 * - `changed` is true ONLY for a real present↔different-present transition.
 *   A `versionConflict` on either side ALWAYS forbids a transition
 *   (Step 74 §5 + Step 72), so `changed` is false whenever either side
 *   is in conflict.
 */
export interface VersionChange {
  before: string | null | undefined;
  after: string | null | undefined;
  changed: boolean;
  beforeConflict: boolean;
  afterConflict: boolean;
}

/**
 * A technology comparison result. Each technology present across the two
 * scans produces exactly one record. `kind` is the single, deduplicated
 * classification; secondary signals (`evidenceChanged`, `confidenceDelta`,
 * the `version`/`versionConflict*` flags) are preserved alongside it.
 *
 * Aliased as `DetectionChange` (Step 74 §2) — the canonical per-technology
 * change record shared by the diff API and the UI.
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

  // ── Step 74: full detections (for explainability linking) ──────────
  before: DetectionResponse | null;
  after: DetectionResponse | null;

  // ── Step 74: version intelligence ────────────────────────────────────
  /** Structured version comparison (before/after/changed/conflict flags). */
  version: VersionChange;
  /** Evidence-source modality the resolved version came from (when unambiguous). */
  versionSource: string | undefined;

  // ── Step 74: provenance ─────────────────────────────────────────────
  /** True when source/derived-from provenance differs between the two scans. */
  provenanceChanged: boolean;

  // ── Step 74: evidence / confidence flags ────────────────────────────
  /** True when any evidence item was added, removed, or changed. */
  evidenceChanged: boolean;
  /** rightConfidence - leftConfidence (alias of scoreDelta). */
  confidenceDelta: number | null;

  // ── Step 87: integrity ─────────────────────────────────────────────
  /**
   * True when the structural integrity verdict differs between before/after
   * for a technology present in both scans. Absent when the technology is
   * only on one side (nothing to compare). Integrity is `undefined` when
   * the detection is valid (absent = valid per Step 81 §10); a change is
   * flagged whenever the normalized verdict differs.
   */
  integrityChanged: boolean;

  // ── Step 74: single, prioritized change classification ─────────────
  kind: DetectionChangeKind;
}

/**
 * The full comparison result between two scans.
 *
 * `changes` is the canonical, deterministically-ordered list (one record
 * per technology). The legacy `added`/`removed`/`unchanged`/`scoreChanges`/
 * `evidenceChanges` views are derived from `changes` and kept for backward
 * compatibility with existing consumers.
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
  /** Step 74 — all technologies, one record each, ordered (kindPriority, id). */
  changes: DetectionChange[];
  /** Step 74 — technologies whose resolved version actually changed. */
  versionChanges: DetectionChange[];
  /** Step 74 — number of technologies with a substantive change (kind !== 'unchanged'). */
  changeCount: number;
  /** Step 87 — technologies whose structural integrity verdict changed between scans. */
  integrityChanges: DetectionChange[];
}

/** Step 74 §2 — the canonical per-technology change record (alias of TechnologyComparison). */
export type DetectionChange = TechnologyComparison;

/** Step 74 §2 — the full structured diff (alias of ComparisonResult). */
export type DetectionDiff = ComparisonResult;

// ─── Helpers ─────────────────────────────────────────────────────────

const KIND_PRIORITY: Record<DetectionChangeKind, number> = {
  added: 0,
  removed: 1,
  version_changed: 2,
  provenance_changed: 3,
  confidence_changed: 4,
  unchanged: 5,
};

/** Sorts `changes` by (kind priority ASC, technology.id ASC) — Step 74 §10. */
export function compareChanges(a: DetectionChange, b: DetectionChange): number {
  const byKind = KIND_PRIORITY[a.kind] - KIND_PRIORITY[b.kind];
  if (byKind !== 0) return byKind;
  if (a.id < b.id) return -1;
  if (a.id > b.id) return 1;
  return 0;
}

/** Absent (`undefined`/`null`) normalizes to `null`; a resolved version stays a string. */
function normalizeVersion(v: string | null | undefined): string | null {
  return v === undefined || v === null ? null : v;
}

/**
 * Computes the version change between two detections' versions.
 *
 * Rule (Step 74 §5 + Step 72): a `versionConflict` on either side forbids
 * fabricating a version transition. Otherwise a transition is any difference
 * between the normalized versions (present↔absent and present↔different both
 * count; absent↔absent does not). A `versionSource`-only difference (equal
 * versions) is NOT a change.
 */
function computeVersionChange(
  before: DetectionResponse | null,
  after: DetectionResponse | null,
): VersionChange {
  const beforeConflict = before?.versionConflict === true;
  const afterConflict = after?.versionConflict === true;

  // Either side in conflict → never report a version transition.
  if (beforeConflict || afterConflict) {
    return {
      before: before?.version ?? null,
      after: after?.version ?? null,
      changed: false,
      beforeConflict,
      afterConflict,
    };
  }

  const bv = normalizeVersion(before?.version);
  const av = normalizeVersion(after?.version);

  return {
    before: before?.version,
    after: after?.version,
    changed: bv !== av,
    beforeConflict: false,
    afterConflict: false,
  };
}

/**
 * Canonical provenance identity for a detection: the `source` plus the
 * sorted set of `{source, type}` pairs from `derivedFrom`. Order-independent
 * so derived → derived (same sources) is unchanged.
 */
function provenanceKey(d: DetectionResponse | null): string {
  if (!d) return 'absent';
  const source = d.source ?? 'direct';
  const prov = d.derivedFrom;
  if (!prov || prov.length === 0) return source;
  return (
    source +
    ':' +
    [...prov]
      .map((p) => `${p.source}|${p.type}`)
      .sort((a, b) => a.localeCompare(b))
      .join(',')
  );
}

/** True when the relationship provenance differs (in-both only). */
function computeProvenanceChange(
  before: DetectionResponse | null,
  after: DetectionResponse | null,
): boolean {
  if (!before || !after) return false;
  return provenanceKey(before) !== provenanceKey(after);
}

/**
 * Normalizes a detection's integrity verdict into a stable comparison key
 * for cross-scan integrity change detection (Step 87).
 *
 * Per Step 81 §10, `integrity` is absent (`undefined`) when the detection is
 * valid. A valid detection and a detection with `valid: true, issues: []`
 * are equivalent. A detected issue set is serialized in its existing
 * canonical order (Step 81 §12: `INTEGRITY_ISSUE_ORDER`).
 *
 * Returns `'valid'` for clean detections or `'invalid:<issue1>,<issue2>'`
 * for detections with structural problems.
 */
function integrityKey(d: DetectionResponse | null): string {
  if (!d || !d.integrity || d.integrity.valid) {
    return 'valid';
  }
  return 'invalid:' + d.integrity.issues.join(',');
}

/**
 * Detects whether the structural integrity verdict changed between two
 * detections for the same technology. Only meaningful when both sides are
 * present (in-both technologies); returns false otherwise.
 */
function computeIntegrityChange(
  before: DetectionResponse | null,
  after: DetectionResponse | null,
): boolean {
  if (!before || !after) return false;
  return integrityKey(before) !== integrityKey(after);
}

/**
 * Assigns the single, prioritized `DetectionChangeKind` for a technology
 * present in both scans (Step 74 §4/§10 priority order).
 */
function classifyChange(
  version: VersionChange,
  provenanceChanged: boolean,
  scoreChanged: boolean,
): DetectionChangeKind {
  if (version.changed) return 'version_changed';
  if (provenanceChanged) return 'provenance_changed';
  if (scoreChanged) return 'confidence_changed';
  return 'unchanged';
}

// ─── Pure comparison function ────────────────────────────────────────

/**
 * Builds a lookup map of detections keyed by `technology.id`.
 */
function buildDetectionMap(
  detections: readonly DetectionResponse[],
): Map<string, DetectionResponse> {
  const map = new Map<string, DetectionResponse>();
  for (const d of detections) {
    map.set(d.technology.id, d);
  }
  return map;
}

/**
 * Retrieves a single detection from the map by id, returning null when
 * absent (i.e. the technology exists only on the other side of the
 * comparison).
 */
function getDetection(map: Map<string, DetectionResponse>, id: string): DetectionResponse | null {
  return map.has(id) ? map.get(id)! : null;
}

/**
 * Classifies a single technology as 'added', 'removed', or 'unchanged'
 * based on which side(s) of the comparison carry it.
 */
function classifyDetectionStatus(
  leftD: DetectionResponse | null,
  rightD: DetectionResponse | null,
): 'added' | 'removed' | 'unchanged' {
  if (leftD !== null && rightD !== null) return 'unchanged';
  if (leftD !== null) return 'removed';
  return 'added';
}

/**
 * Compares a single technology between two scans and produces the
 * per-technology `TechnologyComparison` record.
 */
function compareSingleDetection(
  leftD: DetectionResponse | null,
  rightD: DetectionResponse | null,
): TechnologyComparison {
  const tech = (leftD ?? rightD)!.technology;
  const id = tech.id;

  const status = classifyDetectionStatus(leftD, rightD);

  const leftConfidence = leftD !== null ? leftD.confidence : null;
  const rightConfidence = rightD !== null ? rightD.confidence : null;
  const scoreDelta =
    leftConfidence !== null && rightConfidence !== null ? rightConfidence - leftConfidence : null;
  const scoreChanged =
    leftConfidence !== null && rightConfidence !== null && leftConfidence !== rightConfidence;

  const evidenceChanges = compareEvidence(leftD, rightD);
  const evidenceChanged = evidenceChanges.some((e) => e.status !== 'unchanged');

  const version = computeVersionChange(leftD, rightD);
  const provenanceChanged = computeProvenanceChange(leftD, rightD);
  const integrityChanged = computeIntegrityChange(leftD, rightD);

  const kind: DetectionChangeKind =
    leftD === null
      ? 'added'
      : rightD === null
        ? 'removed'
        : classifyChange(version, provenanceChanged, scoreChanged);

  return {
    id,
    name: tech.name,
    category: tech.category,
    status,
    leftConfidence,
    rightConfidence,
    scoreDelta,
    scoreChanged,
    evidenceChanges,
    before: leftD,
    after: rightD,
    version,
    versionSource: version.changed ? (leftD ?? rightD)?.versionSource : undefined,
    provenanceChanged,
    evidenceChanged,
    confidenceDelta: scoreDelta,
    integrityChanged,
    kind,
  };
}

/**
 * Compares two scan results and produces a structured, deterministic diff.
 *
 * - Technologies are compared by stable `technology.id` (not name, not order).
 * - Each technology yields exactly one `DetectionChange` (in `changes`),
 *   classified by priority: added → removed → version_changed →
 *   provenance_changed → confidence_changed → unchanged.
 * - Version transitions respect Step 72: a conflict on either side never
 *   fabricates a transition; versionSource-only diffs are not version changes.
 * - Evidence is matched by `evidenceKey` (canonical identity).
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
  const leftMap = buildDetectionMap(left !== null ? left.detections : []);
  const rightMap = buildDetectionMap(right !== null ? right.detections : []);

  const allIds = new Set<string>([...leftMap.keys(), ...rightMap.keys()]);
  const comparisons: TechnologyComparison[] = [];

  for (const id of allIds) {
    comparisons.push(compareSingleDetection(getDetection(leftMap, id), getDetection(rightMap, id)));
  }

  // Determinism: order by (kind priority ASC, technology.id ASC).
  const changes = [...comparisons].sort(compareChanges);

  const added = changes.filter((c) => c.kind === 'added');
  const removed = changes.filter((c) => c.kind === 'removed');
  const unchanged = changes.filter((c) => c.kind === 'unchanged');
  const versionChanges = changes.filter((c) => c.kind === 'version_changed');
  const scoreChanges = changes.filter((c) => c.kind === 'confidence_changed');
  const evidenceChanges = changes.flatMap((c) => c.evidenceChanges);
  const integrityChanges = changes.filter((c) => c.integrityChanged);

  // hasChanges is true if there are any substantive changes: a non-unchanged
  // kind OR a changed evidence set OR an integrity verdict change.
  // Preserves prior semantics for evidence-only diffs while now also covering
  // version/provenance/confidence changes and integrity shifts.
  const hasChanges = changes.some(
    (c) => c.kind !== 'unchanged' || c.evidenceChanged || c.integrityChanged,
  );
  const changeCount = changes.filter((c) => c.kind !== 'unchanged').length;

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
    // Step 74
    changes,
    versionChanges,
    changeCount,
    // Step 87
    integrityChanges,
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
