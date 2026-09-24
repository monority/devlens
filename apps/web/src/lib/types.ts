/**
 * Shared types for the DevLens web UI.
 *
 * These types mirror the JSON response shapes returned by the existing
 * API endpoints (`GET /api/scans` and `GET /api/scans/:id`). They are
 * defined here to keep the UI layer decoupled from the API handler's
 * internal type names — the UI depends on the *contract*, not on any
 * specific handler implementation detail.
 *
 * These are plain data shapes only — no domain mapping logic lives here.
 */

import type {
  DetectionProvenance,
  ObservationCoverage,
  ScanResultQualitySummary,
} from '@devlens/core';

// ─── Scan summary (used in both list and detail) ─────────────────────

/**
 * The `scan` object returned by every API response.
 * Matches `CreateScanResponse['scan']` from the API handler.
 */
export interface ScanResponse {
  id: string;
  status: string;
  target: string;
  hostname: string;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  failedAt: string | null;
  error: { code: string; message: string } | null;
}

/**
 * A scan summary used in both the list and as part of the detail response.
 */
export type ScanSummary = ScanResponse;

// ─── HTTP observation ────────────────────────────────────────────────

export interface HttpObservationResponse {
  statusCode: number;
  contentType: string;
  finalUrl: string;
}

// ─── HTML observation ────────────────────────────────────────────────

export interface HtmlObservationResponse {
  title: string;
  description: string | null;
}

export interface SnapshotResponse {
  url: string;
  hostname: string;
  capturedAt: string;
  http: HttpObservationResponse;
  html: HtmlObservationResponse;
}

// ─── Evidence ────────────────────────────────────────────────────────

export type EvidenceResponse =
  | { type: 'html'; selector: string; snippet: string }
  | { type: 'http_header'; name: string; value: string }
  | { type: 'script_url'; url: string }
  | { type: 'script_content'; snippet: string }
  | { type: 'meta_tag'; name: string; content: string }
  | { type: 'javascript_global'; globalName: string }
  | { type: 'resource'; url: string }
  | { type: 'link'; url: string }
  | {
      /** Step 63/70 — a signature matched inside a fetched resource body. */
      type: 'resource_content';
      /** URL of the fetched resource whose body contained the signature. */
      url: string;
      /** The resource type inspected (e.g. 'script' for a JS bundle body). */
      resourceType: string;
      /** The signature substring that matched — the discriminating signal. */
      match: string;
      /** Bounded context around the match (never the full resource body). */
      snippet: string;
    };

// ─── Explainability model (Step 73) ────────────────────────────────
//
// A structured, deterministic, serializable explanation of WHY a detection is
// considered present, derived purely from the detection's own evidence and
// relationship metadata (never invented). These interfaces live here — the web
// contract module — so the API response (`DetectionResponse.explanation`) and
// the pure `getDetectionExplainability` builder share one source of truth
// with no circular dependency (`detection-explainability.ts` imports from
// here, never the reverse).

/**
 * Whether a detection was directly observed or relationship-derived.
 *
 * - `'direct'`   — a detector produced the evidence that was scored.
 * - `'derived'` — inferred from an `implies` edge; carries provenance and
 *   NO direct evidence.
 */
export type DetectionKind = 'direct' | 'derived';

/**
 * Edge type of the normalized explanation graph.
 * - `supported_by`   — detection → evidence (evidence that supports a detection).
 * - `derived_from`   — derived detection → source detection.
 * - `conflicts_with` — direct detection → technology it conflicts with.
 */
export type ExplanationEdgeType = 'supported_by' | 'derived_from' | 'conflicts_with';

/**
 * Canonical, human-readable description of a single evidence item's origin.
 * Shared by the per-evidence reason, version-conflict detail, and version
 * explanation so there is a single source of truth for provenance.
 */
export interface EvidenceSource {
  /** Human-readable evidence type label (e.g. "HTTP Header"). */
  type: string;
  /** Short description of where this evidence originated. */
  source: string;
  /** The primary identifying value (e.g. "Server: nginx"). */
  value: string;
  /** Canonical evidence identity key (e.g. "http_header:Server"). */
  identity: string;
}

