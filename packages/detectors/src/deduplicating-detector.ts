/**
 * Deduplicating detector — wraps another `Detector` and merges duplicate
 * technology detections.
 *
 * When multiple sub-detectors (e.g. `HeaderDetector`, `MetaTagDetector`,
 * `ScriptUrlDetector`, `ContentScriptDetector`) all detect the same
 * technology, the wrapped `CompositeDetector` produces multiple `Detection`
 * objects for that technology — each with a different evidence source.
 * `DeduplicatingDetector` consolidates these into a single `Detection` per
 * technology:
 *
 * - **Representative**: the detection with the **highest confidence** wins.
 *   On confidence ties, the **first** detection returned by the wrapped
 *   detector is used (deterministic, no invented ranking).
 * - **Evidence merge**: evidence from **all** duplicate detections is
 *   preserved in the merged result. Exact-duplicate evidence items
 *   (structurally identical) are removed.
 * - **No confidence aggregation**: the resulting confidence is simply the
 *   representative's value — NOT a sum or average.
 *
 * This is a **deduplication** layer, not a scoring system. It is intentionally
 * simple and deterministic.
 *
 * @see {@link Detector}
 * @see {@link CompositeDetector}
 */

import type { Detection, SiteSnapshot, Evidence, TechnologyVersion } from '@devlens/core';
import { createDetection } from '@devlens/core';
import type { Detector } from './detector.js';
import { getEvidenceKey } from './evidence-key.js';

/**
 * A {@link Detector} decorator that deduplicates technology detections
 * produced by an inner `Detector`.
 *
 * The wrapper delegates `detect()` to the inner detector, then groups
 * the results by `technology.id`. For each group it selects the
 * highest-confidence detection as the representative and merges evidence
 * from all detections in the group (removing exact duplicates).
 *
 * @example
 * ```typescript
 * const detector = new DeduplicatingDetector(
 *   new CompositeDetector([new HeaderDetector(), new MetaTagDetector()]),
 * );
 * const detections = detector.detect(snapshot);
 * // → one Detection per technology (no duplicates)
 * ```
 */
export class DeduplicatingDetector implements Detector {
  /** The inner detector whose results are deduplicated. */
  readonly #inner: Detector;

  /**
   * @param inner — the detector to wrap (typically a `CompositeDetector`)
   */
  constructor(inner: Detector) {
    this.#inner = inner;
  }

  /**
   * Delegates detection to the inner detector, then deduplicates the
   * results by technology ID.
   *
   * @param snapshot — the site snapshot to inspect
   * @returns a deduplicated array of detections (one per technology)
   * @throws {Error} if the inner detector throws (errors propagate
   *   unchanged, matching the `runScan` convention)
   */
  detect(snapshot: SiteSnapshot): Detection[] {
    const detections = this.#inner.detect(snapshot);
    return this.deduplicate(detections);
  }

  /**
   * Groups detections by `technology.id`, selects the highest-confidence
   * representative for each technology, and merges evidence from all
   * duplicates.
   *
   * Ordering: the output preserves the order of first appearance of each
   * technology in the input array.
   *
   * Deduplication key for evidence: a structural JSON serialization of
   * each evidence object. No external deep-equality library is used.
   */
  private deduplicate(detections: Detection[]): Detection[] {
    // Group by technology.id, preserving first-appearance order.
    const groups = new Map<string, Detection[]>();
    const order: string[] = [];

    for (const detection of detections) {
      const key = String(detection.technology.id);
      if (!groups.has(key)) {
        groups.set(key, []);
        order.push(key);
      }
      groups.get(key)!.push(detection);
    }

    const result: Detection[] = [];

    for (const key of order) {
      const group = groups.get(key)!;
      const representative = this.selectRepresentative(group);
      const mergedEvidence = this.mergeEvidence(group);
      const version = this.selectVersion(group);

      result.push(
        createDetection(
          representative.technology,
          representative.confidence,
          mergedEvidence,
          version,
        ),
      );
    }

    return result;
  }

  /**
   * Selects the representative detection from a group of detections
   * for the same technology.
   *
   * The detection with the highest confidence is selected. On ties,
   * the first detection in the group (i.e., the first one returned by
   * the wrapped detector) wins.
   */
  private selectRepresentative(group: Detection[]): Detection {
    let best = group[0]!;

    for (let i = 1; i < group.length; i++) {
      const current = group[i]!;
      if (Number(current.confidence) > Number(best.confidence)) {
        best = current;
      }
    }

    return best;
  }

  /**
   * Selects the technology version for a deduplicated detection, if any,
   * applying the version-consistency rules:
   *
   * - The `version` is read **only** from detections in the group that
   *   carry a non-null version (i.e. a tech-specific signature actually
   *   extracted one from its evidence).
   * - `null`/undefined versions are ignored — they mean "no version
   *   extracted," not "this technology is at an unknown version."
   * - If every versioned detection agrees on the same version string,
   *   that version is kept.
   * - If two versioned detections carry **different** version strings
   *   (a conflict), the result is conservatively `null` — we do not
   *   guess which is authoritative.
   * - If no detection in the group has a version, the result is `null`.
   *
   * This is a **consensus over the existing dedup group** — it introduces
   * no new precedence ordering and never invents a version. It ensures a
   * version extracted by any evidence source for a technology survives
   * deduplication as long as all extractable versions agree.
   */
  private selectVersion(group: Detection[]): TechnologyVersion | null {
    const distinct = new Set<string>();
    for (const detection of group) {
      if (detection.version) {
        distinct.add(String(detection.version));
      }
    }
    if (distinct.size === 1) {
      return Array.from(distinct)[0] as TechnologyVersion;
    }
    return null;
  }

  /**
   * Merges evidence from all detections in a group, removing duplicates
   * via canonical keys and sorting the result deterministically.
   *
   * Deduplication uses {@link getEvidenceKey} — a type-aware canonical
   * key that is stable regardless of object property order (unlike the
   * previous `JSON.stringify` approach).
   *
   * After deduplication, evidence is sorted by canonical key so that
   * `[A, B]` and `[B, A]` produce the same canonical output (Section 5
   * of the explainability spec). This makes the evidence order
   * deterministic across pipeline runs and explainable to users
   * (evidence always appears in a predictable, sorted order).
   */
  private mergeEvidence(group: Detection[]): Evidence[] {
    const seen = new Set<string>();
    const merged: Evidence[] = [];

    for (const detection of group) {
      for (const evidence of detection.evidence) {
        const key = getEvidenceKey(evidence);
        if (!seen.has(key)) {
          seen.add(key);
          merged.push(evidence);
        }
      }
    }

    // Sort by canonical key for deterministic, explainable evidence order.
    // This ensures that evidence from different detector orderings (e.g.
    // if CompositeDetector reorders sub-detectors) produces the same
    // canonical result.
    merged.sort((a, b) => {
      const keyA = getEvidenceKey(a);
      const keyB = getEvidenceKey(b);
      return keyA < keyB ? -1 : keyA > keyB ? 1 : 0;
    });

    return merged;
  }
}
