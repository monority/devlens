# ADR-001: Use a modular monolith with a separate worker

- **Status:** Accepted
- **Date:** 2025-08-26
- **Deciders:** DevLens team

## Context

In the foundation phase, DevLens must deliver a runnable, testable codebase
while keeping the architecture flexible enough to evolve as the product grows.
We evaluated three options for organizing the codebase at this early stage:

1. **Microservices** — deploy each bounded context (crawling, analysis,
   detection, web UI, worker) as a separate container with its own database
   connection pool and CI pipeline.
2. **Single monolith** — put everything in one deployable unit, including the
   web request handler and the background job processor.
3. **Modular monolith + separate worker** — a single deployable web
   application with internally separated modules (packages), plus a separate
   process for background jobs.

## Decision

We choose **option 3: a modular monolith with a separate worker**.

### Modular monolith

The web application and all shared domain logic live in a single pnpm workspace.
Domain code is organized into packages (`@devlens/core`, `@devlens/crawler`,
`@devlens/detectors`, etc.) with strict dependency-direction rules enforced by
TypeScript path resolution and ESLint.

### Separate worker

The worker is a separate Node.js process (`apps/worker`) that handles long-
running, CPU-intensive, or I/O-heavy jobs (crawling, analysis, detection).
Keeping it in a separate process means:

- The web event loop is never blocked by crawling or analysis work.
- The worker can be scaled independently by running multiple instances.
- Queue-based job dispatch can be added later without changing the web app.

## Consequences

### Positive

- **Single deploy unit for the web app** — no inter-service networking, no
  Docker Compose for development, no distributed tracing overhead.
- **Clean module boundaries** — each `@devlens/*` package has a single
  responsibility and a documented dependency rule. New developers can
  understand the codebase structure quickly.
- **Independent worker scaling** — the worker can be scaled horizontally once
  queue-based dispatching is introduced.
- **Easy to split** — if a module outgrows the monolith, it can be extracted
  into its own microservice with minimal refactoring because dependencies
  already flow in one direction (`web → packages → core`).

### Negative

- **Shared runtime** — the web app and packages share a single Node.js process,
  which limits horizontal scaling of individual modules.
- **Coupling risk** — without discipline, packages can develop circular
  dependencies. This is mitigated by TypeScript project references and the
  dependency rules documented in the root `README.md`.

### Neutral

- When the product outgrows a single process, individual packages can be spun
  off into separate services without architectural upheaval. The dependency-
  direction rules (`web → packages → core`) ensure that the extraction points
  are already well-defined.

## Alternatives considered

### Microservices

At this stage, we do not have enough traffic, team size, or operational
maturity to justify the complexity of per-service deployment, service discovery,
distributed tracing, and separate databases. We would also incur overhead from
inter-service communication (HTTP/gRPC) and duplicated configuration.

### Pure monolith (web + worker in one process

A single process would make it impossible to run the worker on different
machines or scale it independently. It would also couple web request latency
to background job throughput.
