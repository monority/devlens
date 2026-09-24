/**
 * Detection Result Integrity — a deterministic, structural validator for a
 * finalized {@link Detection} (Step 81).
 *
 * Step 81 builds on Steps 79 (scan-level result quality) and 80 (per-
 * detection provenance) to ensure the final detection result is
 * internally consistent. It is a **validator / derived diagnostic**, not
 * another detector, not another scorer, and not a deduplication pipeline.
 *
 * Architecture (Step 81 §3):
 *
 * ```text
 * final Detection[]
 *   → quality (Step 79)
 *   → provenance (Step 80)
 *   → Result Integrity (this module — Step 81)
 *   → API / diagnostics
 * ```
 *
 * What integrity inspects (Step 81 §1 / §2):
 * - **Detection identity** — the technology carries a real, non-empty identity
 *   (§5.1).
 * - **Evidence consistency** — when provenance is attached, `provenance.evidenceCount`
 *   equals the actual finalized evidence count (§5.2).
 * - **Evidence type consistency** — every type listed in `provenance.evidenceTypes`
 *   corresponds to an actual evidence object (§5.3).
 * - **Duplicate evidence** — exact-duplicate evidence items are *detected* for
 *   diagnostics using the canonical evidence identity, but never removed
 *   (§5.4).
 * - **Provenance consistency** — when provenance is attached, all provenance
 *   fields must be derivable from the same `detection.evidence` (§5.5).
 * - **Empty-evidence semantics** — empty evidence is valid for a
 *   relationship-derived detection but invalid for a directly-observed
 *   detection (§6).
 * - **Derived-detection distinction** — a derived detection (`source ===
 *   'relationship'`) must not carry provenance or direct evidence
 *   (§7).
 *
 * Non-goals (Step 81 §9):
 * - No `integrityScore`, `trustScore`, etc. — no new scoring system.
 * - No network, database, filesystem, browser, or detector execution.
 * - Never mutates the input detection.
 *
 * Properties (Step 81 §13):
 * - Pure (no React, HTTP, DB, browser)
 * - Synchronous / O(n) in the number of evidence items
 * - Deterministic (canonical issue ordering; independent of insertion order)
 * - Serializable (plain objects, no runtime classes, no circular refs)
 *
 * @see {@link computeDetectionProvenance} — the Step-80 provenance computation
 *       that this module reuses for the §5.5 consistency re-derivation.
 * @see {@link DetectionIntegrity} — the resulting structured diagnostic.
 */

import type { Detection } from './detection.js';
import type { Technology } from './technology.js';
import type { Evidence } from './evidence.js';
import type { DetectionProvenance, EvidenceType } from './detection-provenance.js';
import { computeDetectionProvenance } from './detection-provenance.js';

// ─── Issue model (§4) ────────────────────────────────────────────────

/**
 * The set of structural integrity issues a finalized detection can exhibit.
 *
 * These are *diagnostic* labels, not scores. Each corresponds to a
 * concrete invariant from the Step-81 specification:
 *
 * - `'INVALID_DETECTION_IDENTITY'` — the technology identity is missing or
 *   malformed (§5.1).
 * - `'INVALID_EVIDENCE_TYPE'` — a provenance-reported evidence type does not
 *   correspond to any actual evidence object (§5.3).
 * - `'DUPLICATE_EVIDENCE'` — two or more evidence items are canonical
 *   duplicates (§5.4).
 * - `'PROVENANCE_MISMATCH'` — an attached provenance field contradicts the
 *   detection's evidence, or provenance was attached to a derived detection
 *   that should not carry it (§5.2 / §5.5 / §7).
 * - `'EMPTY_EVIDENCE'` — a directly-observed detection has no evidence (§6).
 */
export type DetectionIntegrityIssue =
  | 'INVALID_DETECTION_IDENTITY'
  | 'INVALID_EVIDENCE_TYPE'
  | 'DUPLICATE_EVIDENCE'
  | 'PROVENANCE_MISMATCH'
  | 'EMPTY_EVIDENCE';

/**
 * Canonical, deterministic ordering for integrity issues (§12).
 *
 * The output `issues` array is always emitted in this order so that output
 * is independent of the order in which checks discover problems. The order
 * follows a logical grouping: identity first (the foundation), then
 * evidence-type correctness, then duplicates, then provenance derivation,
 * then the empty-evidence terminal condition.
 */
export const INTEGRITY_ISSUE_ORDER: readonly DetectionIntegrityIssue[] = [
  'INVALID_DETECTION_IDENTITY',
  'INVALID_EVIDENCE_TYPE',
  'DUPLICATE_EVIDENCE',
  'PROVENANCE_MISMATCH',
  'EMPTY_EVIDENCE',
];

