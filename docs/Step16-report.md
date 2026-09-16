# DevLens — Step 16 — API Contract & Integration Hardening

## 1. Executive Summary

Step 16 audite la frontière API et l'intégration de `POST /api/scans`.
L'audit couvre :

- La validation d'entrée (JSON, URL, schéma)
- Le mapping HTTP (status codes, body structure)
- La sérialisation de la réponse (types brandés, evidence, detections)
- Le contrat d'erreur (catégories, codes, absence de fuite d'informations)
- La frontière SSRF (validation API vs. crawler)
- La parité Web/Worker

**No code changes to `handler.ts`, `route.ts`, `orchestrator.ts`, or any
production logic.** The API behavior is correct by design. Tests were added
to lock in the contract where coverage was missing:

- Whitespace-only URL → `400 EMPTY_URL`
- Unexpected fields in request body → silently ignored (200)
- All 8 evidence types serialize correctly
- Response has exact shape with no extra fields (no snake_case leakage)

| Metric        | Before | After |
| ------------- | ------ | ----- |
| Tests passed  | 838    | 842   |
| Tests skipped | 9      | 9     |
| Files (madge) | 146    | 146   |
| Circular deps | 0      | 0     |

---

## 2. API Contract (Current)

### Request

```http
POST /api/scans
Content-Type: application/json

{ "url": "https://example.com" }
```

- Body must be valid JSON.
- Must contain a `url` field of type `string`.
- URL must be absolute with `http:` or `https:` scheme.
- Extra fields are silently ignored.

