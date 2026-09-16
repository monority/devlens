# Step 29: JSON Export for Scan Reports

## Objective

Allow users to export an existing scan result as a stable, machine-readable JSON document from `/scans/[id]`. The exported document faithfully represents the existing API scan result with a versioned envelope, no new domain representations, and no backend changes.

## Architecture

### Preferred structure

```
page.tsx (server)
  ↓
ScanLifecycle (client: 'use client', polling — pre-existing)
  ↓
ScanDetailView (pure presentation — pre-existing)
  ├── ScanSummary       (scan metadata: target, status, timeline)
  ├── Snapshot          (HTTP + HTML observations, for completed scans)
  └── DetectionList     (ranked detection list)
  ↓
header (server-rendered, in page.tsx)
  ├── CopyReportLink (client: 'use client', clipboard — from Step 28)
  └── ExportScanButton (client: 'use client', download — from Step 29)
```

Only three client boundaries exist: `ScanLifecycle` (polling), `CopyReportLink` (clipboard), and `ExportScanButton` (download). The scan report itself (`ScanDetailView`) remains pure and server-rendered.

### Pure export module (`lib/export-scan.ts`)

Pure module with no React, HTTP, or database dependencies. Maps the typed `ScanDetailResponse` to a stable JSON envelope:

- **`ExportDocument`** — TypeScript interface for the export envelope:
  ```typescript
  {
    format: 'devlens.scan';
    version: 1;
    scan: ScanSummary;            // full scan object from API
    snapshot: SnapshotResponse | null;
    detections: DetectionResponse[];
  }
  ```
- **`scanToExport(result)`** — Pure mapping function that wraps the existing API representation in the version envelope. Returns a new object referencing the original `scan`, `snapshot`, and `detections` (shallow copy — does not mutate the input).
- **`serializeExport(result)`** — Returns `JSON.stringify(scanToExport(result), null, 2)` (pretty-printed JSON).
- **`safeExportFilename(scanId)`** — Generates `devlens-<sanitized-scan-id>.json`. Sanitizes unsafe filesystem characters (`[^a-zA-Z0-9_-]` → `_`). Does **not** expose the target URL as the filename.
- **`triggerDownload(json, filename)`** — Browser-native download: creates a `Blob` with `application/json` type, creates an object URL via `URL.createObjectURL`, creates an `<a download>` element, triggers click, and calls `URL.revokeObjectURL` for cleanup.
- **`EXPORT_FORMAT`** / **`EXPORT_VERSION`** — String/number constants for the envelope.

### Export button (`components/ExportScanButton.tsx`)

Tiny `'use client'` component:

- Renders a `<button type="button">` with `aria-label="Export scan as JSON"`
- On click: calls `serializeExport(result)` → `safeExportFilename(scan.id)` → `triggerDownload(json, filename)`
- Shows `"Exported!"` feedback with `aria-live="polite"` (3-second timeout)
- Catches errors silently (no unhandled exceptions in the browser)
- No third-party download library

### Page modifications (`app/scans/[id]/page.tsx`)

- Added `ExportScanButton` in the detail header (alongside `CopyReportLink` and existing back/compare links)
- The button is rendered on all found-scan states (including failed scans — export preserves error information without fabricating success)

### Design decisions

1. **Client-side download, not server endpoint**: Considered a `GET /api/scans/:id/export` route but chose client-side Blob download instead to avoid adding a new API endpoint (per the "Do NOT add: new API endpoints" constraint). The `triggerDownload` function is pure-extractable and tested independently.

2. **Data passed as prop, not re-fetched**: The `ExportScanButton` receives the `ScanDetailResponse` as a prop from the server component (no duplicate network request). For terminal scans (completed/failed), the data is final.

3. **No second domain representation**: `scanToExport()` maps the existing `ScanDetailResponse` fields directly — `scan`, `snapshot`, `detections` are passed through unchanged. The only new structure is the `{ format, version }` envelope wrapper.

4. **Deterministic output**: `JSON.stringify(doc, null, 2)` produces stable output because `scanToExport()` always creates the `ExportDocument` with the same key order (`format → version → scan → snapshot → detections`). Detection and evidence ordering is preserved from the API response.

