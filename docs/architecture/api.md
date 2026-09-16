# Architecture: HTTP API

## Endpoints

```text
POST   /api/scans       — create and execute a scan
GET    /api/scans       — list all scan results
GET    /api/scans/:id   — retrieve a single scan result by ID
```

---

## POST /api/scans

Accepts a target URL, creates a domain `Scan`, executes it through the
existing application layer, persists the result, and returns a structured
JSON response.

## Request

```json
{
  "url": "https://example.com"
}
```

- Body must be valid JSON.
- `url` must be present and be a string.
- `url` must be an absolute HTTP or HTTPS URL.
- No other fields are accepted.

### Validation rules (HTTP boundary)

| Condition                    | HTTP 400 error code    |
| ---------------------------- | ---------------------- |
| Body is not valid JSON       | `MALFORMED_JSON`       |
| `url` field is missing       | `MISSING_URL`          |
| `url` is not a string        | `INVALID_URL_TYPE`     |
| `url` is empty               | `EMPTY_URL`            |
| `url` is not a valid URL     | `INVALID_URL`          |
| `url` uses a non-http scheme | `UNSUPPORTED_PROTOCOL` |

Rejected schemes: `ftp://`, `file://`, `javascript:`, `data:`, etc.

## Response

### Success — 200 OK

```json
{
  "scan": {
    "id": "scan_uuid",
    "status": "completed",
    "target": "https://example.com/",
    "hostname": "example.com",
    "createdAt": "2025-06-01T11:00:00.000Z",
    "startedAt": null,
    "completedAt": "2025-06-01T12:00:05.000Z",
    "failedAt": null,
    "error": null
  },
  "snapshot": {
    "url": "https://example.com/",
    "hostname": "example.com",
    "capturedAt": "2025-06-01T12:00:05.000Z",
    "http": {
      "statusCode": 200,
      "contentType": "text/html",
      "finalUrl": "https://example.com/"
    },
    "html": {
      "title": "Example Domain",
      "description": null
    }
  },
  "detections": []
}
```

> **`completedAt`** reflects the actual wall-clock time of completion (a
> fresh `new Date()` generated inside `runScan` at the moment
> `completeScan` is called). It is NOT equal to `createdAt` or
> `startedAt` in production — the difference represents scan duration.
>
> **`startedAt`** is `null` in the API response for completed/failed scans.
> The `completed` and `failed` `ScanStatus` variants do not carry a
> `startedAt` field by design — the `running` variant does, but it is
> consumed internally by `runScan` and never returned to the API
> consumer. This is a known limitation: a consumer cannot compute exact
> scan duration from API timestamps alone.
>
> **`createdAt`** is set when the scan object is constructed (before
> `runScan` begins), so `createdAt ≤ completedAt` is always guaranteed.

- When the scan **fails** (crawler error), the HTTP status is still `200`,
  but `scan.status` is `"failed"` and `scan.error` contains the error code
  and message. `snapshot` is `null` and `detections` is `[]`.
- When the scan **completes**, `scan.status` is `"completed"` and `snapshot`
  contains the captured data. `detections` is an array of technology
  detections (empty when no detector is configured, e.g. `NullDetector`).

### Infrastructure failure — 500 Internal Server Error

```json
{
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "An internal error occurred."
  }
}
```

Returned when persistence fails or an unexpected error occurs during
execution. The actual error message is **not** leaked to the client.

## Architecture

```text
HTTP request
  │
  ▼
Next.js Route Handler (apps/web/src/app/api/scans/route.ts)
  │  1. request.text() → body string
  │  2. handleCreateScan(body, deps) → { status, body }
  │  3. NextResponse.json(body, { status })
  ▼
handleCreateScan (pure, no Next.js types)
  │  1. JSON.parse → validate (url, scheme)
  │  2. createScan(...) — domain construction
  │  3. executeScan(scan, crawler, detector, repository, now)
  │     → runScan(scan, crawler, detector, now) → ScanResult
  │     → persistResult(result, repository)
  ▼
@devlens/application (executeScan / runScan / persistResult)
  │  runScan calls detector.detect(snapshot) → Detection[]
```

### Rules

- **No business logic in the route.** The route does **not** call
  `startScan()`, `completeScan()`, `failScan()`, `repository.save()`,
  or `HttpCrawler.crawl()` directly. These are encapsulated by
  `executeScan` → `runScan` + `persistResult`.
- **No database row fields in the response.** The response shape is
  derived entirely from domain types (`Scan`, `SiteSnapshot`).
- **No new framework.** Next.js 15 App Router is the existing web framework.
- **No new validation framework.** Request validation uses minimal inline
  logic (JSON.parse + `new URL` + scheme check). The `@devlens/validation`
  package is an empty stub.
- **No new configuration system.** The database client is constructed via
  `createDatabaseClient()` from `@devlens/database`, which reads the
  `DATABASE_URL` environment variable.

## SSRF threat model

The API causes the server to fetch a user-provided URL, so SSRF is a
primary concern.

### HTTP boundary (scheme validation)

The route validates that the URL uses `http:` or `https:`. This blocks
`file://`, `ftp://`, `javascript:`, `data:`, and other non-HTTP schemes
at the entry point.