/** A reason line backing a direct observation — one per deduplicated evidence. */
export interface EvidenceReason {
  /** Discriminator: always `'evidence'` for a direct observation. */
  kind: 'evidence';
  /** Human-readable evidence type label (e.g. "Meta Tag"). */
  evidenceType: string;
  /** Deterministic human-readable summary of what matched. */
  summary: string;
  /** The evidence item that supports this reason. */
  evidence: EvidenceResponse;
}

/** A reason line backing a relationship-derived detection. */
export interface RelationshipReason {
  /** Discriminator: always `'relationship'` for a derivation. */
  kind: 'relationship';
  /** The catalog edge type. Always `'implies'` for a derivation. */
  relationshipType: 'implies';
  /** The technology ID that implies this one. */
  sourceTechnology: string;
  /** Display name of the source technology (when available). */
  sourceName?: string;
  /** The derived technology ID. */
  targetTechnology: string;
}

/** A reason is either an evidence observation or a relationship derivation. */
export type ExplanationReason = EvidenceReason | RelationshipReason;

/**
 * A resolved version + its provenance (Step 73 §C). The resolved version is
 * kept separate from the proof of presence — a version is never an
 * independent reason for a detection if already borne by the same evidence.
 */
export interface VersionExplanation {
  /** The resolved version string. */
  version: string;
  /** Evidence-source modality the version came from (when unambiguous). */
  source?: string;
  /** The evidence that yielded the resolved version (when available). */
  evidence?: EvidenceSource[];
}

/**
 * A disagreeing version observation surfaced on a `versionConflict` (§D).
 *
 * Step 72 limitation: per-observation *extracted* versions are not persisted
 * on the domain `Detection` — only the disagreeing evidence items are. So a
 * conflict is described by the disagreeing evidence's source modality +
 * matched value; a fabricated version is never invented.
 */
export interface VersionConflictDetail {
  /** The evidence-source modality of this disagreeing observation. */
  source: string;
  /** The disagreeing evidence (with its matched value). */
  evidence: EvidenceSource[];
}

/** A node in the normalized explanation graph (§2 "structure normalisée"). */
export interface ExplanationNode {
  /** Stable, deterministic node identifier. */
  id: string;
  /** What this node represents. */
  kind: 'detection' | 'evidence' | 'technology';
  /** Label for display / tracing. */
  label: string;
  /** Technology id for `detection`/`technology` nodes. */
  techId?: string;
}

/** A directed edge in the normalized explanation graph. */
export interface ExplanationEdge {
  /** Source node id. */
  from: string;
  /** Target node id. */
  to: string;
  /** Semantic relationship: supported_by / derived_from / conflicts_with. */
  type: ExplanationEdgeType;
}

/**
 * A normalized, deterministic explanation graph for a single detection.
 * NOT a graph database or generic relationship engine (§2) — a flat,
 * serializable view derived deterministically from the detection's own data.
 */
export interface ExplanationGraph {
  nodes: ExplanationNode[];
  edges: ExplanationEdge[];
}

// ─── Signal quality / corroboration (Step 76) ────────────────────────

/**
 * The observable "source family" an evidence item originates from. Several
 * evidence `type`s collapse onto the same family (Step 76 §3): e.g.
 * `script_content`, `html` and `javascript_global` are all content-channel
 * observations, so multiple inline-script matches count as one source family.
 */
export type SourceFamily =
  'header' | 'meta' | 'script_url' | 'content' | 'resource_url' | 'resource_content' | 'link';

/**
 * Qualitative corroboration level (Step 76 §5). Small, deterministic and
 * documented — derived solely from observable evidence source families.
 *
 * - `no_evidence`   — no direct evidence (e.g. a derived detection).
 * - `single_signal` — exactly one observable source family.
 * - `corroborated`  — two independent source families.
 * - `strong`        — three or more independent source families.
 */
export type SignalQualityLevel = 'no_evidence' | 'single_signal' | 'corroborated' | 'strong';

/**
 * A descriptive, non-probabilistic summary of how well a detection is
 * corroborated by independent evidence sources (Step 76 §4).
 *
 * This NEVER replaces `confidence` (a ranking score): it only describes the
 * diversity of observations supporting the detection. It is derived from the
 * detection's OWN evidence only — a derived detection never borrows its source
 * technology's strength (§6.A).
 */