/**
 * Structural integrity verdict for a single finalized detection.
 *
 * - `valid` is `true` when `issues` is empty.
 * - `issues` is always present (possibly empty) and is in canonical
 *   {@link INTEGRITY_ISSUE_ORDER}.
 */
export interface DetectionIntegrity {
  /** `true` when no structural issues were found (`issues.length === 0`). */
  readonly valid: boolean;
  /** Canonical, de-duplicated list of detected issues (see §12). */
  readonly issues: readonly DetectionIntegrityIssue[];
}

/**
 * The "valid" singleton — a detection with no structural issues.
 * Reused so callers can short-circuit on `=== VALID_INTEGRITY`.
 */
const VALID_INTEGRITY: DetectionIntegrity = {
  valid: true,
  issues: [],
};

// ─── Canonical evidence identity (§5.4) ──────────────────────────────

/**
 * Produces a canonical, deterministic identity key for an evidence item.
 *
 * This mirrors the canonical evidence identity used elsewhere in the
 * project (`getEvidenceKey` in `@devlens/detectors` and the web-layer
 * mirror `getEvidenceIdentity` in `lib/evidence-identity.ts`). It is
 * defined **locally** in core so that the integrity layer — which lives in
 * the domain layer and cannot depend on `@devlens/detectors` (detectors
 * depends on core — §9.5) — can still reuse the *same canonical semantics*.
 *
 * Two evidence items are canonical duplicates if and only if they produce
 * the same key. URLs are normalized to lowercase for comparison. The `type`
 * discriminant is case-sensitive.
 *
 * This is an identity function for *diagnostic duplicate detection* only
 * (§5.4) — it is NOT a deduplication implementation. The integrity layer
 * only *reports* duplicates; it never removes them.
 *
 * @param evidence — the evidence item to canonicalize
 * @returns a stable string key in the format `type|field1|field2|...`
 */
function evidenceIdentity(evidence: Evidence): string {
  switch (evidence.type) {
    case 'http_header':
      return `http_header|${evidence.name}|${evidence.value}`;
    case 'meta_tag':
      return `meta_tag|${evidence.name}|${evidence.content}`;
    case 'script_url':
      return `script_url|${normalizeUrl(evidence.url)}`;
    case 'script_content':
      return `script_content|${evidence.snippet}`;
    case 'javascript_global':
      return `javascript_global|${evidence.globalName}`;
    case 'resource':
      return `resource|${normalizeUrl(evidence.url)}`;
    case 'link':
      return `link|${normalizeUrl(evidence.url)}`;
    case 'resource_content':
      return `resource_content|${normalizeUrl(evidence.url)}|${evidence.resourceType}|${evidence.match}`;
    case 'html':
      return `html|${evidence.selector}|${evidence.snippet}`;
  }
}

/** Normalizes a `Url` (branded string) to lowercase for comparison. */
function normalizeUrl(url: string): string {
  return String(url).toLowerCase();
}

// ─── Internal helpers ────────────────────────────────────────────────

/**
 * Returns the set of distinct evidence types present on a detection's
 * evidence.
 */
function evidenceTypeSet(evidence: readonly Evidence[]): Set<EvidenceType> {
  const set = new Set<EvidenceType>();
  for (const e of evidence) {
    set.add(e.type);
  }
  return set;
}

/**
 * Element-wise equality for two readonly arrays of the same length.
 * Used to compare canonical-order evidence-type arrays (§5.5).
 */
