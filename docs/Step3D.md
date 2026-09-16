# DevLens — Step 3D — Worker Execution Boundary

## Context

Step 3C is complete and validated.

The repository now contains:

- `@devlens/core`

  - Domain model
  - `Scan`
  - `ScanStatus`
  - `SiteSnapshot`
  - lifecycle factories:

    - `createScan`
    - `startScan`
    - `completeScan`
    - `failScan`

- `@devlens/crawler`

  - `Crawler` interface
  - `HttpCrawler`
  - `CrawlError`

- `@devlens/application`

  - `runScan(scan, crawler, now)`
  - `ScanResult`
  - lifecycle orchestration
  - `CrawlError` → `ScanError` translation

The current dependency direction is:

```text
apps/web ──────────┐
                   │
apps/worker ───────┤
                   ↓
          @devlens/application
                   ↓
            @devlens/crawler
                   ↓
              @devlens/core
```

Step 3C deliberately did NOT wire the worker.

The current worker is still essentially a placeholder.

---

# Objective

Implement **Step 3D — Worker Execution Boundary**.

The goal is to make `apps/worker` perform a real single-scan execution using the application layer.

The worker must become a very thin runtime entrypoint:

```text
worker
  ↓
create/receive Scan
  ↓
runScan()
  ↓
handle ScanResult
```

This step is about establishing the boundary between the runtime application (`apps/worker`) and the reusable application orchestration (`@devlens/application`).

Do NOT introduce infrastructure that is not required yet.

---

# Core Principle

The worker must contain **runtime wiring**, not business logic.

Business rules remain in:

```text
@devlens/core
@devlens/application
```

The worker is responsible only for:

1. obtaining a scan to execute;
2. constructing the crawler implementation;
3. calling `runScan`;
4. handling/logging the result.

Do not move lifecycle logic into the worker.

The worker must NOT call:

```text
startScan()
completeScan()
failScan()
```

directly.

Those operations belong to `runScan()`.

---

# Scope

## Implement

Wire `apps/worker` to:

```text
@devlens/application
@devlens/core
@devlens/crawler
```

The worker should execute one deterministic scan when started.

Use a simple in-memory/demo scan source for now.

For example, the worker may create a scan from a configured/demo target:

```text
https://example.com
```

or another clearly documented test target.

The exact target is less important than keeping the execution deterministic and explicit.

The execution should be conceptually:

```ts
const scan = createScan(target);
const crawler = new HttpCrawler();

const result = await runScan(scan, crawler);

handleResult(result);
```

---

# Important Architectural Constraint

Do NOT create any of the following:

```text
ScanWorker
ScanProcessor
WorkerService
ScanJob
JobRunner
WorkerOrchestrator
ScanRepository
Repository<T>
Queue
QueueService
RetryService
Clock
WorkerFactory
```

unless inspection of the existing code proves that one is genuinely required.

The worker should remain extremely small.

Prefer direct composition over abstractions.

---

# Worker Responsibilities

The worker may:

### 1. Construct dependencies

For example:

```ts
const crawler = new HttpCrawler();
```

### 2. Obtain a scan

For this step, a hard-coded/demo target or minimal local input is acceptable.

Do NOT create:

- database access;
- HTTP API;
- queue;
- Redis;
- filesystem persistence;
- environment-driven job protocol.

Those belong to later steps.

### 3. Execute

Call:

```ts
runScan(scan, crawler);
```

### 4. Handle the result

The worker may log a minimal structured result.

For example:

```text
scan completed
scan failed
```

The exact logging format should follow existing repository conventions if any exist.

Do not introduce a logging framework.

---

# Error Handling

`runScan()` already translates crawler failures into domain-level `ScanError`.

The worker must therefore NOT duplicate that translation.

The worker should distinguish between:

```text
successful ScanResult
failed ScanResult
unexpected runtime exception
```

A failed scan is a valid application result.

An unexpected exception is a worker/runtime failure.

Do not convert one into the other.

For example:

```ts
const result = await runScan(scan, crawler);

if (result.scan.status.kind === 'completed') {
  // successful execution
}

if (result.scan.status.kind === 'failed') {
  // expected scan failure
}
```

Adapt this to the actual domain types already present in the repository.

Do not invent new status types.

---

# Exit Behavior

Keep process behavior simple.

If the scan succeeds:

- worker completes normally.

If the scan fails through the normal `runScan()` path:

- report the failure;
- do not throw it again merely to simulate infrastructure failure.

If an unexpected runtime exception occurs outside the expected scan lifecycle:

- allow the worker to fail appropriately;
- do not silently swallow it.

Do not add retry behavior.

---

# Testing

Add tests only where they provide meaningful coverage of the worker boundary.

The most important property is:

> the worker delegates scan execution to `runScan()` rather than reimplementing orchestration.

However, avoid creating a complicated mocking architecture just to test a tiny entrypoint.

If the current worker structure makes direct testing awkward, refactor minimally and only when justified.

Do NOT introduce a generic dependency injection framework.

Existing application-layer tests already cover:

- lifecycle transitions;
- crawler invocation;
- error translation;
- immutability;
- preconditions.

Do not duplicate those tests in the worker.