5. **Filename safety**: Uses scan ID only (not target URL), sanitized to `[a-zA-Z0-9_-]` to prevent path traversal (`../`) or filesystem issues.

6. **Security**: Exports only data already exposed through the public `GET /api/scans/:id` API. No cookies, auth headers, env vars, DB connection details, stack traces, or internal request metadata.

## Files Created

- `apps/web/src/lib/export-scan.ts` — Pure export functions (5 exports)
- `apps/web/src/lib/export-scan.test.ts` — 15 tests (9 pure + 3 filename + 3 download)
- `apps/web/src/components/ExportScanButton.tsx` — Client component ('use client')
- `apps/web/src/components/ExportScanButton.test.tsx` — 5 tests (renders, successful export, filename, JSON content, object URL cleanup)

## Files Modified

- `apps/web/src/app/scans/[id]/page.tsx` — Added `ExportScanButton` to the detail header
- `apps/web/src/components/ScanCard.module.css` — Added `.exportScanLink`, `.exportButton`, `.exportFeedback` styles (plus Step 28's `.copyReportLink`, `.copyFeedback`, `.copyError`)

## Test Coverage

### Pure export tests (`lib/export-scan.test.ts`) — 9 tests

1. exports a completed scan with correct format and version fields
2. preserves failure information for failed scans without fabricating success
3. exports zero-detection scans correctly
4. preserves detection ordering for multiple detections
5. preserves all evidence types (8 evidence type variants)
6. produces deterministic JSON for the same input
7. does not mutate the input object
8. handles special characters in URLs, evidence, and technology names
9. uses correct format and version constants

### Filename tests — 3 tests

1. uses scan ID for the filename
2. does not expose the target URL as the filename
3. sanitizes unsafe characters in scan ID

### Download trigger tests — 3 tests

1. creates a Blob with application/json content type
2. revokes the object URL after download (cleanup)
3. sets the download filename and triggers click

### ExportScanButton component tests — 5 tests

1. renders an "Export JSON" button with an accessible label (`aria-label`)
2. successful export produces valid JSON via `serializeExport` (correct envelope)
3. generated filename uses scan ID and does not expose target URL
4. JSON content from `scanToExport` has the correct envelope shape (key order)
5. cleanup of object URL occurs after download trigger (`URL.revokeObjectURL` called)

## Validation Results

| Check                                                | Status  | Details                                           |
| ---------------------------------------------------- | ------- | ------------------------------------------------- |
| `pnpm typecheck`                                     | ✅ Pass | All 10 workspaces typecheck clean                 |
| `pnpm test`                                          | ✅ Pass | 1185 passed, 33 skipped (up from 1165 + 15 + 5)   |
| `pnpm lint`                                          | ✅ Pass | ESLint clean, Prettier all files match code style |
| `pnpm build`                                         | ✅ Pass | All packages build, including `apps/web`          |
| `npx madge --circular --extensions ts packages apps` | ✅ Pass | No circular dependency found                      |

## Export Schema

```json
{
  "format": "devlens.scan",
  "version": 1,
  "scan": {
    "id": "scan_001",
    "status": "completed",
    "target": "https://example.com/",
    "hostname": "example.com",
    "createdAt": "2025-06-01T12:00:00.000Z",
    "startedAt": null,
    "completedAt": "2025-06-01T12:00:05.000Z",
    "failedAt": null,
    "error": null
  },
  "snapshot": null,
  "detections": [
    {
      "technology": { "id": "react", "name": "React", "category": "frontend" },
      "confidence": 95,
      "evidence": []
    }
  ]
}
```

## Delivery Mechanism

- **Trigger**: "Export JSON" button on `/scans/[id]` detail header
- **Download**: Browser-native `Blob` + `URL.createObjectURL` + `<a download>` (no third-party library)
- **Filename**: `devlens-<scan-id>.json`
- **Content-Type**: `application/json` (via Blob type)
- **Cleanup**: `URL.revokeObjectURL()` called immediately after triggering the download
