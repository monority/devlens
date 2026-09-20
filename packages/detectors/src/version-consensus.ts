/**
 * Step 72 — Version Intelligence: consensus + provenance.
 *
 * The Step-67 model extracts at most one version per *signature* (from
 * that signature's matched value). After `DeduplicatingDetector` merges
 * duplicate detections for a technology, several of those per-signature
 * versions may coexist. This module turns them into a single, explainable
 * result:
 *
 *   version observations  ─────────────────►  { version, conflict, source, evidence }
 *   (one per detection)        resolveVersionConsensus
 *
 * Policy (Step 72 §10 / §12) — deterministic and observable, never
 * statistical:
 *   1. same version observed ≥ 2 times  →  that version (consensus)
 *   2. a single observation             →  that version (single strong signal)
 *   3. disagreeing versions             →  conflict (version = null, conflict = true)
 *   4. no versioned observation         →  no version (null, no conflict)
 *
 * A version is NEVER guessed. On conflict the disagreeing evidence is
 * preserved on `evidence` so the conflict is inspectable (Step 72 §11).
 *
 * All helpers are **pure** (no I/O), **deterministic** (output is sorted /
 * set-keyed, independent of input order — Step 72 §12/§13), and the result
 * is wired into `Detection` by `DeduplicatingDetector.selectVersion`.
 */

import type {
  Detection,
  Evidence,
  TechnologyVersion,
  VersionObservation,
  VersionSource,
} from '@devlens/core';
import { getEvidenceKey } from './evidence-key.js';

/**
 * Stable mapping from an `Evidence['type']` to the `VersionSource`
 * modality it represents. Single source of truth for §4 provenance.
 */
const EVIDENCE_TYPE_TO_VERSION_SOURCE: Readonly<Record<Evidence['type'], VersionSource>> = {
  http_header: 'header',
  meta_tag: 'meta',
  script_url: 'script_url',
  script_content: 'content',
  resource: 'resource_url',
  resource_content: 'resource_content',
  link: 'link',
  html: 'content',
  javascript_global: 'content',
};

/**
 * Derives the `VersionSource` modality for a piece of evidence
 * (Step 72 §4/§12). Pure and total: every `Evidence` discriminant maps to
 * exactly one source.
 */
export function evidenceTypeToVersionSource(evidence: Evidence): VersionSource {
  return EVIDENCE_TYPE_TO_VERSION_SOURCE[evidence.type];
}

/**
 * Collects one {@link VersionObservation} per detection in the group that
 * carries a resolved version, pairing the version with the primary evidence
 * item that produced it and its source modality.
 *
 * Each deduplicated detection originates from a single sub-detector (header,
 * meta, script-URL, …), so its leading evidence item is the one whose matched
 * observable yielded the version. This keeps provenance exact for the common
 * single-evidence case and best-effort otherwise (the full merged evidence
 * remains on the `Detection` for full explainability).
 */
export function collectVersionObservations(detections: readonly Detection[]): VersionObservation[] {
  const observations: VersionObservation[] = [];
  for (const detection of detections) {
    if (!detection.version) {
      continue;
    }
    const evidence = detection.evidence[0];
    if (evidence === undefined) {
      // A versioned direct detection always has ≥1 evidence item by invariant;
      // this guard is purely defensive.
      continue;
    }
    observations.push({
      version: detection.version,
      source: evidenceTypeToVersionSource(evidence),
      evidence,
    });
  }
  return observations;
}

/** The output of {@link resolveVersionConsensus}. */
export interface VersionConsensusResult {
  /** The resolved version, or `null` when there is none / a conflict. */
  readonly version: TechnologyVersion | null;
  /** `true` when observations disagreed (versions differ). */
  readonly conflict: boolean;
  /** Source modality of the resolved version (undefined when ambiguous/absent). */
  readonly source?: VersionSource;
  /** Evidence backing the result (explainable), sorted deterministically. */
  readonly evidence: readonly Evidence[];
}

/**
 * Resolves a set of version observations into a single result.
 *
 * Deterministic regardless of input order: versions are grouped in a
 * string-keyed `Map` (insertion order = first-appearance, but the *set* of
 * distinct versions is order-independent), and the resulting evidence is
 * de-duplicated by {@link getEvidenceKey} and sorted.
 */
export function resolveVersionConsensus(
  observations: readonly VersionObservation[],
): VersionConsensusResult {
  if (observations.length === 0) {
    return { version: null, conflict: false, evidence: [] };
  }

  const byVersion = new Map<string, VersionObservation[]>();
  const firstSeen: string[] = [];
  for (const obs of observations) {
    const key = String(obs.version);
    const bucket = byVersion.get(key);
    if (bucket === undefined) {
      byVersion.set(key, [obs]);
      firstSeen.push(key);
    } else {
      bucket.push(obs);
    }
  }

  if (byVersion.size === 1) {
    // One distinct version across all observations → consensus (or a single
    // strong signal). The resolved evidence is every observation that
    // produced this version, deduped + sorted for determinism.
    const key = firstSeen[0]!;
    const agreeing = byVersion.get(key)!;
    const sources = new Set(agreeing.map((o) => o.source));
    return {
      version: key as TechnologyVersion,
      conflict: false,
      // `source` is only emitted when the agreeing observations share a
      // single, unambiguous modality — omitted otherwise (§4/§12). Using a
      // conditional spread (rather than `source: undefined`) is required
      // under `exactOptionalPropertyTypes`.
      ...(sources.size === 1 ? { source: agreeing[0]!.source as VersionSource } : {}),
      evidence: sortEvidence(Array.from(new Set(agreeing.map((o) => o.evidence)))),
    };
  }

  // Two or more distinct versions → conflict. Do NOT pick one (Step 72 §11).
  return {
    version: null,
    conflict: true,
    evidence: sortEvidence(Array.from(new Set(observations.map((o) => o.evidence)))),
  };
}

/** De-duplicates by canonical evidence key and sorts for deterministic output. */
function sortEvidence(evidence: Evidence[]): Evidence[] {
  const seen = new Set<string>();
  const distinct: Evidence[] = [];
  for (const e of evidence) {
    const k = getEvidenceKey(e);
    if (!seen.has(k)) {
      seen.add(k);
      distinct.push(e);
    }
  }
  return distinct.sort((a, b) => {
    const ka = getEvidenceKey(a);
    const kb = getEvidenceKey(b);
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });
}