export interface SignalQuality {
  /** Quality level — deterministic function of `sourceCount`. */
  level: SignalQualityLevel;
  /** Evidence items after canonical deduplication (§6.C). */
  evidenceCount: number;
  /** Number of distinct observable source families (§3/§6). */
  sourceCount: number;
  /** The distinct source families, sorted for stable rendering/ordering (§7). */
  sources: SourceFamily[];
  /** True when ≥2 independent source families corroborate the detection. */
  corroborated: boolean;
}

/**
 * Structured, deterministic explanation of a single technology detection.
 * Extends the neutral summary with renderable reasons, version provenance,
 * conflict detail, and a normalized evidence graph — from existing data only.
 */
export interface DetectionExplainability {
  technology: { name: string; category: string };
  /** `'direct'` (directly observed) or `'derived'` (relationship-implied). */
  kind: DetectionKind;
  /** The existing confidence value — never recalculated. */
  confidence: number;
  /** Neutral summary string (reused from getDetectionExplanation). */
  summary: string;
  /** Ordered, deduplicated reason lines. */
  reasons: ExplanationReason[];
  /** Total evidence count (after deduplication). */
  evidenceCount: number;
  /** Unique evidence type labels, sorted alphabetically. */
  evidenceTypes: string[];
  /** Per-evidence origin descriptions, deduplicated + deterministically ordered. */
  evidenceSources: EvidenceSource[];
  /** Deduplicated, sorted evidence items — for reuse with EvidenceList. */
  evidence: EvidenceResponse[];
  /** Resolved version provenance (absent when there is no version). */
  version?: VersionExplanation;
  /** True when disagreeing versions were merged (see versionConflictDetail). */
  versionConflict?: boolean;
  /** Disagreeing version observations, when `versionConflict` is true. */
  versionConflictDetail?: VersionConflictDetail[];
  /** The evidence that yielded the resolved version (when available). */
  versionEvidence?: EvidenceSource[];
  /** Provenance for a derived detection (present iff kind === 'derived'). */
  derivedFrom?: ReadonlyArray<{
    source: string;
    sourceName?: string;
    relationshipType: 'implies';
  }>;
  /** Conflicts surfaced on a direct detection (never acted upon destructively). */
  relationshipConflicts?: ReadonlyArray<{
    type: 'excludes' | 'requires';
    other: string;
    reason: 'both_directly_observed' | 'missing_requirement';
  }>;
  /** True when the detection carries no direct evidence (e.g. derived). */
  noDirectEvidence: boolean;
  /** Step 73 §2 normalized evidence graph. */
  graph?: ExplanationGraph;
  /** Step 76 — signal quality / corroboration, independent of `confidence`. */
  signalQuality?: SignalQuality;
}

// ─── Detection ───────────────────────────────────────────────────────

export interface TechnologyResponse {
  id: string;
  name: string;
  category: string;
}

export interface DetectionResponse {
  technology: TechnologyResponse;
  confidence: number;
  evidence: EvidenceResponse[];
  /**
   * Technology version, when extracted from evidence by a tech-specific
   * signature. Optional (omitted/null when absent) — mirrors the API
   * contract where `version` is only present when known.
   */
  version?: string | null;
  /**
   * Step 72 — `true` when multiple evidence sources extracted disagreeing
   * versions and the consensus layer refused to pick one. The `version` is
   * then `null` and the UI renders "version conflict detected" (§11/§19/§20).
   * Absent when there is no conflict.
   */
  versionConflict?: boolean;
  /**
   * The evidence-source modality the resolved `version` came from, when
   * unambiguous. Absent when there is no version or when sources disagree
   * (Step 72 §4/§10).
   */
  versionSource?: string;
  /**
   * Step 69 — How this detection entered the result set. Omitted when
   * the detection is a direct observation; `'relationship'` means it was
   * derived from an `implies` edge (no direct evidence — see `derivedFrom`).
   */
  source?: 'direct' | 'relationship';
  /** Provenance for a derived detection (present iff source === 'relationship'). */
  derivedFrom?: ReadonlyArray<{ source: string; sourceName: string; type: 'implies' }>;
  /** Conflicts surfaced on a direct detection (excludes both-detected / requires missing). */
  relationshipConflicts?: ReadonlyArray<{
    type: 'excludes' | 'requires';
    other: string;
    reason: 'both_directly_observed' | 'missing_requirement';
  }>;
  /**
   * Step 72/73 — the evidence item(s) whose matched value yielded the
   * resolved `version` (when `version` is non-null and explainable). On a
   * `versionConflict`, this carries the disagreeing observations' evidence
   * so the conflict is inspectable rather than silent. Absent when there is
   * no version. Never fabricated.
   */
  versionEvidence?: EvidenceResponse[];
  /**
   * Step 73 — a structured, deterministic explanation of why this detection
   * is considered present (evidence reasons, relationship provenance,
   * version/conflict detail, evidence graph). Derived from existing data;
   * omitted when not yet computed (e.g. by an older API). The UI may compute
   * the same model client-side via `getDetectionExplainability` as a fallback.
   */
  explanation?: DetectionExplainability;
  /**
   * Step 80 — deterministic, derived provenance for this detection: the
   * post-dedup evidence count, the distinct evidence modalities in a
   * canonical order, and the strongest evidence type. Derived from the
   * detection's existing `evidence` + `confidence` (no new DB column,
   * no fabricated data); absent when the detection has no direct evidence
   * (e.g. a relationship-derived detection). Mirrors the core
   * `DetectionProvenance`/`computeDetectionProvenance`.
   */
  provenance?: DetectionProvenance;
}

