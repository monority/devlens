/**
 * Detection explainability — pure, in-memory derivation of a structured
 * explanation for a technology detection, including per-evidence reasons,
 * relationship provenance, version/conflict detail, and a normalized
 * evidence graph.
 *
 * This module is the central point for explainability (Step 73 §7). It
 * turns the existing detection data (technology, confidence, evidence,
 * version, source, derivedFrom, relationshipConflicts) into a richer
 * presentation model that explains — using ONLY data already present — why
 * a detection is considered present and under what version/provenance.
 *
 * It does NOT:
 *   - recalculate scores or confidence
 *   - invent evidence that does not exist
 *   - fabricate detector names, paths, or reasons
 *   - introduce a second confidence/scoring algorithm
 *   - define a local evidence identity algorithm (uses canonical
 *     `getEvidenceIdentity` from `lib/evidence-identity.ts`)
 *   - depend on the detectors package (no cross-package coupling)
 *
 * All derived strings are deterministic: no locale-dependent formatting,
 * no random values, no object-key insertion-order reliance. Every
 * collection is sorted by an explicit, stable key before rendering.
 */

import type {
  DetectionResponse,
  EvidenceResponse,
  EvidenceSource,
  EvidenceReason,
  RelationshipReason,
  ExplanationReason,
  VersionExplanation,
  VersionConflictDetail,
  ExplanationNode,
  ExplanationEdge,
  ExplanationGraph,
  DetectionExplainability,
  DetectionKind,
} from './types.js';
import { evidenceTypeLabel, evidenceFields } from '../lib/evidence-presenter';
import { getDetectionExplanation } from '../lib/detection-explanation';
import { getEvidenceIdentity, deduplicateEvidence } from '../lib/evidence-identity';

// Re-export the explainability types so this remains the single import
// surface for explainability (`import { ... } from './detection-explainability'`).
export type {
  EvidenceSource,
  EvidenceReason,
  RelationshipReason,
  ExplanationReason,
  VersionExplanation,
  VersionConflictDetail,
  ExplanationNode,
  ExplanationEdge,
  ExplanationGraph,
  DetectionExplainability,
  DetectionKind,
  ExplanationEdgeType,
} from './types.js';

// ─── Internal helpers ───────────────────────────────────────────────

/**
 * Builds a human-readable source description for a single evidence item,
 * using only fields that already exist on the evidence object.
 *
 * - http_header → "HTTP header 'Server'"
 * - meta_tag → "Meta tag 'generator'"
 * - script_url → "Script from 'https://...'"
 * - script_content → "JavaScript snippet"
 * - html → "HTML element at '#app'"
 * - javascript_global → "JavaScript global 'React'"
 * - resource → "Resource at 'https://...'"
 * - link → "Link to 'https://...'"
 * - resource_content → "Resource content at 'https://...'"
 */
function evidenceSourceDescription(item: EvidenceResponse): string {
  switch (item.type) {
    case 'http_header':
      return `HTTP header '${item.name}'`;
    case 'meta_tag':
      return `Meta tag '${item.name}'`;
    case 'script_url':
      return `Script from '${item.url}'`;
    case 'script_content':
      return 'JavaScript snippet';
    case 'html':
      return `HTML element at '${item.selector}'`;
    case 'javascript_global':
      return `JavaScript global '${item.globalName}'`;
    case 'resource':
      return `Resource at '${item.url}'`;
    case 'link':
      return `Link to '${item.url}'`;
    case 'resource_content':
      return `Resource content at '${item.url}'`;
    default:
      return 'Evidence';
  }
}

/**
 * The discriminating value extracted from an evidence item — the value a
 * detection rule actually matched on. Used as the "matched" portion of an
 * evidence reason's summary. Per-observation versions are NOT persisted on
 * the domain `Detection`, so this is the evidence's own signature value,
 * never a fabricated/interpreted version.
 */
function matchedValue(item: EvidenceResponse): string {
  switch (item.type) {
    case 'http_header':
      return item.value;
    case 'meta_tag':
      return item.content;
    case 'script_url':
      return item.url;
    case 'script_content':
      return item.snippet;
    case 'html':
      return item.snippet;
    case 'javascript_global':
      return item.globalName;
    case 'resource':
      return item.url;
    case 'link':
      return item.url;
    case 'resource_content':
      return item.match;
    default:
      return '';
  }
}

