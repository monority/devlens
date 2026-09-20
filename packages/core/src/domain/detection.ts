/**
 * Detection — a domain-level assertion that a {@link Technology} was
 * found in a {@link SiteSnapshot}, along with the evidence that supports
 * it.
 *
 * A detection is either a **direct** observation (produced by a detector
 * and scored by the {@link ConfidenceScorer}) or a **relationship-derived**
 * inference (produced by the relationship-resolution layer from an
 * `implies` edge in the technology catalog). The `source` field makes that
 * distinction explicit and unrepresentable-otherwise: direct detections
 * carry no `source` (and never carry `derivedFrom`), while derived
 * detections always carry `source: 'relationship'` with their
 * {@link RelationshipProvenance}.
 *
 * Relationship conflicts (`excludes` / `requires`) are **never** acted
 * upon destructively: they are surfaced, unobtrusively, on the direct
 * detections they apply to via {@link Detection.relationshipConflicts}.
 * Evidence is never fabricated and never deleted — derived detections
 * carry relationship provenance instead of evidence (see
 * {@link createDerivedDetection}).
 */

import type { Confidence, TechnologyVersion } from './value-objects.js';
import type { Technology } from './technology.js';
import type { Evidence } from './evidence.js';

/**
 * How a {@link Detection} entered the result set.
 *
 * - `'direct'` is reserved for a directly-observed technology (a detector
 *   produced evidence that was scored). In practice `source` is **absent**
 *   on direct detections — it is only ever set to `'relationship'` on a
 *   derived detection, so that "present and `'relationship'`" is the single
 *   unambiguous signal a detection is inferred.
 * - `'relationship'` means the detection was DERIVED from an `implies`
 *   edge in the catalog graph. It carries NO direct evidence and NO
 *   version — see {@link Detection.derivedFrom}.
 */
export type DetectionSource = 'direct' | 'relationship';

/**
 * Relationship provenance for a derived {@link Detection}.
 *
 * Records the single `implies` edge that produced this derivation
 * (the immediately-source technology that implies the derived one). For
 * transitive chains the `source` is the immediate predecessor in the
 * chain; the UI resolves the full chain by following each `derivedFrom`
 * source back through the result set.
 */
export interface RelationshipProvenance {
  /** The technology ID that implies this one. */
  readonly source: string;
  /** The display name of the source technology (for presentation). */
  readonly sourceName: string;
  /** The relationship edge type. Always `'implies'` for a derivation. */
  readonly type: 'implies';
}

/**
 * A relationship conflict surfaced (never acted upon) on a direct
 * {@link Detection}.
 *
 * - `requires` — a `requires` edge's target is **not directly observed**
 *   (a missing-requirement condition; this is a validation signal, not a
 *   derivation — the required technology is never auto-derived).
 * - `excludes` — an `excludes` edge's target **is** directly observed
 *   alongside the declaring technology (a directly-observed conflict;
 *   both detections are preserved with their evidence intact).
 */
export interface RelationshipConflict {
  /** The relationship edge type that produced the conflict. */
  readonly type: 'excludes' | 'requires';
  /** Identifier of the other technology involved in the conflict. */
  readonly other: string;
  /** Machine-readable reason for the conflict. */
  readonly reason: 'both_directly_observed' | 'missing_requirement';
}

/**
 * Label for *which observable source* a version was extracted from.
 *
 * Step 72 — Version Intelligence. This is the "source" dimension of a
 * {@link VersionObservation}: each evidence modality maps to a single
 * `VersionSource` so a resolved version can always be explained as
 * "came from a header / a meta tag / a script URL / …".
 *
 * The label is **derived from the evidence type that produced the
 * version** (see {@link evidenceTypeToVersionSource}), NOT declared per
 * catalog rule — this generalizes the Step-67 `VersionExtraction.source`
 * model without duplicating it (Step 72 §6: "generalize, don't duplicate").
 */
export type VersionSource =
  'header' | 'meta' | 'script_url' | 'resource_url' | 'resource_content' | 'content' | 'link';

