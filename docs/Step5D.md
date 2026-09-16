# DevLens — Step 6 — Minimal Scan API

## Context

Steps 1 → 5C are complete.

The current architecture is:

```text
apps/worker
      ↓
@devlens/application
      ↓
ScanResultRepository
      ↑
@devlens/database
      ↓
Drizzle
      ↓
PostgreSQL

@devlens/crawler
      ↓
@devlens/core
```

The following capabilities now exist:

- domain scan lifecycle;
- HTTP crawling;
- application orchestration through `runScan()`;
- `ScanResultRepository`;
- PostgreSQL persistence through Drizzle;
- in-memory repository for deterministic tests;
- real PostgreSQL integration validation;
- worker end-to-end execution.

The current worker still uses a hard-coded demo scan.

The next architectural increment is to expose the existing scan capability through a minimal HTTP API.

---

# Objective

Implement the **smallest coherent HTTP API boundary** for creating and executing a single scan.

The API must:

1. accept a target URL;
2. validate the request at the HTTP boundary;
3. create a domain `Scan`;
4. execute it through the existing application layer;
5. persist the resulting `ScanResult`;
6. return a structured HTTP response.

The API must NOT implement domain lifecycle logic.

---

# CRITICAL ARCHITECTURAL RULE

Do not put business logic directly in the HTTP route.

The route/controller is an adapter.

It should translate:

```text
HTTP request
    ↓
application use case
    ↓
domain + crawler + persistence
```

The HTTP layer must not directly call:

```text
startScan()
completeScan()
failScan()
repository.save()
HttpCrawler.crawl()
```

unless those calls are already encapsulated by an existing application operation.

---

# First: Inspect Repository

Before coding, inspect:

```text
apps/web
apps/worker
packages/application
packages/core
packages/crawler
packages/database
packages/validation
packages/config
docs/architecture
package.json
pnpm-workspace.yaml
```

Determine:

- current framework/runtime of `apps/web`;
- existing routing;
- existing API conventions;
- whether validation infrastructure already exists;
- whether `@devlens/validation` already contains useful primitives;
- whether `@devlens/config` already exposes environment configuration;
- current application exports;
- current database client construction.

Do not introduce a second web framework.

Do not create duplicate validation/configuration systems if existing packages already provide them.

---

# API Scope

Create exactly one minimal endpoint:

```http
POST /api/scans
```

Request:

```json
{
  "url": "https://example.com"
}
```

No additional fields.

Do not implement:

```text
GET /api/scans
GET /api/scans/:id
DELETE /api/scans/:id
PATCH /api/scans/:id
```

Those belong to future steps.

---

# Request Validation

Validate at the HTTP boundary.

The request must:

- be valid JSON;
- contain `url`;
- have `url` as a string;
- represent an absolute HTTP or HTTPS URL.

Reject:

```text
ftp://
file://
javascript:
relative URLs
missing url
non-string url
malformed URLs
```

Use existing validation infrastructure if the repository already provides it.

If no validation library is currently established, do not immediately introduce a large validation framework.

Use the smallest appropriate mechanism.

---

# SSRF / Network Safety

The endpoint ultimately causes the server to fetch a user-provided URL.

Therefore, do not treat URL validation as merely syntactic validation.

Inspect the existing `HttpCrawler` security behavior.

Determine whether it already protects against:

- localhost;
- loopback addresses;
- private IP ranges;
- link-local addresses;
- metadata endpoints;
- redirects into private networks.

If the crawler does NOT provide sufficient SSRF protection, do not silently expose an unsafe endpoint.

In that case:

```text
API IMPLEMENTATION BLOCKED — SSRF BOUNDARY INSUFFICIENT
```

and report exactly what protection is missing.

Do not implement an ad-hoc partial SSRF solution without understanding redirect and DNS behavior.

This endpoint must not become an SSRF vulnerability.

---

# Application Layer

The API needs an application operation that represents:

```text
create scan
    ↓
run scan
    ↓
persist result
```

Inspect whether the existing application API can already express this composition cleanly.

If it cannot, introduce the smallest possible application-level use case.

Do NOT create:

```text
ScanService
ScanManager
ScanController
ScanOrchestrator
ApplicationService
UseCaseFactory
```

unless a concrete need exists.

Prefer a small function.

For example, conceptually:

```ts
executeScan(scan, crawler, repository);
```

But use naming consistent with the actual existing code.

The operation should compose:

```text
runScan()
persistResult()
```

without duplicating their internal logic.

---

# Scan ID

Determine how the current domain creates `ScanId`.

Do not invent a second ID-generation mechanism.

The API should use the existing domain identity creation mechanism.

Inspect `createScan()` and existing value-object factories first.

Do not introduce database-generated IDs into the domain unless the existing model requires it.

---

# Timestamp

Do not introduce a `Clock` abstraction.

Respect the existing timestamp approach from previous steps.