function arraysEqual(a: readonly unknown[], b: readonly unknown[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/**
 * @internal
 * Validates a technology identity for structural soundness (§5.1).
 *
 * The `Detection` type guarantees `technology` at compile time, but a
 * serialization boundary (DB rows, hand-crafted data) can violate it.
 * This defensive runtime check verifies the identity is a non-empty
 * string — mirroring the `createTechnologyId` invariant.
 */
function hasValidTechnologyIdentity(technology: Technology): boolean {
  return (
    technology !== null &&
    typeof technology === 'object' &&
    typeof technology.id === 'string' &&
    technology.id.trim() !== ''
  );
}

/**
 * Sorts a set of issue labels into the canonical {@link INTEGRITY_ISSUE_ORDER}.
 * Each issue appears at most once (Set semantics). Unknown issues (from a
 * future-extended type) are appended in stable, sorted order.
 */
function toCanonicalIssues(
  issues: Set<DetectionIntegrityIssue>,
): readonly DetectionIntegrityIssue[] {
  const detected = new Set(issues);
  const ordered: DetectionIntegrityIssue[] = [];
  for (const issue of INTEGRITY_ISSUE_ORDER) {
    if (detected.has(issue)) {
      detected.delete(issue);
      ordered.push(issue);
    }
  }
  // Defensive: include any issue not in the canonical table (future extension).
  if (detected.size > 0) {
    ordered.push(...[...detected].sort());
  }
  return ordered;
}

// ─── Pure integrity function ─────────────────────────────────────────

/**
 * Computes a deterministic {@link DetectionIntegrity} verdict for a
 * finalized detection.
 *
 * This is a **pure read** over the detection's evidence, technology
 * identity, and `source` field. When a `provenance` is provided (as
 * computed by Step 80's `computeDetectionProvenance`), the provenance's
 * own fields are cross-checked against the evidence (§5.2 / §5.3 / §5.5).
 *
 * The function:
 * - **never** mutates the input detection or provenance
 * - **never** removes or reorders evidence
 * - **never** performs IO, network, DB, or browser work
 * - runs in O(n) over the evidence items
 *
 * @param detection  A finalized, post-dedup, post-score domain detection.
 * @param provenance The provenance attached to this detection (Step 80),
 *                   if any. When omitted, provenance-related checks are
 *                   skipped — only identity, duplicate, and empty-evidence
 *                   checks run.
 * @returns A deterministic structural-integrity verdict.
 *
 * @see {@link computeDetectionProvenance} — the provenance computation
 *       whose output this validator cross-checks (§5.5).
 */
export function computeDetectionIntegrity(
  detection: Detection,
  provenance?: DetectionProvenance,
): DetectionIntegrity {
  const issues = new Set<DetectionIntegrityIssue>();
  const evidence = detection.evidence;
  const isDerived = detection.source === 'relationship';

  // ── §5.1 Detection identity ─────────────────────────────────────────
  if (!hasValidTechnologyIdentity(detection.technology)) {
    issues.add('INVALID_DETECTION_IDENTITY');
  }

  // ── §6 Empty-evidence semantics ─────────────────────────────────────
  // A directly-observed detection (source absent / 'direct') MUST carry
  // evidence. createDetection() enforces this at construction time, but the
  // integrity layer also guards against manually-constructed or deserialized
  // objects that bypass the factory. A relationship-derived detection
  // (`source === 'relationship'`) legitimately has no evidence (§6, §7) —
  // that is valid, not an issue.
  if (evidence.length === 0 && !isDerived) {
    issues.add('EMPTY_EVIDENCE');
  }

  // ── §5.4 Duplicate evidence ─────────────────────────────────────────
  // Uses the canonical evidence identity (mirroring getEvidenceKey in
  // detectors / getEvidenceIdentity in web). Only flags duplicates; does
  // NOT remove them — the detection is returned unchanged.
  if (evidence.length > 1) {
    const seen = new Set<string>();
    for (const item of evidence) {
      const key = evidenceIdentity(item);
      if (seen.has(key)) {
        issues.add('DUPLICATE_EVIDENCE');
        break;
      }
      seen.add(key);
    }
  }

  // ── §5.2 / §5.3 / §5.5 Provenance consistency ───────────────────────
  // Only when provenance is attached. All provenance fields must be
  // derivable from the same `detection.evidence`.
  if (provenance !== undefined) {
    if (isDerived) {
      // §7: a relationship-derived detection must not carry provenance.
      // If it does, the provenance is a mismatch regardless of its contents.
      issues.add('PROVENANCE_MISMATCH');
    } else {
      const expected = computeDetectionProvenance(detection);

      // §5.2: evidence count must match the actual finalized evidence length.
      if (provenance.evidenceCount !== evidence.length) {
        issues.add('PROVENANCE_MISMATCH');
      }

      // §5.3: every type in provenance.evidenceTypes must correspond to an
      // actual evidence object's type — no fabricated, stale, or
      // deduplicated-away types.
      const actualTypes = evidenceTypeSet(evidence);
      for (const t of provenance.evidenceTypes) {
        if (!actualTypes.has(t)) {
          issues.add('INVALID_EVIDENCE_TYPE');
          break;
        }
      }

      // §5.5: all provenance fields must be derivable from the same
      // `detection.evidence`. Re-derive the expected provenance and compare
      // each field. The provenance re-use is the single source of truth
      // (§5.5: "Import and reuse the existing provenance computation").
      if (!arraysEqual(provenance.evidenceTypes, expected.evidenceTypes)) {
        issues.add('PROVENANCE_MISMATCH');
      }
      if ((provenance.strongestEvidenceType ?? null) !== (expected.strongestEvidenceType ?? null)) {
        issues.add('PROVENANCE_MISMATCH');
      }
    }
  }

  // §12: canonical ordering of issues.
  const ordered = toCanonicalIssues(issues);

  return ordered.length > 0 ? { valid: false, issues: ordered } : VALID_INTEGRITY;
}