// ─── Full scan result (by ID and by POST) ─────────────────────────────

/**
 * The response body for `GET /api/scans/:id` and `POST /api/scans`.
 * Both endpoints return the same `CreateScanResponse` shape from the
 * API handler — the POST response is a full scan result that may be
 * `completed` or `failed`.
 */
export interface ScanDetailResponse {
  scan: ScanResponse;
  snapshot: SnapshotResponse | null;
  /**
   * Observation coverage / blind-spot intelligence (Step 78 §9 #2).
   * Computed server-side from the snapshot. May be absent for legacy/forward
   * compatibility — callers should default to an all-`not_observed` coverage.
   */
  observationCoverage?: ObservationCoverage;
  /**
   * Scan-level result-quality summary (Step 79). Computed server-side from
   * the detection signal quality (Step 76) + observation coverage (Step 78) —
   * no detection/scoring/coverage logic is recomputed. May be absent for
   * legacy/forward compatibility; callers should default to
   * `EMPTY_SCAN_RESULT_QUALITY`.
   */
  resultQuality?: ScanResultQualitySummary;
  detections: DetectionResponse[];
}

/** Alias used in the context of a scan creation (POST) response. */
export type CreateScanResponse = ScanDetailResponse;

// ─── List response ───────────────────────────────────────────────────

/**
 * The response body for `GET /api/scans`.
 */
export interface ScansListResponse {
  scans: ScanResponse[];
}

// ─── Error response ──────────────────────────────────────────────────

/**
 * The error response body for 404 and 500 responses.
 */
export interface ErrorResponse {
  error: {
    code: string;
    message: string;
  };
}

/**
 * Request body for `POST /api/scans`.
 */
export interface CreateScanRequest {
  url: string;
}

/**
 * Step 77 — Detection interpretation & presentation labels (§4).
 *
 * Pure presentation strings derived from a DetectionResponse + its
 * DetectionExplainability. NOT a score/confidence/probability recalculation
 * (Step 77 §5, §12). Produced by `getDetectionPresentation` and consumed by the
 * UI — never serialized back to the API.
 */
export interface DetectionPresentation {
  /** "Confidence: 95" — a 0-100 ranking score, never a '%' (Step 77 §5). */
  confidenceLabel: string;
  /** Reuses the Step-76 `signalQualityLabel` ("Single signal · 1 source",
   * "Derived · no direct evidence", "No evidence"). Empty for legacy
   * responses lacking `explanation.signalQuality` (Step 77 §7).
   */
  signalQualityLabel: string;
  /** "Direct" | "Derived" (Step 77 §6 provenance token). */
  provenanceLabel: 'Direct' | 'Derived';
  /** Compact non-duplicative evidence hint (Step 77 §8). */
  evidenceSummary: string;
  /** Folded header line (Step 77 §6):
   *  `Confidence: N · <signalQualityLabel> · Direct`
   *  or `Confidence: 0 · Derived · no direct evidence`. */
  combinedHeaderLabel: string;
}
