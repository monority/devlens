# Step 6 — Minimal Scan API — Final Report

## Summary

Implemented `POST /api/scans` as the smallest coherent HTTP API boundary for creating and executing a single scan. The endpoint accepts a URL, validates it at the HTTP boundary, creates a domain `Scan`, executes it through the existing application layer (`executeScan` → `runScan` + `persistResult`), and returns a structured JSON response.

## What was done

### 1. Inspection findings

| Concern                      | Finding                                                                                                                                      |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Web app framework            | Next.js 15.5.0 (App Router) — no new framework introduced                                                                                    |
| Existing routing             | `apps/web/src/app/page.tsx` (static home page), no API routes yet                                                                            |
| Validation infrastructure    | `@devlens/validation` and `@devlens/config` are empty stubs — no established validation library                                              |
| Configuration infrastructure | `createDatabaseClient()` reads `DATABASE_URL` from env — no config abstraction needed                                                        |
| Application layer exports    | `runScan`, `persistResult` (types: `ScanResult`, `ScanResultRepository`)                                                                     |
| Database client construction | `createDatabaseClient()` in `@devlens/database`                                                                                              |
| SSRF guard                   | `isBlockedHostname()` in `packages/crawler/src/ssrf-guard.ts` — blocks localhost, private IPs, link-local, IPv6 ranges, all redirect targets |

### 2. Architecture decisions

#### `handler.ts` + `route.ts` split (technical necessity)

Next.js's App Router type-checks `route.ts` files and rejects any exports that are not HTTP method handlers (`GET`, `POST`, etc.). Exporting `handleCreateScan` from `route.ts` triggered a Next.js build-time type error:

```
Property 'handleCreateScan' is incompatible with index signature.
```

**Solution:** Split the pure handler logic into `handler.ts` (no Next.js dependencies, fully testable) and keep `route.ts` as a thin adapter that only exports `POST`. The `handleCreateScan` function is a pure function — it receives the request body string and injected dependencies, and returns a structured `{ status, body }` result. No Next.js types leak into the handler.

#### Minimal validation (no new framework)

Since `@devlens/validation` is an empty stub and the spec says not to introduce a large validation framework, URL validation uses `JSON.parse` + `new URL()` + scheme check. This covers all required rejection cases:

- Malformed JSON → 400 `MALFORMED_JSON`
- Missing `url` field → 400 `MISSING_URL`
- Non-string `url` → 400 `INVALID_URL_TYPE`
- Empty `url` → 400 `EMPTY_URL`
- Malformed URL → 400 `INVALID_URL`
- Non-http(s) scheme (`ftp://`, `file://`, `javascript:`) → 400 `UNSUPPORTED_PROTOCOL`

#### SSRF boundary

SSRF protection is split across two layers:

1. **HTTP boundary** (`handler.ts`): URL scheme validation (http/https only). Blocks `file://`, `ftp://`, `javascript:`, `data:`, etc. at entry.
2. **Crawler layer** (`HttpCrawler.crawl()` via `isBlockedHostname`): Blocks localhost, `.localhost`, IPv4 private ranges (10/8, 172.16/12, 192.168/16, 127/8, 0/8, 169.254/16), IPv6 loopback, IPv6 link-local (fe80::/10), IPv6 unique-local (fc00::/7), and all redirect targets.

This was verified sufficient — no ad-hoc SSRF solution was introduced. Known limitations (DNS rebinding, domain-based metadata endpoints) are documented in `docs/architecture/api.md`.

### 3. Files created

| File                                                   | Purpose                                                                                               |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| `apps/web/src/app/api/scans/handler.ts`                | Pure handler: URL validation, domain construction, `executeScan` delegation, response mapping         |
| `apps/web/src/app/api/scans/route.ts`                  | Thin Next.js adapter: reads body, constructs deps, calls `handleCreateScan`, returns `NextResponse`   |
| `apps/web/src/app/api/scans/route.test.ts`             | 14 unit tests covering validation, success, domain failure, infrastructure failure                    |
| `apps/web/src/app/api/scans/route.integration.test.ts` | 2 integration tests (skip-guarded without `DATABASE_URL`): real HTTP → example.com, SSRF-blocked host |
| `docs/architecture/api.md`                             | Full API specification, SSRF threat model, architecture rules                                         |
| `packages/application/src/execute-scan.ts`             | `executeScan()` — composes `runScan` + `persistResult`                                                |
| `packages/application/src/execute-scan.test.ts`        | 4 unit tests for `executeScan`                                                                        |

### 4. Files modified