### Response — Success (200)

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
  "detections": [
    {
      "technology": { "id": "nginx", "name": "nginx", "category": "server" },
      "confidence": 80,
      "evidence": [{ "type": "http_header", "name": "Server", "value": "nginx" }]
    }
  ]
}
```

### Response — Domain Failure (200 with `scan.status = "failed"`)

```json
{
  "scan": {
    "id": "scan_uuid",
    "status": "failed",
    "target": "https://example.com/",
    "hostname": "example.com",
    "createdAt": "2025-06-01T11:00:00.000Z",
    "startedAt": null,
    "completedAt": null,
    "failedAt": "2025-06-01T12:00:01.000Z",
    "error": { "code": "timeout", "message": "Request timed out after 10s" }
  },
  "snapshot": null,
  "detections": []
}
```

### Response — Infrastructure Failure (500)

```json
{
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "An internal error occurred."
  }
}
```

### Response — Validation Failure (400)

```json
{
  "error": {
    "code": "MALFORMED_JSON",
    "message": "Request body must be valid JSON."
  }
}
```

---

## 3. Input Validation

### Current behavior

| Condition                  | HTTP | Error code             |
| -------------------------- | ---- | ---------------------- |
| Body is not valid JSON     | 400  | `MALFORMED_JSON`       |
| `url` field is missing     | 400  | `MISSING_URL`          |
| `url` is not a string      | 400  | `INVALID_URL_TYPE`     |
| `url` is empty (`""`)      | 400  | `EMPTY_URL`            |
| `url` is whitespace-only   | 400  | `EMPTY_URL`            |
| `url` is not a valid URL   | 400  | `INVALID_URL`          |
| `url` uses non-http scheme | 400  | `UNSUPPORTED_PROTOCOL` |
| Unexpected fields present  | 200  | (silently ignored)     |

### Validation layers

1. **API layer** (`handler.ts` `validateUrl`): checks JSON validity, URL
   field presence, type, emptiness, scheme. Returns 400 for all invalid
   inputs.
2. **Domain layer** (`createScan`, `createUrl`, `createHostname`,
   `createScanId`): enforces non-emptiness at construction. These guards
   are inside the `executeScan` try/catch → produce 500 on unexpected
   violation.
3. **Crawler layer** (`HttpCrawler.crawl`): validates hostname safety
   (SSRF guard). Returns 200 with `scan.status: "failed"` +
   `error.code: "invalid_target"` for blocked hosts.

### No new validation added

The existing inline validation (JSON.parse + `new URL` + scheme check) is
sufficient. No new validation library introduced. The `@devlens/validation`
package remains an empty stub — it was not needed and was not created.

---

## 4. HTTP Mapping

| Situation                     | HTTP status | Body                                                |
| ----------------------------- | ----------- | --------------------------------------------------- |
| Valid URL + scan success      | 200         | `{ scan, snapshot, detections }`                    |
| Valid URL + crawl failure     | 200         | `{ scan (failed), snapshot: null, detections: [] }` |
| Valid URL + detector error    | 200         | `{ scan (failed), snapshot: null, detections: [] }` |
| Invalid JSON / URL / scheme   | 400         | `{ error: { code, message } }`                      |
| Persistence failure           | 500         | `{ error: { code: "INTERNAL_ERROR", message } }`    |
| Unexpected construction error | 500         | Same as persistence failure (no leak)               |

### Key design decisions

- **Domain failures are NOT HTTP 4xx/5xx**: A scan that fails due to a
  crawl error or detector error returns HTTP 200 with `scan.status = "failed"`
  in the response body. This is intentional — the scan was executed and a
  result was produced. Returning 500 would conflate "the system is broken"
  with "the scan found nothing to crawl."

- **Infrastructure failures ARE HTTP 5xx**: Persistence failures, invalid
  ID generation, or any error that escapes `executeScan`'s domain handling
  is caught by the handler's `try/catch` around `executeScan` and returned
  as 500 with a generic message. Internal details are logged via
  `console.error` but never sent to the client.

- **No error code translation at the HTTP layer**: `ScanError.code` values
  (`timeout`, `network_error`, `too_large`, `invalid_target`,
  `UNKNOWN_ERROR`) are passed through as-is in the 200 response body.
  The 500 response uses a fixed `INTERNAL_ERROR` code.

---

## 5. Response Serialization

### Audit checklist

| Type                                    | Serialized as | OK? | Notes                                |
| --------------------------------------- | ------------- | --- | ------------------------------------ |
| `Timestamp` (branded `string`)          | JSON string   | ✅  | `createTimestamp` → `.toISOString()` |
| `ScanId` (branded `string`)             | JSON string   | ✅  | Just a branded string                |
| `Url` (branded `string`)                | JSON string   | ✅  | Just a branded string                |
| `Hostname` (branded `string`)           | JSON string   | ✅  | Just a branded string                |
| `Confidence` (branded `number`)         | JSON number   | ✅  | Just a branded number                |
| `HttpStatus` (branded `number`)         | JSON number   | ✅  | Just a branded number                |
| `TechnologyCategory` (branded `string`) | JSON string   | ✅  | Just a branded string                |
| `Evidence` (discriminated union)        | JSON object   | ✅  | All fields are strings               |
| `Detection[]`                           | JSON array    | ✅  | `ReadonlyArray` serializes as array  |

### `undefined` in JSON

`JSON.stringify` omits `undefined` values. The `resultToResponse` function
initializes all optional fields to `null` (not `undefined`), so there are
no `undefined` values in the response. ✅

### No internal leakage

The `resultToResponse` function explicitly selects which domain fields to
include in the response. No database row fields (snake_case columns like
`created_at`, `started_at`) are exposed. The response uses camelCase
throughout. ✅

### Evidence serialization verified

All 8 evidence types were tested in the new `serializes all evidence types
correctly` test:

| Evidence type       | Fields                | JSON shape                    |
| ------------------- | --------------------- | ----------------------------- |
| `html`              | `selector`, `snippet` | `{ type, selector, snippet }` |
| `http_header`       | `name`, `value`       | `{ type, name, value }`       |
| `script_url`        | `url` (Url)           | `{ type, url }`               |
| `script_content`    | `snippet`             | `{ type, snippet }`           |
| `meta_tag`          | `name`, `content`     | `{ type, name, content }`     |
| `javascript_global` | `globalName`          | `{ type, globalName }`        |
| `resource`          | `url` (Url)           | `{ type, url }`               |
| `link`              | `url` (Url)           | `{ type, url }`               |

### `startedAt` is `null` for completed/failed scans

The `completed` and `failed` `ScanStatus` variants do not carry a
`startedAt` field (only the `running` variant does). The
`resultToResponse` function only sets `startedAt` for the `running`
case; for `completed`/`failed`, it remains `null`.

This is a **documented behavior**, not a bug. The `ScanStatus` is a
discriminated union by design — each variant carries only the data
relevant to that stage. Fixing this would require changing the domain
model (which is out of scope for this audit — see Deferred Work).

---

## 6. Error Contract

### Error categories (observable by API consumer)

| Category       | HTTP | Error code        | Example                          |
| -------------- | ---- | ----------------- | -------------------------------- |
| Validation     | 400  | Various (see §3)  | `MALFORMED_JSON`, `EMPTY_URL`    |
| Domain failure | 200  | `scan.error.code` | `timeout`, `UNKNOWN_ERROR`       |
| Infrastructure | 500  | `INTERNAL_ERROR`  | Fixed message, no details leaked |

### Error response shapes

**400 — Validation:**

```json
{ "error": { "code": "EMPTY_URL", "message": "The url field must not be empty." } }
```

**200 — Domain failure:**

```json
{ "scan": { "status": "failed", "error": { "code": "timeout", "message": "..." } }, ... }
```

**500 — Infrastructure failure:**

```json
{ "error": { "code": "INTERNAL_ERROR", "message": "An internal error occurred." } }
```

### No information leakage

- **500 responses** never contain the original error message, stack trace,
  SQL error, or any internal detail. The `handler.ts` catch block logs the
  full error via `console.error` (server-side only) and returns a generic
  message.

- **200 with failed scan** includes the `ScanError.code` and `ScanError.message`
  — this is intentional. These are domain-level messages (e.g., "Request
  timed out after 10s") that are meaningful to the client. They do not
  leak implementation details.

- **Stack traces** are never included in any response. The `catch` in
  `handler.ts` does not stringify the error — it returns a fixed object.

### Error code reuse

The API reuses existing domain error codes (`CrawlError.code` →
`ScanError.code` → response `error.code`). No second error-code system
was introduced. ✅

---

## 7. SSRF Boundary

### API layer (scheme validation)

`validateUrl` in `handler.ts` ensures the URL uses `http:` or `https:`.
This blocks `file://`, `ftp://`, `javascript:`, `data:`, etc. at the
entry point.