/**
 * Extracts the primary identifying value for an evidence item — the first
 * presentation field's value (e.g. "Server: nginx" for an HTTP header).
 */
function evidenceSourceValue(item: EvidenceResponse): string {
  const fields = evidenceFields(item);
  return fields[0]?.value ?? '';
}

function toEvidenceSource(item: EvidenceResponse): EvidenceSource {
  return {
    type: evidenceTypeLabel(item.type),
    source: evidenceSourceDescription(item),
    value: evidenceSourceValue(item),
    identity: getEvidenceIdentity(item),
  };
}

/** Builds an evidence-backed reason line: "HTTP header 'Server' — matched 'nginx'". */
function toEvidenceReason(item: EvidenceResponse): EvidenceReason {
  return {
    kind: 'evidence',
    evidenceType: evidenceTypeLabel(item.type),
    summary: `${evidenceSourceDescription(item)} — matched '${matchedValue(item)}'`,
    evidence: item,
  };
}

/**
 * Builds relationship reason(s) for a derived detection, one per
 * `implies` provenance edge, in deterministic order (sourceTechnology ASC).
 */
function buildRelationshipReasons(detection: DetectionResponse): RelationshipReason[] {
  if (detection.source !== 'relationship' || !detection.derivedFrom) {
    return [];
  }
  return [...detection.derivedFrom]
    .sort((a, b) => {
      if (a.source !== b.source) return a.source < b.source ? -1 : 1;
      const na = a.sourceName ?? a.source;
      const nb = b.sourceName ?? b.source;
      return na === nb ? 0 : na < nb ? -1 : 1;
    })
    .map((prov) => ({
      kind: 'relationship' as const,
      relationshipType: 'implies' as const,
      sourceTechnology: prov.source,
      sourceName: prov.sourceName,
      targetTechnology: detection.technology.id,
    }));
}

/** Builds the version explanation for a resolved version (if any). */
function buildVersionExplanation(detection: DetectionResponse): VersionExplanation | undefined {
  if (!detection.version) return undefined;

  const evidence = detection.versionEvidence
    ? detection.versionEvidence.map(toEvidenceSource).sort(compareEvidenceSources)
    : undefined;

  return {
    version: detection.version,
    ...(detection.versionSource ? { source: detection.versionSource } : {}),
    ...(evidence && evidence.length > 0 ? { evidence } : {}),
  };
}

/**
 * Builds the conflict-detail for a `versionConflict`, grouping the
 * disagreeing observations by evidence-type label. The web layer cannot map
 * evidence types back to the core `VersionSource` modality (that mapping
 * lives in `@devlens/detectors` and is not imported here) — see §13 LIMITATIONS.
 */
function buildVersionConflictDetail(
  detection: DetectionResponse,
): VersionConflictDetail[] | undefined {
  if (!detection.versionConflict) return undefined;
  const versionEvidence = detection.versionEvidence ?? [];
  if (versionEvidence.length === 0) return undefined;

  const grouped = new Map<string, EvidenceSource[]>();
  for (const item of versionEvidence.map(toEvidenceSource).sort(compareEvidenceSources)) {
    const bucket = grouped.get(item.type) ?? [];
    bucket.push(item);
    grouped.set(item.type, bucket);
  }

  return Array.from(grouped.keys())
    .sort((a, b) => (a === b ? 0 : a < b ? -1 : 1))
    .map((source) => ({
      source,
      evidence: grouped.get(source) as EvidenceSource[],
    }));
}

/**
 * Builds a normalized evidence graph (Step 73 §2): a flat, serializable
 * view of the detection's provenance. Nodes = detection + evidence (+
 * source technology for derived, + conflicting technology for conflicts);
 * edges = supported_by / derived_from / conflicts_with. Deterministic order.
 */
