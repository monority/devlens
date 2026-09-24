/**
 * Detection provenance — a deterministic, derived explanation of *why* a
 * detection exists and *what* evidence supports it (Step 80).
 *
 * Step 80 introduces "provenance" as the third pipeline projection (after
 * deduplication and quality/scoring): it is a **pure, deterministic
 * projection of an existing `Detection`**, never a new detection, never a
 * new scorer, and never fabricated data:
 *
 * ```text
 * raw detections
 *   → deduplication        (DeduplicatingDetector)
 *   → quality / scoring    (ConfidenceScorer — Step 79)
 *   → provenance           (this module — Step 80)
 *   → ScanResult
 * ```
 *
 * What provenance exposes (Step 80 §3):
 * - `evidenceCount`            — distinct evidence items supporting the
 *                                detection (post-dedup, §5).
 * - `evidenceTypes`            — the distinct evidence *modalities* that
 *                                support it, in a canonical (§6) order.
 * - `strongestEvidenceType`    — the modality considered strongest (§7).
 *
 * Why these are safe to derive from the existing `Detection`:
 * - §9/§12: the detection's `evidence` is **already deduplicated and sorted**
 *   by the upstream `DeduplicatingDetector`. Provenance reads that array
 *   directly — it does **not** re-implement deduplication (§9 explicitly
 *   forbids introducing a third dedup implementation; the canonical key lives
 *   in `@devlens/detectors`' `evidence-key.ts` and the web-layer mirror in
 *   `lib/evidence-identity.ts`).
 * - §7: Step 79's scorer exposes a single per-detection `confidence`
 *   (base + diversity bonus) and does **not** attach per-evidence confidence.
 *   §7's primary rule — "the evidence type whose signature confidence equals
 *   the base" — therefore cannot be applied without modifying the scorer
 *   (which §7 forbids). Per §7's explicit fallback ("restez plus simple :
 *   strongestEvidenceType peut être dérivé de l'evidence associé au score
 *   représentant déjà la détection") the strongest type is selected
 *   deterministically from the detection's existing evidence.
 *
 * Properties (Step 80 §13):
 * - Pure (no React, HTTP, DB, browser)
 * - Synchronous / O(n)
 * - Deterministic (canonical ordering; independent of detector/Promise order)
 * - Serializable (plain objects, no runtime classes, no circular refs)
 */

import type { Detection } from './detection.js';
import type { Evidence } from './evidence.js';

/**
 * The discriminant of an {@link Evidence} item — i.e. *which observable
 * modality* a fact was found in.
 *
 * This is `Evidence['type']` (Step 80 §4: do NOT create a parallel enum —
 * the `Evidence` discriminated union is the single source of truth for
 * evidence-type identity).
 */
export type EvidenceType = Evidence['type'];

/**
 * Canonical, deterministic precedence order for evidence types (Step 80 §6).
 *
 * This is a stable sort key only — it is **not** a per-type confidence,
 * nor a "reliability ranking" invented for Step 80. It is used to:
 *   (a) order the `evidenceTypes` array so the result is independent of
 *       detector execution order, Promise settlement order, or insertion
 *       order (§6 / §8); and
 *   (b) break ties deterministically for `strongestEvidenceType` when the
 *       §7 fallback cannot attribute the base confidence to a single type.
 *
 * The first five entries mirror the order given as an example in the Step-80
 * spec (`header, meta_tag, script_url, script_content, resource`); the
 * remaining types are appended in a stable, documented position (grouped
 * with their sibling observation surface where that exists). No type that
 * does not already exist in the domain `Evidence` union is introduced.
 */
export const DETECTION_PROVENANCE_TYPE_ORDER: readonly EvidenceType[] = [
  'http_header', // header — example §6 lead
  'meta_tag', // meta tag
  'script_url', // external <script src>
  'script_content', // inline <script> body
  'resource', // fetched resource URL
  'resource_content', // fetched resource body (Step 71 sibling of `resource`)
  'link', // <link href>
  'html', // raw HTML structure
  'javascript_global', // JS global
];