**Responsibility:** Syntax + scheme validation only. Does NOT validate
hostname safety.

### Crawler layer (host validation)

`HttpCrawler.crawl()` calls `isBlockedHostname()` on every request
(including redirect targets). Blocked:

- `localhost` and `.localhost`
- Private IPv4 ranges (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`)
- Loopback (`127.0.0.0/8`, IPv6 `::1`)
- Link-local (`169.254.0.0/16`, IPv6 `fe80::/10`)
- IPv6 unique-local (`fc00::/7`)
- `0.0.0.0/8`

### Boundary contract

```text
API validation   (scheme: http/https only)
      ↓
ScanTarget       (url + hostname)
      ↓
Crawler security (hostname/IP allowlist + redirect checking)
```

**No duplication:** The API layer does NOT duplicate hostname validation.
A URL that passes API validation (valid `http://` URL) can still be
rejected by the crawler if its hostname resolves to a blocked IP. This
produces a domain failure (HTTP 200, `scan.status: "failed"`,
`error.code: "invalid_target"`).

### Known limitations (documented, not fixed)

1. **DNS rebinding**: The crawler resolves the hostname, checks the IP,
   then fetches. A malicious server could return a public IP during the
   DNS check and a private IP during the actual HTTP request. Requires a
   DNS-pinning fetcher — explicitly deferred ("pas de pseudo-solution DNS
   complexe").
2. **Domain-based metadata endpoints**: Cloud metadata endpoints
   accessible via internal DNS names (e.g., `metadata.google.internal`)
   are not blocked by hostname — only IP-based private ranges are blocked.

---

## 8. Integration Tests

### Tests added (4 new)

| File            | Test                                                      | Coverage gap filled                                                                                                                                                                                    |
| --------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `route.test.ts` | `returns 400 for whitespace-only url`                     | Whitespace-only URL was not tested — `validateUrl` handles it via `rawUrl.trim() === ''`, but no test verified this.                                                                                   |
| `route.test.ts` | `ignores unexpected fields in the request body`           | Extra fields (`foo`, `extra`) were not tested. Verifies they are silently ignored (200 response).                                                                                                      |
| `route.test.ts` | `serializes all evidence types correctly in the response` | Only `http_header` evidence was tested. All 8 evidence types (`html`, `http_header`, `script_url`, `script_content`, `meta_tag`, `javascript_global`, `resource`, `link`) are now verified end-to-end. |
| `route.test.ts` | `response has exact shape with no extra fields`           | No test verified that the response has ONLY the documented fields (no snake_case, no internal domain types, no stacked errors).                                                                        |

### Tests verified (unchanged, already passing)

| File                   | Test                                                                     | Coverage |
| ---------------------- | ------------------------------------------------------------------------ | -------- |
| `route.test.ts`        | All validation tests (malformed JSON, missing URL, etc.)                 | ✅       |
| `route.test.ts`        | Success path (200 with scan/snapshot/detections)                         | ✅       |
| `route.test.ts`        | Domain failure (CrawlError → 200, failed scan)                           | ✅       |
| `route.test.ts`        | Infrastructure failure (persistence → 500, no leak)                      | ✅       |
| `route.test.ts`        | Invalid scan ID generation → 500                                         | ✅       |
| `orchestrator.test.ts` | All runScan scenarios (success, crawl error, detector error, timestamps) | ✅       |
| `execute-scan.test.ts` | executeScan (runScan + persist, failure propagation)                     | ✅       |
| `main.test.ts`         | formatResult + persistence integration                                   | ✅       |

### No excessive mocking

Tests use the real `handleCreateScan` function with mock `Crawler` and
`Detector` implementations. No HTTP mocking, no database mocking, no
NextResponse mocking. The tests verify the actual handler logic with
real dependency injection.

---

## 9. Web/Worker Parity

| Concern              | Web                                           | Worker                         | Same contract                                 |
| -------------------- | --------------------------------------------- | ------------------------------ | --------------------------------------------- |
| detector factory     | `createProductionDetector()`                  | `createProductionDetector()`   | ✅                                            |
| crawler              | `HttpCrawler`                                 | `HttpCrawler`                  | ✅                                            |
| runScan              | via `executeScan` → `runScan`                 | direct `runScan` call          | ✅                                            |
| lifecycle rules      | same domain factories                         | same domain factories          | ✅                                            |
| error translation    | `toScanError` in orchestrator                 | `toScanError` in orchestrator  | ✅                                            |
| persistence          | `PostgresScanResultRepository`                | `PostgresScanResultRepository` | ✅                                            |
| failure response     | HTTP 200 (`scan.status = 'failed'` + `error`) | `formatResult` logs + persist  | ✅ (same domain outcome, different transport) |
| infra error handling | HTTP 500 + generic message                    | `process.exitCode = 1` + log   | ✅ (both log + signal failure)                |
| ScanResult contract  | Identical (`scan`, `snapshot`, `detections`)  | Identical                      | ✅                                            |

### Key finding: Worker doesn't use `executeScan`

The worker calls `runScan` + `persistResult` separately, while the web
handler uses `executeScan` (which composes both). This is **intentional**
— the worker is a CLI tool that logs results (no HTTP response to build),
so it doesn't need the response serialization layer. The lifecycle and
persistence logic is identical in both paths. ✅

### No divergence found

No accidental business logic divergence between Web and Worker. ✅

---

## 10. Architecture Findings

### 10.1 No business logic in the route handler

`route.ts` (47 lines) — does only:

1. `await request.text()` — read body as string
2. `handleCreateScan(body, deps)` — delegate to handler
3. `NextResponse.json(result.body, { status })` — send response

No domain calls, no DB access, no crawler access, no detection logic. ✅

### 10.2 Handler is pure and testable

`handler.ts` — `handleCreateScan` is a pure function:

- Takes `(body: string, options: HandleCreateScanOptions)`
- Returns `{ status: number, body: ... }`
- No Next.js imports
- No `console.log` (only `console.error` for infra errors)
- Fully testable with injected mocks

### 10.3 No DTO framework

The `resultToResponse` function is a simple, explicit mapping from
`ScanResult` to `CreateScanResponse`. No class-transformer, no Zod, no
decorators. The mapping is ~30 lines of straightforward field selection. ✅

### 10.4 No internal type leakage

The `CreateScanResponse` interface is explicitly defined with plain
JSON types (`string`, `number`, `null`, plain objects). No branded types
(`Url`, `Timestamp`, `ScanId`, etc.) appear in the response interface. ✅

### 10.5 No `undefined` in response

All optional fields are initialized to `null` in `resultToResponse`.
`JSON.stringify` would omit `undefined` values, but there are none. ✅

---

## 11. Changes Made

### Tests added (4 new)

| File                                       | Tests added                                                                                |
| ------------------------------------------ | ------------------------------------------------------------------------------------------ |
| `apps/web/src/app/api/scans/route.test.ts` | 4 new tests (whitespace URL, unexpected fields, all evidence types, strict response shape) |

### Docs updated (1 file)

| File                       | Update                                                                                                                          |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `docs/architecture/api.md` | Clarified `completedAt` reflects real completion time; documented `startedAt: null` on completed/failed scans as known behavior |

### No production code changes

The following files were inspected but **not modified** (correct by design):

- `apps/web/src/app/api/scans/route.ts` — thin HTTP adapter, no changes needed
- `apps/web/src/app/api/scans/handler.ts` — pure handler, error mapping correct
- `packages/application/src/orchestrator.ts` — audit complete (timestamp fix from Step 15)
- `packages/application/src/execute-scan.ts` — persistence error propagation correct
- `packages/application/src/repository.ts` — interface definition correct
- `apps/worker/src/main.ts` — no lifecycle logic, correct
- `apps/worker/src/index.ts` — error handler correct

---

## 12. Deferred Findings

| Finding                                          | Reason                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `startedAt` is `null` for completed/failed scans | The `ScanStatus` discriminated union only carries `startedAt` on the `running` variant. The `completed` and `failed` variants only carry their terminal timestamp (`completedAt` / `failedAt`). Fixing this would require changing the domain model to preserve `startedAt` in terminal states — a domain change that is out of scope for this API audit. Documented as known limitation. |
| No OpenAPI specification                         | The API contract is defined in code (`CreateScanResponse` interface) and tested. A formal OpenAPI spec is not necessary for the current scope ("Ne pas créer de système DTO complexe si le modèle actuel est déjà suffisamment stable").                                                                                                                                                  |
| No rate limiting                                 | The API is a single endpoint backed by a crawler + database. Rate limiting is an operational/infra concern (handled by the reverse proxy in production), not an application-layer concern.                                                                                                                                                                                                |
| No request ID / tracing                          | Error logging uses `console.error(error)` without a correlation ID. A tracing header or request ID would improve debuggability but requires changes to the handler/route — deferred ("pas d'observability platform").                                                                                                                                                                     |

---

## 13. Validation Results

All 5 validations pass:

```bash
pnpm typecheck          # ✅ 0 errors, all 10 workspace projects
pnpm test               # ✅ 842 passed, 9 skipped (was 838 → +4 new tests)
pnpm lint               # ✅ ESLint clean, Prettier clean
pnpm build              # ✅ All 10 projects build, Next.js production build OK
npx madge --circular --extensions ts packages apps  # ✅ 146 files, 0 circular deps
```

### Detection engine unchanged

Confirmed: no changes to scoring, fingerprints, evidence types, or
detector pipeline during Step 16. All findings are about the API
contract and integration layer only.