/**
 * A single, explainable version observation: a version extracted from a
 * concrete piece of evidence, tagged with the source modality it came from.
 *
 * Step 72 §4 — a version is no longer a bare string detached from its
 * origin; it is always paired with the evidence that produced it and a
 * source label, so every resolved version is accountable.
 */
export interface VersionObservation {
  /** The extracted technology version. */
  readonly version: TechnologyVersion;
  /** Which evidence modality the version was read from. */
  readonly source: VersionSource;
  /** The evidence item whose matched value yielded this version. */
  readonly evidence: Evidence;
}

/**
 * A detection of a technology within a site snapshot.
 *
 * Invariants enforced by {@link createDetection}:
 * - `confidence` must be a valid {@link Confidence} (0–100)
 * - at least one {@link Evidence} item must support the detection
 * - `version`, when present, must be a valid {@link TechnologyVersion}
 *   extracted from one of the evidence items
 *
 * Relationship fields are **optional** and only populated by the
 * relationship-resolution layer:
 * - {@link Detection.source} / {@link Detection.derivedFrom} appear only
 *   on relationship-derived detections (never on a directly-observed one).
 * - {@link Detection.relationshipConflicts} appears only on a direct
 *   detection that participates in an `excludes`/`requires` conflict.
 *
 * Leaving these optional keeps every existing object literal, scorer
 * output, and test assertion valid: a detection with no `source` is, by
 * contract, a direct observation.
 */
export interface Detection {
  readonly technology: Technology;
  readonly confidence: Confidence;
  readonly evidence: ReadonlyArray<Evidence>;
  /**
   * Optional technology version, extracted deterministically from one of
   * the evidence items attached to this detection. `null` (or `undefined`)
   * means no version was extracted — never a fabricated/guessed value.
   * A relationship-derived detection NEVER carries a version (it has no
   * evidence to extract one from).
   */
  readonly version?: TechnologyVersion | null;
  /**
   * When `true`, multiple evidence sources extracted **disagreeing**
   * versions for this technology and the consensus layer refused to pick
   * one (Step 72 §11). The `version` is then `null` and **must not** be
   * displayed as any version — the UI surfaces "version conflict detected"
   * instead (Step 72 §20). Absent ⇔ no conflict was observed.
   */
  readonly versionConflict?: boolean;
  /**
   * The source modality the resolved `version` came from (Step 72 §4/§12).
   * Present only when `version` is non-null and the agreeing observations
   * share a single, unambiguous source; absent when there is no version,
   * when sources are mixed, or on a conflict. Derived from the evidence
   * type — never fabricated.
   */
  readonly versionSource?: VersionSource;
  /**
   * The evidence item(s) whose matched value yielded the resolved
   * `version` (Step 72 §4/§10). Present only when `version` is non-null
   * and explainable; absent when there is no version. On a
   * `versionConflict`, this carries the disagreeing observations' evidence
   * so the conflict is inspectable rather than silent.
   */
  readonly versionEvidence?: ReadonlyArray<Evidence>;
  /**
   * How this detection entered the result set. Absent ⇒ directly observed
   * (a detector produced the evidence). `'relationship'` ⇒ derived from an
   * `implies` edge; the detection then carries {@link Detection.derivedFrom}
   * provenance and NO evidence.
   */
  readonly source?: DetectionSource;
  /**
   * Provenance for a relationship-derived detection. Populated **only**
   * when `source === 'relationship'`. Never fabricated — each entry is an
   * actual `implies` edge from the catalog graph.
   */
  readonly derivedFrom?: ReadonlyArray<RelationshipProvenance>;
  /**
   * Relationship conflicts surfaced on a direct detection. `excludes`
   * (target also directly observed — both preserved, evidence intact) or
   * `requires` (target not directly observed — a missing-requirement
   * signal; the technology is NOT auto-derived). Absent ⇒ no conflict.
   */
  readonly relationshipConflicts?: ReadonlyArray<RelationshipConflict>;
}