function buildGraph(
  detection: DetectionResponse,
  uniqueEvidence: EvidenceResponse[],
  isDerived: boolean,
  derivedFrom:
    ReadonlyArray<{ source: string; sourceName?: string; relationshipType: 'implies' }> | undefined,
  relationshipConflicts:
    ReadonlyArray<{ type: 'excludes' | 'requires'; other: string; reason: string }> | undefined,
): ExplanationGraph {
  const techId = detection.technology.id;
  const nodes: ExplanationNode[] = [
    { id: `detection:${techId}`, kind: 'detection', label: detection.technology.name, techId },
  ];

  // Evidence nodes (supported_by edges).
  const evidenceSources = uniqueEvidence.map(toEvidenceSource);
  for (const item of evidenceSources) {
    nodes.push({
      id: `evidence:${item.identity}`,
      kind: 'evidence',
      label: item.type,
    });
  }

  // Source-technology nodes for a derived detection (derived_from edges).
  for (const prov of isDerived ? (derivedFrom ?? []) : []) {
    nodes.push({
      id: `tech:${prov.source}`,
      kind: 'technology',
      label: prov.sourceName ?? prov.source,
      techId: prov.source,
    });
  }

  // Conflicting-technology nodes (conflicts_with edges).
  if (relationshipConflicts) {
    for (const c of [...relationshipConflicts].sort((a, b) => {
      if (a.type !== b.type) return a.type < b.type ? -1 : 1;
      return a.other === b.other ? 0 : a.other < b.other ? -1 : 1;
    })) {
      nodes.push({
        id: `tech:${c.other}`,
        kind: 'technology',
        label: c.other,
        techId: c.other,
      });
    }
  }

  const edges: ExplanationEdge[] = [];

  // detection → evidence (supported_by), sorted by identity ASC.
  for (const item of evidenceSources.sort(compareEvidenceSources)) {
    edges.push({
      from: `detection:${techId}`,
      to: `evidence:${item.identity}`,
      type: 'supported_by',
    });
  }

  // detection → source technology (derived_from).
  if (isDerived && derivedFrom) {
    for (const prov of [...derivedFrom].sort((a, b) =>
      a.source === b.source ? 0 : a.source < b.source ? -1 : 1,
    )) {
      edges.push({
        from: `detection:${techId}`,
        to: `tech:${prov.source}`,
        type: 'derived_from',
      });
    }
  }

  // detection → conflicting technology (conflicts_with).
  if (relationshipConflicts) {
    for (const c of [...relationshipConflicts].sort((a, b) => {
      if (a.type !== b.type) return a.type < b.type ? -1 : 1;
      return a.other === b.other ? 0 : a.other < b.other ? -1 : 1;
    })) {
      edges.push({
        from: `detection:${techId}`,
        to: `tech:${c.other}`,
        type: 'conflicts_with',
      });
    }
  }

  // Deterministic ordering (no object-key insertion-order reliance).
  nodes.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind < b.kind ? -1 : 1;
    return a.id === b.id ? 0 : a.id < b.id ? -1 : 1;
  });
  edges.sort((a, b) => {
    if (a.type !== b.type) return a.type < b.type ? -1 : 1;
    if (a.from !== b.from) return a.from < b.from ? -1 : 1;
    return a.to === b.to ? 0 : a.to < b.to ? -1 : 1;
  });

  return { nodes, edges };
}

/** Deterministic comparator for evidence sources (type-label ASC → identity ASC). */
function compareEvidenceSources(a: EvidenceSource, b: EvidenceSource): number {
  if (a.type !== b.type) return a.type < b.type ? -1 : 1;
  return a.identity === b.identity ? 0 : a.identity < b.identity ? -1 : 1;
}

/** Deterministic comparator for raw evidence (type-label ASC → identity ASC). */
function compareEvidence(a: EvidenceResponse, b: EvidenceResponse): number {
  const labelA = evidenceTypeLabel(a.type);
  const labelB = evidenceTypeLabel(b.type);
  if (labelA !== labelB) return labelA < labelB ? -1 : 1;
  const idA = getEvidenceIdentity(a);
  const idB = getEvidenceIdentity(b);
  return idA === idB ? 0 : idA < idB ? -1 : 1;
}

// ─── Public API ──────────────────────────────────────────────────────

