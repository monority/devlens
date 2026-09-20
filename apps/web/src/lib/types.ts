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
  | { type: 'link'; url: string };

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