### Crawler-level protection (host validation)

`HttpCrawler.crawl()` (using `new URL(target).hostname`) calls
`isBlockedHostname()` from `packages/crawler/src/ssrf-guard.ts` on every
request — including every redirect target. Blocked:

- `localhost` and `.localhost`
- IPv4 private ranges: `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`
- Loopback: `127.0.0.0/8`, IPv6 `::1`
- Link-local: `169.254.0.0/16`, IPv6 `fe80::/10`
- IPv6 unique-local: `fc00::/7`
- `0.0.0.0/8`
- Metadata endpoints are blocked if they resolve to private IPs
  (e.g. `169.254.169.254`)

### Known limitations (documented, not silently accepted)

- **DNS rebinding**: The crawler resolves the hostname to an IP, then
  checks the IP. A malicious server could return a public IP during
  the DNS check and a private IP during the actual HTTP request. This
  is a known limitation that requires a DNS-pinning fetcher to fully
  mitigate.
- **Domain-based metadata endpoints**: Cloud provider metadata endpoints
  (e.g. `metadata.google.internal`) accessible from the server's VPC are
  not blocked by hostname. Only IP-based private ranges are blocked.

### Conclusion

The SSRF boundary is **sufficient** for the current incremental scope.
All URL schemes are restricted at the HTTP boundary, and all IP-based
private ranges (including loopback, link-local, and redirect targets)
are blocked at the crawler level. If a hostname resolves to a blocked
IP, the crawler throws a `CrawlError` with code `invalid_target`, which
is surfaced as a failed scan (HTTP 200 with `scan.status: "failed"`).

---

## GET /api/scans

Lists all scan results in deterministic order.

### Request

```text
GET /api/scans
```

No query parameters, no body.

### Response — 200 OK

```json
{
  "scans": [
    {
      "id": "scan_uuid",
      "status": "completed",
      "target": "https://example.com/",
      "hostname": "example.com",
      "createdAt": "2025-06-01T12:00:00.000Z",
      "startedAt": null,
      "completedAt": "2025-06-01T12:00:05.000Z",
      "failedAt": null,
      "error": null
    },
    {
      "id": "scan_uuid_2",
      "status": "failed",
      "target": "https://blocked.example.com",
      "hostname": "blocked.example.com",
      "createdAt": "2025-06-01T11:00:00.000Z",
      "startedAt": null,
      "completedAt": null,
      "failedAt": "2025-06-01T11:00:01.000Z",
      "error": { "code": "invalid_target", "message": "..." }
    }
  ]
}
```

- Each entry uses the **same `scan` field set** as the POST response
  (Section 9 — response contract). No database internals are exposed.
- The `scans` array may be empty (`{ "scans": [] }`) if no scans exist.
- **Ordering is deterministic**: `createdAt DESC, scanId ASC`. A stable
  tie-breaker on `scanId` ensures reproducible results when multiple
  scans share the same `createdAt`.

### Response — 500 Internal Server Error

Same as POST: `{ "error": { "code": "INTERNAL_ERROR", "message": "An internal error occurred." } }`.

### Architecture

```text
Next.js Route (route.ts)
  │  GET /api/scans → handleGetScans(deps) → { status, body }
  ▼
@devlens/application (getScan / listScans)
  │  delegates to repository.getById / repository.list
  ▼
@devlens/database (PostgresScanResultRepository)
```

---

## GET /api/scans/:id

Retrieves a single scan result by its ID.

### Request

```text
GET /api/scans/scan_uuid
```

The `id` is the domain `ScanId` (a UUID string or any ID assigned at
scan creation time).

### Success — 200 OK

Returns the **same response shape** as the POST `CreateScanResponse`:

```json
{
  "scan": {
    "id": "scan_uuid",
    "status": "completed",
    "target": "https://example.com/",
    "hostname": "example.com",
    "createdAt": "2025-06-01T12:00:00.000Z",
    "startedAt": null,
    "completedAt": "2025-06-01T12:00:05.000Z",
    "failedAt": null,
    "error": null
  },
  "snapshot": { ... } | null,
  "detections": [ ... ]
}
```

- The response includes the full scan detail (scan + snapshot + detections),
  matching the POST response shape exactly.
- **Failed scans return 200** (not 404). A failed scan is a valid,
  persisted result — `snapshot` is `null` and `detections` is `[]`, but
  `scan.status` is `"failed"` with the error code and message populated.

### Not found — 404 Not Found

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Scan not found."
  }
}
```

Returned when no scan exists with the given ID. This is distinct from
a failed scan — a failed scan returns 200.

### Response — 500 Internal Server Error

Same as POST: `{ "error": { "code": "INTERNAL_ERROR", "message": "An internal error occurred." } }`.

### Error handling summary

| Condition                 | HTTP Status | Error code       |
| ------------------------- | ----------- | ---------------- |
| Scan exists (any status)  | 200         | —                |
| No scan with that ID      | 404         | `NOT_FOUND`      |
| Empty ID                  | 404         | `NOT_FOUND`      |
| Repository/database error | 500         | `INTERNAL_ERROR` |

No SQL errors, stack traces, or database internals are ever leaked to
the client.