| File                                            | Change                                                                                                                                                |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/application/src/index.ts`             | Added `export { executeScan } from './execute-scan.js'`                                                                                               |
| `apps/web/package.json`                         | Added deps: `@devlens/application`, `@devlens/core`, `@devlens/crawler`, `@devlens/database` + devDep `drizzle-orm` (for integration test migrations) |
| `docs/architecture/overview.md`                 | Added API layer to architecture diagram, web app API section                                                                                          |
| `docs/Step5D.md`                                | Prettier formatting fix (pre-existing)                                                                                                                |
| `packages/application/src/execute-scan.test.ts` | Removed unused `ScanResult` import                                                                                                                    |

### 5. Architectural compliance

- **No business logic in the route.** The route does not call `startScan()`, `completeScan()`, `failScan()`, `repository.save()`, or `HttpCrawler.crawl()` directly. These are encapsulated by `executeScan` → `runScan` + `persistResult`.
- **No new web framework.** Next.js 15 App Router is the existing framework.
- **No new validation framework.** Minimal inline validation using `JSON.parse` + `new URL`.
- **No new configuration system.** `createDatabaseClient()` reads `DATABASE_URL` directly.
- **No extra endpoints.** Only `POST /api/scans` was implemented. No GET/PATCH/DELETE.
- **No authentication, authorization, or rate limiting** (deferred to future steps).
- **Application layer does not import `drizzle-orm` or `@devlens/database`.** Verified by grep.
- **Core remains zero-dependency.** Verified by existing checks.
- **Worker remains functional.** Worker builds and tests pass unchanged.

## Validation results

```
pnpm lint     → ✅ ESLint + Prettier: all files pass
pnpm typecheck → ✅ All 10 projects (0 errors)
pnpm test     → ✅ 149 tests pass (0 skipped with DATABASE_URL, 9 skipped without)
pnpm build    → ✅ All 10 projects build (including Next.js production build)
madge         → ✅ No circular dependencies
```

### Test breakdown

| Test file                                              | Tests   | Status                               |
| ------------------------------------------------------ | ------- | ------------------------------------ |
| `apps/web/src/app/api/scans/route.test.ts`             | 14      | ✅ All pass                          |
| `apps/web/src/app/api/scans/route.integration.test.ts` | 2       | ✅ Pass (with DB), skip (without DB) |
| `packages/application/src/execute-scan.test.ts`        | 4       | ✅ All pass                          |
| `packages/database/src/postgres-repository.test.ts`    | 7       | ✅ Pass (with DB), skip (without DB) |
| All other tests                                        | 122     | ✅ All pass                          |
| **Total**                                              | **149** | **✅ All pass**                      |

### Integration test verification (with real PostgreSQL 16.4)

The integration tests were validated end-to-end against a real PostgreSQL 16.4 instance (port 5433, `devlens_test` database):

1. **Successful scan** — `POST` with `{"url":"https://example.com"}` → `handleCreateScan` → `HttpCrawler.crawl()` (real fetch) → `PostgresScanResultRepository.save()` → PostgreSQL. Response verified (200, scan completed, snapshot with title "Example Domain"). Database rows verified (scans + snapshots tables populated, JSONB headers round-tripped).

2. **SSRF-blocked target** — `POST` with `{"url":"http://localhost:9999"}` → `HttpCrawler` rejects (localhost blocked by `isBlockedHostname`) → `runScan` marks scan as `failed` → `persistResult` saves to PostgreSQL. Response verified (200, scan failed with `invalid_target`, no snapshot). Database rows verified (scan row with `status='failed'`, no snapshot row).

## Key design decisions

### Why `handler.ts` is separate from `route.ts`

Next.js's App Router generates type checks for route handler files and validates that all exports are valid HTTP method handlers. This prevents exporting helper functions from `route.ts`. Moving the pure handler logic to `handler.ts` keeps `route.ts` as a minimal adapter while maintaining testability.

### Why scan construction is inside the `try` block

`createScan()` can throw if `createScanId()` receives an empty string. By placing scan construction inside the `try` block in `handleCreateScan`, unexpected errors during domain construction are caught and returned as `500 INTERNAL_ERROR` rather than crashing the request handler.

### Why crawler errors return 200, not 500

A `CrawlError` (timeout, network error, SSRF block) is a domain outcome — the scan executed but the target was unreachable. This is represented as a `failed` scan in the domain model, and `runScan` handles it by calling `failScan` and returning a `ScanResult` with `snapshot: null`. The result is then persisted normally. Only infrastructure failures (persistence errors, unexpected crashes) return `500`.

### Why `drizzle-orm` is a devDependency of `apps/web`

The integration test runs Drizzle migrations and queries the database directly to verify data persistence. This requires `drizzle-orm` (for `migrate`, `eq`) and `@devlens/database` (for `scans`, `snapshots` schema). These are only used in test code, not in production route handlers.

## Known limitations (documented, not silent compromises)

1. **DNS rebinding**: The `HttpCrawler` resolves hostnames to IPs and checks the IP, but a malicious server could return a public IP during the DNS check and a private IP during the actual HTTP request. A DNS-pinning fetcher would fully mitigate this.
2. **Domain-based metadata endpoints**: Cloud provider metadata endpoints (e.g., `metadata.google.internal`) are not blocked by hostname. Only IP-based private ranges are blocked.
3. **No authentication or rate limiting**: The API is open. These are intentionally deferred to future steps.