/**
 * Produces a structured, deterministic explanation of a technology detection.
 *
 * The confidence value is passed through exactly as-is from the detection
 * — it is never recalculated or relabeled. The neutral `summary` string is
 * derived from the existing `getDetectionExplanation` module — not reimplemented.
 *
 * Evidence is:
 *   - Deduplicated using the canonical `getEvidenceIdentity` algorithm
 *     (from `lib/evidence-identity.ts`)
 *   - Sorted determinically by type-label ASC, then identity ASC
 *   - Described using only fields that exist on each evidence object
 *
 * The added fields (`kind`, `reasons`, `version`, `versionConflict*`,
 * `versionEvidence`, `derivedFrom`, `relationshipConflicts`,
 * `noDirectEvidence`, `graph`) are all derived from existing detection
 * data — nothing is invented (see §13 LIMITATIONS for the per-observation
 * version note).
 *
 * @param detection The detection response (from API, already loaded)
 * @returns A deterministic explainability model
 */
export function getDetectionExplainability(detection: DetectionResponse): DetectionExplainability {
  const { technology, confidence } = detection;

  // Reuse the existing explanation module for the neutral summary.
  const { summary } = getDetectionExplanation(detection);

  // Deduplicate evidence using the canonical identity, then sort
  // deterministically by type-label ASC → identity ASC.
  const uniqueEvidence = deduplicateEvidence(detection.evidence).sort(compareEvidence);

  // Collect unique evidence type labels, sorted alphabetically.
  const evidenceTypes = Array.from(
    new Set(uniqueEvidence.map((item) => evidenceTypeLabel(item.type))),
  ).sort();

  // Per-evidence origin descriptions with canonical identity.
  const evidenceSources: EvidenceSource[] = uniqueEvidence.map(toEvidenceSource);

  // Reasons: evidence reasons for a directly-observed detection; the
  // relationship reason(s) for a derived detection.
  const isDerived = detection.source === 'relationship';
  const reasons: ExplanationReason[] = isDerived
    ? buildRelationshipReasons(detection)
    : uniqueEvidence.map(toEvidenceReason);

  const evidenceCount = uniqueEvidence.length;
  const noDirectEvidence = evidenceCount === 0;

  const version = detection.version ? buildVersionExplanation(detection) : undefined;
  const versionConflict = detection.versionConflict === true ? true : undefined;
  const versionConflictDetail = detection.versionConflict
    ? buildVersionConflictDetail(detection)
    : undefined;
  const versionEvidence = detection.versionEvidence
    ? detection.versionEvidence.map(toEvidenceSource).sort(compareEvidenceSources)
    : undefined;

  const derivedFrom = detection.derivedFrom
    ? detection.derivedFrom
        .map((prov) => ({
          source: prov.source,
          sourceName: prov.sourceName,
          relationshipType: 'implies' as const,
        }))
        .sort((a, b) => (a.source === b.source ? 0 : a.source < b.source ? -1 : 1))
    : undefined;

  const relationshipConflicts = detection.relationshipConflicts
    ? [...detection.relationshipConflicts].sort((a, b) => {
        if (a.type !== b.type) return a.type < b.type ? -1 : 1;
        if (a.other !== b.other) return a.other < b.other ? -1 : 1;
        return a.reason === b.reason ? 0 : a.reason < b.reason ? -1 : 1;
      })
    : undefined;

  return {
    technology: {
      name: technology.name,
      category: technology.category,
    },
    kind: (isDerived ? 'derived' : 'direct') as DetectionKind,
    confidence,
    summary,
    reasons,
    evidenceCount,
    evidenceTypes,
    evidenceSources,
    evidence: uniqueEvidence,
    ...(version ? { version } : {}),
    ...(versionConflict ? { versionConflict } : {}),
    ...(versionConflictDetail ? { versionConflictDetail } : {}),
    ...(versionEvidence && versionEvidence.length > 0 ? { versionEvidence } : {}),
    ...(derivedFrom ? { derivedFrom } : {}),
    ...(relationshipConflicts ? { relationshipConflicts } : {}),
    noDirectEvidence,
    graph: buildGraph(detection, uniqueEvidence, isDerived, derivedFrom, relationshipConflicts),
  };
}
