/**
 * Detection signal quality / corroboration (Step 76).
 *
 * A descriptive, non-probabilistic summary of *how well* a detection is
 * corroborated by **independent observable evidence sources** — without ever
 * touching `confidence` (a pre-existing ranking score) or recalculating it.
 *
 * This module is:
 *   - PURE            — no IO, no network, no DB/cache, no catalogue traversal
 *   - SERIALIZABLE    — `SignalQuality` is a plain, deterministic object
 *   - ORDER-INDEPENDENT — evidence order never changes the result (§7)
 *   - O(n evidences)  — §15
 *
 * It intentionally does NOT depend on `@devlens/detectors` (no cross-package
 * coupling): it reuses the web canonical `getEvidenceIdentity` (mirror of the
 * detector's `getEvidenceKey`) solely for deduplication (§6.B/§6.C).
 */

import type {
  EvidenceResponse,
  DetectionResponse,
  SignalQuality,
  SignalQualityLevel,
  SourceFamily,
} from './types.js';
import { deduplicateEvidence } from './evidence-identity';

/**
 * Maps an evidence `type` to its observable **source family** (Step 76 §3).
 *
 * Several evidence types collapse onto the same source family: `script_content`,
 * `html` and `javascript_global` are all *content-channel* observations, so two
 * inline-script matches count as ONE source family (§6.D). `resource_content`
 * is its own family, distinct from `resource_url` (§6.E).
 */
export function evidenceSourceFamily(type: EvidenceResponse['type']): SourceFamily {
  switch (type) {
    case 'http_header':
      return 'header';
    case 'meta_tag':
      return 'meta';
    case 'script_url':
      return 'script_url';
    case 'resource':
      return 'resource_url';
    case 'resource_content':
      return 'resource_content';
    case 'link':
      return 'link';
    case 'script_content':
    case 'html':
    case 'javascript_global':
      return 'content';
  }
}

/**
 * Quality level for a single detection's evidence (Step 76 §5).
 *
 * The thresholds are intentionally small and documented — fixed against the
 * observable source families, NOT borrowed blindly from any example:
 *   - `no_evidence`    — no direct evidence (e.g. a derived detection).
 *   - `single_signal`  — exactly ONE observable source family.
 *   - `corroborated`   — TWO independent source families.
 *   - `strong`         — THREE or more independent source families.
 */
export const LEVEL_ORDER: SignalQualityLevel[] = [
  'no_evidence',
  'single_signal',
  'corroborated',
  'strong',
];

/**
 * Pure, deterministic computation of a detection's signal quality (Step 76 §4).
 *
 * Rules honored:
 *  - §6.B version evidence is never counted (this consumes `evidence` only,
 *    never `versionEvidence`).
 *  - §6.C identical evidence (same canonical `getEvidenceKey`) is counted once.
 *  - §6.D multiple matches within one source family → ONE source.
 *  - §6.E `resource_content` is distinct from `resource_url`.
 *  - §6.F `versionConflict` is ignored: presence quality is never degraded by
 *    a version disagreement.
 *  - §6.A derived provenance is ignored: quality is attached to the detection's
 *    OWN evidence only (a `implies`-derived tech never borrows its source's
 *    strength).
 */
export function computeSignalQuality(evidence: readonly EvidenceResponse[]): SignalQuality {
  // §6.C: deduplicate by canonical identity before counting.
  const unique = deduplicateEvidence(evidence);
  const evidenceCount = unique.length;

  if (evidenceCount === 0) {
    return {
      level: 'no_evidence',
      evidenceCount: 0,
      sourceCount: 0,
      sources: [],
      corroborated: false,
    };
  }

  // §6.D/§3: group by source family, then count distinct families.
  const families = Array.from(new Set(unique.map((e) => evidenceSourceFamily(e.type)))).sort();
  const sourceCount = families.length;
  const level: SignalQualityLevel =
    sourceCount === 1 ? 'single_signal' : sourceCount === 2 ? 'corroborated' : 'strong';

  return {
    level,
    evidenceCount,
    sourceCount,
    sources: families,
    corroborated: sourceCount >= 2,
  };
}

/**
 * Human-readable, compact signal-quality line for `DetectionItem` (Step 76 §10).
 *
 * Deterministic & locale-free. A derived detection with no direct evidence is
 * rendered honestly as `Derived · no direct evidence` — never as a signal the
 * detection does not possess (§11).
 */
export function signalQualityLabel(detection: DetectionResponse, sq: SignalQuality): string {
  const isDerived = detection.source === 'relationship';

  if (sq.level === 'no_evidence') {
    return isDerived ? 'Derived · no direct evidence' : 'No evidence';
  }

  const levelLabel: Record<Exclude<SignalQualityLevel, 'no_evidence'>, string> = {
    single_signal: 'Single signal',
    corroborated: 'Multi-source',
    strong: 'Strong',
  };

  const noun = `${sq.sourceCount} source${sq.sourceCount === 1 ? '' : 's'}`;
  return `${levelLabel[sq.level]} · ${noun}`;
}