/**
 * Optional Step-72 version-intelligence metadata attached to a
 * {@link Detection} by the consensus layer: an observable version conflict,
 * the source modality a resolved version came from, and the evidence that
 * yielded it. All fields are optional; when absent the detection behaves
 * exactly as before (Step 72 §4/§11/§13).
 */
export interface DetectionOptions {
  /** True when disagreeing version observations were merged (conflict). */
  readonly versionConflict?: boolean;
  /** Source modality the resolved version came from (when unambiguous). */
  readonly versionSource?: VersionSource;
  /** Evidence item(s) that produced the resolved version. */
  readonly versionEvidence?: readonly Evidence[];
}

/**
 * Creates a {@link Detection}.
 *
 * @throws {Error} if the evidence array is empty.
 *
 * The evidence array is copied so that external mutations cannot affect
 * the domain object. The optional `version` defaults to `null` (not
 * extracted); callers that extract a version pass it explicitly.
 *
 * The optional `options` carries Step-72 version metadata
 * (`versionConflict` / `versionSource` / `versionEvidence`). These are
 * omitted from the returned object when absent so that a plain detection
 * is byte-for-byte identical to the pre-Step-72 shape (existing object
 * literals and `toEqual` fixtures stay valid).
 *
 * The returned detection has **no** `source` — i.e. it is a direct
 * observation. Use {@link createDerivedDetection} for inferred detections.
 */
export function createDetection(
  technology: Technology,
  confidence: Confidence,
  evidence: Evidence[],
  version: TechnologyVersion | null = null,
  options?: DetectionOptions,
): Detection {
  if (evidence.length === 0) {
    throw new Error('Detection must have at least one evidence item');
  }
  if (version !== null && version !== undefined && typeof version !== 'string') {
    throw new Error('Detection version must be a TechnologyVersion or null');
  }
  return {
    technology,
    confidence,
    evidence: [...evidence],
    version: version ?? null,
    ...(options?.versionConflict ? { versionConflict: options.versionConflict } : {}),
    ...(options?.versionSource ? { versionSource: options.versionSource } : {}),
    ...(options?.versionEvidence && options.versionEvidence.length > 0
      ? { versionEvidence: [...options.versionEvidence] }
      : {}),
  };
}

/**
 * Creates a **relationship-derived** {@link Detection} — one inferred
 * from an `implies` edge rather than directly observed.
 *
 * A derived detection carries:
 * - `source: 'relationship'` (so it can NEVER be mistaken for a direct
 *   observation),
 * - the provenance edges that produced it (`derivedFrom`),
 * - **no** evidence (inference never fabricates `Evidence` records),
 * - **no** version (Phase 10: a derived detection never inherits a
 *   version — there is no evidence to extract one from),
 * - a confidence of `0` (it is ranked below every direct detection and
 *   never inflates another technology's score — Phase 11).
 */
export function createDerivedDetection(
  technology: Technology,
  derivedFrom: RelationshipProvenance[],
): Detection {
  return {
    technology,
    confidence: 0 as Confidence,
    evidence: [],
    version: null,
    source: 'relationship',
    derivedFrom: [...derivedFrom],
  };
}

/**
 * Creates a {@link RelationshipConflict} of the `excludes` kind, surfaced
 * when an `excludes` edge's target is also directly observed. Both
 * detections are preserved; this helper builds the structured conflict
 * record attached to the *declaring* technology.
 */
export function createExcludesConflict(other: string): RelationshipConflict {
  return { type: 'excludes', other, reason: 'both_directly_observed' };
}

/**
 * Creates a {@link RelationshipConflict} of the `requires` kind, surfaced
 * when a `requires` edge's target is **not** directly observed. This is a
 * validation / missing-requirement signal only — the required technology
 * is never auto-derived.
 */
export function createRequiresConflict(target: string): RelationshipConflict {
  return { type: 'requires', other: target, reason: 'missing_requirement' };
}
