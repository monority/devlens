/**
 * Pure scan export mapping.
 *
 * Maps the typed API scan result (`ScanDetailResponse`) to a stable,
 * JSON-serializable export envelope. This module has no React, HTTP, or
 * database dependencies — it is a pure function that faithfully
 * represents the existing API representation.
 *
 * The export format is versioned to allow future evolution:
 *
 *   {
 *     "format": "devlens.scan",
 *     "version": 1,
 *     "scan":     { ...ScanResponse },
 *     "snapshot": { ...SnapshotResponse } | null,
 *     "detections": [ ...DetectionResponse ]
 *   }
 *
 * No new domain representation is created — the export is a thin wrapper
 * around the existing API types.
 */

import type { ScanDetailResponse, SnapshotResponse, ScanSummary } from './types.js';

/**
 * The stable export envelope. Mirrors the existing `ScanDetailResponse`
 * shape, wrapped with `format` and `version` for future evolution.
 */
export interface ExportDocument {
  format: 'devlens.scan';
  version: 1;
  scan: ScanSummary;
  snapshot: SnapshotResponse | null;
  detections: ScanDetailResponse['detections'];
}

/**
 * The current export format version. Bumped when the export schema changes
 * in a backwards-incompatible way.
 */
export const EXPORT_FORMAT = 'devlens.scan' as const;
export const EXPORT_VERSION = 1 as const;

/**
 * Generates a safe filename for the exported JSON file.
 *
 * Uses only the scan ID (not the target URL) to avoid filesystem issues
 * from arbitrary site-provided URLs. The scan ID is sanitized to contain
 * only alphanumeric characters, hyphens, and underscores.
 *
 * Example: `devlens-abc123.json`
 */
export function safeExportFilename(scanId: string): string {
  const safe = scanId.replace(/[^a-zA-Z0-9_-]/g, '_');
  return `devlens-${safe}.json`;
}

/**
 * Maps a `ScanDetailResponse` to a stable `ExportDocument`.
 *
 * - Preserves scan, snapshot, and detections fields as-is from the API
 * - Does NOT create a second domain representation
 * - Does NOT mutate the input
 * - Does NOT recalculate scores or detections
 *
 * @param result The typed API scan result
 * @returns A JSON-serializable export document
 */
export function scanToExport(result: ScanDetailResponse): ExportDocument {
  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    scan: result.scan,
    snapshot: result.snapshot,
    detections: result.detections,
  };
}

/**
 * Serializes a `ScanDetailResponse` to a pretty-printed JSON string.
 *
 * Field ordering is determined by the `ExportDocument` interface
 * (format → version → scan → snapshot → detections), which is stable
 * and deterministic.
 *
 * Detection and evidence ordering is preserved from the API response
 * (the `filter` method preserves array order).
 *
 * @param result The typed API scan result
 * @returns A pretty-printed JSON string
 */
export function serializeExport(result: ScanDetailResponse): string {
  return JSON.stringify(scanToExport(result), null, 2);
}

/**
 * Triggers a file download of the given JSON content.
 *
 * Uses browser-native APIs: `Blob`, `URL.createObjectURL`, and an
 * `<a download>` element. The object URL is revoked after download
 * to prevent memory leaks.
 *
 * @param json The JSON string to download
 * @param filename The filename for the downloaded file
 */
export function triggerDownload(json: string, filename: string): void {
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  // Append to DOM for Firefox compatibility
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  URL.revokeObjectURL(url);
}