If the existing application operation accepts a `Date`, preserve that design.

Do not refactor timestamp handling as part of this step.

---

# Crawler

Use the existing:

```text
HttpCrawler
```

implementation.

Do not introduce:

- Playwright;
- Puppeteer;
- browser automation;
- Cheerio;
- JSDOM.

The API must use the existing crawler boundary.

---

# Persistence

Use the existing:

```text
PostgresScanResultRepository
```

through the existing:

```text
ScanResultRepository
```

application contract.

The API route must not know SQL, Drizzle, table names, or persistence mappings.

The dependency direction must remain:

```text
apps/web
    ↓
@devlens/application
    ↓
contracts
    ↑
@devlens/database
```

---

# HTTP Response

For a successful scan:

```http
200 OK
```

Return a structured JSON response containing the useful scan result.

Do not expose internal database rows.

Prefer a response based on domain/application data, for example:

```json
{
  "scan": {
    "id": "scan_x",
    "status": "completed",
    "target": "https://example.com",
    "createdAt": "...",
    "completedAt": "..."
  },
  "snapshot": {
    "...": "..."
  }
}
```

But inspect the actual domain types and return only fields that genuinely exist.

Do not invent response fields.

---

# Failed Scan

A crawler failure is an expected domain outcome.

If:

```text
runScan()
    ↓
CrawlError
```

and the application converts it to:

```text
ScanError
```

the API should return a structured failure response.

Use an appropriate HTTP status, but do not confuse:

```text
scan failed
```

with:

```text
server infrastructure failure
```

For example, a failed target fetch may reasonably map to a client-facing `4xx` or domain-specific response depending on the existing semantics.

Choose deliberately and document the choice.

The persisted scan must remain:

```text
status = failed
```

---

# Persistence Failure

A PostgreSQL failure is NOT a scan failure.

If:

```text
repository.save()
```

fails:

- do not convert it into `ScanError`;
- do not return a fake completed/failed scan;
- allow the infrastructure error to reach the HTTP error boundary;
- return an appropriate `5xx` response;
- do not leak connection strings, SQL, stack traces, or credentials.

This distinction must remain:

```text
Crawler failure
    ↓
domain ScanError
    ↓
failed scan
```

versus:

```text
Database failure
    ↓
infrastructure error
    ↓
HTTP 5xx
```

---

# HTTP Error Handling

Create the smallest HTTP error boundary necessary.

At minimum distinguish:

| Situation                                     | HTTP result                  |
| --------------------------------------------- | ---------------------------- |
| malformed JSON                                | `400`                        |
| invalid URL                                   | `400`                        |
| unsupported URL scheme                        | `400`                        |
| successful scan                               | `200`                        |
| scan domain failure                           | deliberate documented status |
| unexpected application/infrastructure failure | `500`                        |

Do not expose internal errors directly to clients.

Return stable JSON error structures.

For example:

```json
{
  "error": {
    "code": "INVALID_URL",
    "message": "The URL must be an absolute HTTP or HTTPS URL."
  }
}
```

Use actual error codes consistently.

Do not create a giant global error hierarchy.

---

# API Runtime

Use the existing `apps/web` runtime.

Do not create a new server application.

Do not introduce Express/Fastify/Hono/etc. if the web application already has an HTTP-capable framework.

The endpoint should live naturally within the existing web app.

---

# Dependency Rules

`apps/web` may depend on:

```text
@devlens/application
@devlens/core
@devlens/crawler
@devlens/database
```

only where genuinely necessary.

Prefer minimizing direct dependencies.

Ideally:

```text
apps/web
    ↓
@devlens/application
@devlens/database
```

while concrete construction happens at the application boundary.

Do not make:

```text
@devlens/core
```

depend on the web layer.

Do not make:

```text
@devlens/application
```

depend on `apps/web`.

---

# Database Client Lifecycle

Inspect how `createDatabaseClient()` currently behaves.

Avoid creating a new PostgreSQL connection pool for every HTTP request if the runtime allows connection reuse.

Use the existing database client conventions.

Do not introduce a global framework-specific singleton abstraction unless necessary.

Do not over-engineer connection lifecycle in this step.

---

# Testing

Tests must be divided between deterministic HTTP/application behavior and database integration.

## HTTP unit tests

At minimum test:

1. valid request;
2. missing `url`;
3. non-string `url`;
4. malformed URL;
5. unsupported protocol;
6. crawler/domain failure;
7. persistence failure;
8. malformed JSON if the framework allows clean testing;
9. successful response shape.

Use mocks/fakes where appropriate for application-level isolation.

Do not mock PostgreSQL while claiming to test PostgreSQL.

---

# Integration Test

If the existing PostgreSQL integration environment can be reused, add at least one end-to-end API integration test:

```text
HTTP POST
    ↓
API
    ↓
createScan
    ↓
runScan
    ↓
HttpCrawler
    ↓
PostgresScanResultRepository
    ↓
PostgreSQL
```

Use a deterministic publicly accessible target only if the repository's existing testing policy permits network integration.

Prefer a test fixture/server if one already exists.

Do not make the default unit test suite depend on arbitrary external websites.

If real API + PostgreSQL integration cannot be executed in the current environment, state this explicitly.

---

# Worker

Do not remove or redesign the worker.

The worker remains valid as a runtime consumer of the application layer.

The API is simply a second entrypoint:

```text
apps/worker ──┐
              ├──> @devlens/application
apps/web ─────┘
```

Both should reuse the same application behavior.

Do not duplicate scan lifecycle logic in `apps/web`.

---

# Documentation

Update:

```text
docs/architecture/overview.md
```

and create/update an API architecture document only if appropriate.

Document:

- endpoint;
- request contract;
- response contract;
- validation boundary;
- SSRF boundary;
- application delegation;
- persistence behavior;
- error semantics.

Do not document future endpoints.

---

# Security Restrictions

This step must not introduce:

- authentication;
- authorization;
- API keys;
- billing;
- rate limiting;
- user accounts.

However, **SSRF protection is mandatory** because the endpoint accepts arbitrary URLs for server-side fetching.

Do not expose unrestricted server-side URL fetching.

---

# Scope Restrictions

Do NOT implement:

- authentication;
- users;
- organizations;
- billing;
- dashboard;
- scan history;
- GET scan endpoint;
- queues;
- Redis;
- BullMQ;
- retries;
- scheduling;
- cron;
- distributed workers;
- analyzer;
- detectors;
- AI;
- multi-page crawling;
- resource crawling;
- browser rendering;
- generic controllers;
- generic API frameworks;
- CQRS;
- event sourcing.

Only implement:

> A minimal safe HTTP entrypoint for the existing single-scan use case.

---

# Validation

Run:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Also run the existing circular dependency validation.

If possible, execute a real request against the development server:

```http
POST /api/scans
```

with:

```json
{
  "url": "https://example.com"
}
```

Verify:

```text
HTTP request
    ↓
scan execution
    ↓
PostgreSQL persistence
```

Then verify the corresponding database rows.

Do not claim end-to-end success unless it was actually executed.

---

# Final Report

Return a forensic-style final report containing:

## 1. Objective

What was implemented.

## 2. API Contract

Exact endpoint, request and response.

## 3. Validation

What is validated and where.

## 4. SSRF Security

Explain the protection actually provided by the existing crawler/API boundary.

## 5. Application Flow

Show:

```text
HTTP
 ↓
application operation
 ↓
runScan
 ↓
persistResult
 ↓
PostgreSQL
```

## 6. Error Semantics

Clearly distinguish:

```text
invalid request
crawler/domain failure
database/infrastructure failure
```

## 7. Changes

List every created/modified file.

## 8. Dependency Graph

Show the final graph.

## 9. Tests

Report:

- previous count;
- new count;
- total;
- unit tests;
- integration tests;
- failures/skips.

## 10. Validation

Report:

```text
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

plus circular dependency validation.

## 11. End-to-End Evidence

State whether a real HTTP request reached PostgreSQL.

## 12. Scope Confirmation

Confirm that authentication, queues, dashboard, analyzer, detectors, AI and scan history remain unimplemented.

## 13. Remaining Concerns

Only report real issues discovered during implementation.

---

# Definition of Done

Step 6 is complete only if:

- `POST /api/scans` exists;
- request validation works;
- SSRF safety is verified before exposing arbitrary URL fetching;
- the endpoint uses the existing application layer;
- scan lifecycle logic is not duplicated in the web app;
- existing crawler is reused;
- existing PostgreSQL repository is reused;
- successful scans are persisted;
- failed scans are represented correctly;
- database failures remain infrastructure failures;
- internal errors are not leaked;
- worker remains functional;
- core remains infrastructure-free;
- tests pass;
- build passes;
- typecheck passes;
- lint passes;
- circular dependency validation passes.

# Non-Negotiable Principle

The API is an **entrypoint**, not a new business layer.

The architecture must remain:

```text
                  ┌───────────────┐
                  │   apps/web    │
                  │ HTTP boundary │
                  └───────┬───────┘
                          │
                          ▼
                ┌──────────────────────┐
                │ @devlens/application │
                │ existing scan flow   │
                └───────┬──────────────┘
                        │
              ┌─────────┴─────────┐
              ▼                   ▼
      @devlens/crawler     ScanResultRepository
                                  │
                                  ▼
                         @devlens/database
                                  │
                                  ▼
                             PostgreSQL
```

Do not duplicate business logic.

Do not weaken the SSRF boundary.

Do not turn this step into a complete API architecture.

Implement only the smallest safe HTTP entrypoint for the scan capability that already exists.