/** Ordinal position of an evidence type in the canonical order — its sort key. */
function typePrecedence(type: EvidenceType): number {
  const idx = DETECTION_PROVENANCE_TYPE_ORDER.indexOf(type);
  // An unknown (future) type sorts last, preserving determinism.
  return idx === -1 ? DETECTION_PROVENANCE_TYPE_ORDER.length : idx;
}

/**
 * Deterministic provenance for a single {@link Detection} (Step 80 §3).
 *
 * Every field is *derived* from the detection's existing `evidence` and
 * `confidence` — provenance is a projection, not a new source of truth
 * (§2/§12): it is never persisted (§12) and never fabricated (§7/§10).
 */
export interface DetectionProvenance {
  /**
   * Number of distinct evidence items supporting the detection, counted
   * **after** the pipeline's deduplication (Step 80 §5).
   *
   * This reads the detection's `evidence` array directly because the
   * upstream `DeduplicatingDetector` is the single owner of deduplication
   * (§9 — no second/third dedup implementation is introduced here).
   * For a relationship-derived detection (no evidence) this is `0`.
   */
  readonly evidenceCount: number;
  /**
   * Distinct evidence modalities (`Evidence['type']`) supporting the
   * detection, sorted by {@link DETECTION_PROVENANCE_TYPE_ORDER} (Step 80 §6).
   *
   * The order is canonical and stable — it never depends on detector order,
   * Promise order, or insertion order (§6/§8). Empty for a detection with no
   * direct evidence (e.g. a relationship-derived detection).
   */
  readonly evidenceTypes: readonly EvidenceType[];
  /**
   * The evidence modality considered the strongest (Step 80 §7).
   *
   * Step 79's scorer does not expose per-evidence confidence, so §7's primary
   * rule cannot be applied without modifying the scorer (forbidden by §7).
   * This value uses §7's explicit "restez plus simple" fallback: it is
   * derived from the detection's existing evidence — the single type when
   * only one is present, otherwise the highest-precedence type present
   * ({@link DETECTION_PROVENANCE_TYPE_ORDER}). It never invents a confidence.
   *
   * Absent when the detection carries no direct evidence (e.g. a
   * relationship-derived detection), so a direct detection always carries a
   * value.
   */
  readonly strongestEvidenceType?: EvidenceType;
}

/**
 * Computes a deterministic {@link DetectionProvenance} for a detection.
 *
 * This is a pure read over the detection's already-deduplicated `evidence`
 * (produced by `DeduplicatingDetector`) and its `confidence` (produced by
 * `ConfidenceScorer`). It performs **no** deduplication itself (§9) — the
 * input is expected to be post-dedup, so `evidenceCount` equals the number of
 * evidence items the detection actually retains.
 *
 * @param detection A (post-dedup, post-score) domain detection.
 * @returns A deterministic, serializable provenance summary.
 *
 * @see {@link computeDetectionProvenance.determinism} — same input ⇒ same output.
 * @see {@link EvidenceType} — the evidence-type discriminant (single source of truth).
 */
export function computeDetectionProvenance(detection: Detection): DetectionProvenance {
  const evidence = detection.evidence;
  const evidenceCount = evidence.length;

  // §6: distinct types, sorted by canonical precedence. `Set` preserves
  // first-seen order for ties; the subsequent sort makes the result fully
  // order-independent. The comparator is total and deterministic.
  const types = Array.from(new Set(evidence.map((e) => e.type))).sort((a, b) => {
    const pa = typePrecedence(a);
    const pb = typePrecedence(b);
    return pa === pb ? 0 : pa < pb ? -1 : 1;
  });

  // §7 (fallback): strongest = single type when unambiguous, else the
  // highest-precedence type present. Absent when there is no evidence.
  const strongestEvidenceType = types.length > 0 ? (types[0] as EvidenceType) : undefined;

  return {
    evidenceCount,
    evidenceTypes: types,
    ...(strongestEvidenceType !== undefined ? { strongestEvidenceType } : {}),
  };
}