---

# Configuration

Do not introduce a configuration package or generic configuration abstraction.

If the worker needs a target for this step, use the simplest explicit mechanism compatible with the existing repository.

Prefer:

```text
small constant
```

over introducing an abstraction.

If an environment variable is already established by the repository, it may be reused.

Do not create a new configuration system.

---

# Dependency Direction

Preserve:

```text
apps/worker
      ↓
@devlens/application
      ↓
@devlens/crawler
      ↓
@devlens/core
```

The worker may directly depend on `@devlens/core` if it needs `createScan()` to construct the demo scan.

It must NOT cause:

```text
@devlens/core → apps/worker
@devlens/application → apps/worker
@devlens/crawler → apps/worker
```

No dependency cycles.

---

# Package Dependencies

Use existing workspace packages.

Do NOT add external npm dependencies.

Do NOT install:

- BullMQ
- Redis
- Pino
- Winston
- Inversify
- tsyringe
- dependency injection frameworks
- queue libraries
- database clients

No new infrastructure in this step.

---

# Documentation

Update architecture documentation only if necessary.

If documentation is updated, clearly explain:

### Worker boundary

`apps/worker` is currently a thin runtime composition layer.

It:

- obtains a scan;
- constructs runtime dependencies;
- delegates execution to `@devlens/application`;
- handles the returned result.

It does not own domain lifecycle rules.

Explicitly document that queue processing and persistence are intentionally deferred.

Do not create excessive documentation for a tiny change.

---

# What NOT to Implement

Absolutely do NOT implement:

- database persistence;
- `@devlens/database`;
- repositories;
- Redis;
- BullMQ;
- job queues;
- retry logic;
- scheduling;
- cron;
- distributed workers;
- concurrency management;
- rate limiting;
- authentication;
- billing;
- API endpoints;
- dashboard changes;
- multi-page crawling;
- resource crawling;
- analyzer integration;
- detector integration;
- AI;
- Playwright;
- Puppeteer;
- Cheerio;
- JSDOM;
- new external npm dependencies.

This is only the worker execution boundary.

---

# Implementation Process

Before modifying anything:

1. Inspect the existing monorepo structure.
2. Inspect `apps/worker`.
3. Inspect `@devlens/application`.
4. Inspect the existing `createScan()` API and `Scan` type.
5. Inspect existing workspace conventions.
6. Inspect existing test conventions.
7. Determine the smallest possible implementation.

Do not assume APIs that may differ from the report.

Use the actual repository types and exports.

---

# Validation

After implementation, run the complete validation suite:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Also check for circular dependencies if the repository already has a configured command/tool for this.

Verify that:

- all tests pass;
- the worker builds;
- TypeScript passes;
- lint passes;
- no circular dependency was introduced;
- no external dependency was added;
- existing packages were not unnecessarily modified.

If practical, execute the worker once and verify that the real runtime path works:

```text
worker
  ↓
createScan
  ↓
runScan
  ↓
HttpCrawler
  ↓
ScanResult
```

If executing the worker would make an external network request, treat that as a runtime smoke test only and do not make the test suite network-dependent.

---

# Final Report

When finished, provide a concise report containing:

## 1. Objective

What Step 3D implemented.

## 2. Changes

Every modified/created file and why.

## 3. Worker Flow

Show:

```text
input/demo scan
    ↓
createScan
    ↓
runScan
    ↓
HttpCrawler
    ↓
ScanResult
    ↓
worker result handling
```

## 4. Architecture

Show the resulting dependency direction.

## 5. Tests

Report:

- previous test count;
- new test count;
- passing/failing status.

## 6. Validation

Report:

```text
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

and their results.

## 7. Scope Confirmation

Explicitly confirm that the following remain unimplemented:

- persistence;
- queue;
- retries;
- scheduling;
- analyzer;
- detectors;
- AI;
- API;
- dashboard;
- multi-page crawling.

## 8. Remaining Architectural Questions

Mention only genuine concerns discovered during implementation.

Do not invent future work merely to make the report longer.

---

# Definition of Done

Step 3D is complete only if:

- `apps/worker` performs a real scan execution;
- the worker calls `runScan()`;
- lifecycle logic remains inside `@devlens/application`;
- `HttpCrawler` remains inside `@devlens/crawler`;
- domain logic remains inside `@devlens/core`;
- the worker remains thin;
- no queue or persistence infrastructure is introduced;
- no external npm dependency is added;
- tests pass;
- typecheck passes;
- lint passes;
- build passes;
- no circular dependency is introduced.

The desired result is intentionally small.

The architecture should now look like:

```text
                    ┌──────────────────┐
                    │   apps/worker    │
                    │ runtime boundary │
                    └────────┬─────────┘
                             │
                             ▼
                  ┌──────────────────────┐
                  │ @devlens/application │
                  │     runScan()        │
                  └──────────┬───────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │ @devlens/crawler│
                    │   HttpCrawler   │
                    └────────┬────────┘
                             │
                             ▼
                      ┌──────────────┐
                      │ @devlens/core│
                      │ domain model │
                      └──────────────┘
```

**Do not expand the scope beyond this boundary.**
