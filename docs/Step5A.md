# DevLens — Step 5A — Production Persistence Adapter

## Context

Steps 1 → 4 are complete and validated.

Current architecture:

```text
apps/worker
      ↓
@devlens/application
      ↓
@devlens/crawler
      ↓
@devlens/core

apps/worker
      ↓
@devlens/application
      ↓
@devlens/database
```

The persistence boundary introduced in Step 4 is:

```ts
interface ScanResultRepository {
  save(result: ScanResult): Promise<void>;
}
```

The current implementation is:

```text
InMemoryScanResultRepository
```

The worker currently persists scan results into memory and terminates.

There is currently no production database adapter.

---

# Objective

Implement **Step 5A — Production Persistence Adapter**.

The goal is to replace the in-memory persistence implementation used by the worker with a real persistent storage implementation.

The production adapter must implement the existing:

```text
ScanResultRepository
```

contract.

The application and domain layers must remain unaware of the concrete database technology.

---

# CRITICAL RULE — INSPECT FIRST

Before writing any code, inspect the entire repository for existing database decisions.

Search for:

- `supabase`
- `postgres`
- `postgresql`
- `DATABASE_URL`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_ANON_KEY`
- `drizzle`
- `prisma`
- existing migrations
- existing SQL
- existing database schemas
- existing environment configuration
- `@devlens/database`
- documentation mentioning persistence

Inspect:

```text
packages/database
packages/application
packages/core
apps/worker
docs/
package.json
pnpm-workspace.yaml
.env.example files
```

Do not assume the database technology.

If the repository already has a concrete database decision, use it.

If multiple technologies are partially present, determine which one is actually authoritative from the repository rather than choosing based on preference.

---

# Database Technology Decision

If the repository already selected a production database technology:

Use that technology.

Do not introduce a competing ORM or client.

If the repository has NO production database decision:

Do NOT silently choose one.

Instead, stop implementation after the inspection phase and report:

```text
PRODUCTION DATABASE DECISION REQUIRED
```

Then provide a concise comparison of the viable choices based on the current architecture.

Do not implement a speculative production adapter.

This is important because persistence infrastructure is an architectural decision, not a random dependency choice.

---

# If a Production Database Is Already Established

If inspection reveals an established production database, implement the smallest adapter necessary.

For example, if PostgreSQL/Supabase is already explicitly selected:

```text
@devlens/database
    ↓
production adapter
    ↓
PostgreSQL / Supabase
```

The application remains:

```text
@devlens/application
    ↓
ScanResultRepository
```

The dependency direction must remain:

```text
application → contract
database    → contract implementation
```

---

# Adapter Responsibilities

The production adapter is responsible for:

1. mapping domain data to persistence records;
2. inserting/updating the scan;
3. inserting/updating the associated snapshot;
4. maintaining the scan → snapshot relationship;
5. handling database-specific errors;
6. returning/rejecting according to the repository contract.

It must NOT contain:

- scan lifecycle logic;
- crawler logic;
- application orchestration;
- business rules unrelated to persistence.

---

# Database Schema

Design the smallest schema required by the actual domain model.

At minimum determine how to persist:

## Scan

The schema should represent the existing `Scan` model faithfully.

Inspect the actual fields before creating columns.

Do NOT invent fields.

## Scan status

Persist enough information to reconstruct the scan's current state.

Inspect the exact domain representation.

Do not flatten or reinterpret the state arbitrarily.

## Snapshot

Persist the actual `SiteSnapshot` fields.

Inspect the current type before designing the table.

Do NOT assume the snapshot structure from previous reports.

## Relationship

A snapshot belongs to the scan that produced it.

Because `SiteSnapshot` currently has no independent identity, the persistence schema should establish an explicit relationship using the scan identity.

Do not add a domain-level `scanId` to `SiteSnapshot` merely because the database has a foreign key.

Database concerns stay in the adapter.

---

# Identity

Respect the existing domain identity.

If:

```text
Scan.id
```

is the stable domain identity, use it as the persistence key unless the existing database technology makes another approach necessary.

Do not introduce:

```text
DatabaseId
PersistenceId
UUID wrapper
```

into the domain without justification.

---

# Successful Scan

For:

```text
ScanResult {
  scan: completed,
  snapshot: SiteSnapshot
}
```

the adapter must persist:

```text
scan
+
snapshot
```

with their relationship intact.

---

# Failed Scan

For:

```text
ScanResult {
  scan: failed,
  snapshot: null
}
```

the adapter must persist:

```text
scan
```

and must not create a snapshot.

If the persistence model can contain stale snapshots for an existing scan ID, ensure the adapter semantics match the repository contract established in Step 4.

Do not invent additional cleanup behavior without evidence that it is required.

---

# Idempotency

Think carefully about repeated calls:

```text
repository.save(result)
repository.save(result)
```

Determine whether the adapter should:

- insert;
- upsert;
- reject duplicates.

Use the semantics already established by the in-memory implementation and domain identity.

For the current worker architecture, **idempotent persistence is preferable** if naturally supported by the selected database technology.

Do not introduce a distributed idempotency system.

---

# Atomicity

A successful result may require multiple persistence operations:

```text
scan
snapshot
```

These should be persisted consistently.

If the chosen database supports transactions naturally, use a transaction where appropriate.

Do NOT create a generic:

```text
TransactionManager
UnitOfWork
```

abstraction.

Keep transaction handling local to the concrete database adapter.

The application should continue to know only:

```text
ScanResultRepository.save()
```

---

# Error Handling

Database-specific errors must remain infrastructure errors.

Do NOT convert them into:

```text
ScanError
```

A crawler failure is a scan failure.

A database failure is a persistence failure.

Maintain this distinction.

For example:

```text
CrawlError
    ↓
runScan()
    ↓
ScanError
    ↓
failed Scan
```

versus:

```text
DatabaseError
    ↓
repository.save()
    ↓
infrastructure failure
```

The second path must not mutate the domain lifecycle.

---

# Environment Configuration

If the production database requires environment variables:

Use the repository's existing configuration conventions.

If no configuration system exists yet, introduce only the minimal environment access needed by the database adapter.

Do NOT create a full configuration framework.

Do NOT put secrets in source code.

Do NOT commit:

```text
.env
.env.local
database credentials
service-role keys
passwords
```

If useful, update:

```text
.env.example
```

with placeholder variable names only.

---

# Package Dependencies

Only add dependencies required by the already-selected production database technology.

Do not add an ORM merely for convenience.

Do not introduce:

- Prisma
- Drizzle
- TypeORM
- Sequelize
- Supabase
- pg
- postgres.js

unless the repository inspection proves that technology is the selected production approach.

If the existing architecture already uses one, reuse it.

---

# Migrations

If the selected database technology supports migrations, create the minimal migration/schema required for:

```text
scans
snapshots
```

Follow existing migration conventions if present.

Do not build a migration framework.

Do not create seed systems.

Do not add unrelated tables.

---

# In-Memory Adapter

Keep:

```text
InMemoryScanResultRepository
```

for deterministic unit tests.

Do not delete it.

Its role becomes:

```text
unit tests
local lightweight testing
```

while the production adapter becomes:

```text
real worker runtime
```

---

# Worker

Update the worker's runtime composition:

Current:

```text
createScan
    ↓
runScan
    ↓
InMemoryScanResultRepository
    ↓
log
```

Target:

```text
createScan
    ↓
runScan
    ↓
ProductionScanResultRepository
    ↓
log
```

The worker should construct the concrete adapter.

The worker must NOT:

- execute SQL;
- call database APIs directly;
- contain persistence mapping logic;
- manage transactions;
- know table names.

All of that belongs to `@devlens/database`.

---

# Application Layer

Do not make the application layer depend on the concrete database implementation.

It must continue to depend only on:

```text
ScanResultRepository
```

The dependency graph must remain:

```text
apps/worker
      ↓
@devlens/application
      ↓
ScanResultRepository ← @devlens/database
```

No reverse dependency.

---

# Core

`@devlens/core` must remain unchanged unless inspection proves an existing domain problem that makes persistence impossible.

Do not add:

```text
database IDs
ORM decorators
database types
SQL types
Supabase types
serialization concerns
```

Core must remain infrastructure-independent.

---

# Testing Strategy

Use three levels of testing.

## 1. Existing unit tests

All existing tests must continue to pass.

Especially:

```text
@devlens/core
@devlens/crawler
@devlens/application
```

## 2. Production adapter tests

Add tests for the concrete adapter.

If the selected database supports a local/test database, use it.

If a real external database is required, do not make the default `pnpm test` suite depend on credentials or network access.

Use the repository's existing integration-test conventions if present.

At minimum cover:

### Successful persistence

```text
completed Scan + Snapshot
```

### Failed persistence

```text
failed Scan + null snapshot
```

### Repeated persistence

Verify the chosen idempotency/upsert semantics.

### Relationship

Verify the persisted snapshot is associated with the correct scan.

### Error propagation

Verify database failures propagate correctly.

---

# Do Not Fake Integration Tests

Do NOT write tests that claim to test PostgreSQL/Supabase while only mocking the database client.

Unit tests may mock the adapter boundary.

Production adapter tests should test the actual adapter behavior where practical.

If genuine integration testing requires infrastructure unavailable in the repository, document it explicitly rather than pretending the adapter is fully integration-tested.

---

# Worker Smoke Test

If environment credentials are available and the repository already has a supported local/remote database environment, execute the worker once.

Verify:

```text
worker
 ↓
runScan
 ↓
production repository
 ↓
database
```

Do not make the CI/default test suite dependent on an external service.

---

# Documentation

Update:

```text
docs/architecture/persistence.md
docs/architecture/overview.md
```

only where necessary.

Document:

- selected database technology;
- adapter location;
- schema;
- mapping;
- transaction behavior;
- failure semantics;
- environment requirements;
- in-memory vs production implementations.

Keep the architecture documentation factual.

Do not document infrastructure that does not exist.

---

# Scope Restrictions

Do NOT implement:

- queues;
- Redis;
- BullMQ;
- retries;
- scheduling;
- cron;
- distributed workers;
- concurrency control;
- rate limiting;
- authentication;
- billing;
- API;
- dashboard;
- analyzer;
- detectors;
- AI;
- multi-page crawling;
- resource crawling;
- browser rendering;
- generic repository abstractions;
- generic transaction abstractions;
- event bus;
- CQRS;
- event sourcing.

Only production persistence.

---

# Validation

Run:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Also run the repository's circular dependency check.

Verify:

- all tests pass;
- production adapter compiles;
- worker builds;
- core remains dependency-free;
- no circular dependency exists;
- no secrets are committed;
- migration/schema is valid;
- in-memory adapter remains available for unit tests.

If the production database requires an external environment and it is unavailable, clearly distinguish:

```text
unit tests passed
build passed
production integration test not executed
```

Do not claim validation that did not occur.

---

# Final Report

Return a forensic-style final report.

## 1. Database Decision

State exactly what database technology was found or selected and why.

If no technology was previously established and you stopped instead of choosing one, clearly state:

```text
PRODUCTION DATABASE DECISION REQUIRED
```

## 2. Architectural Decision

Explain:

- persistence contract;
- production adapter;
- dependency direction;
- why application/core remain decoupled.

## 3. Schema

Show the actual schema/tables created.

## 4. Mapping

Show:

```text
Domain Scan
    ↓
database record

Domain SiteSnapshot
    ↓
database record
```

## 5. Transaction Semantics

Explain how successful scan + snapshot persistence is handled.

## 6. Error Semantics

Explain scan errors vs persistence errors.

## 7. Changes

List every created/modified file.

## 8. Worker Flow

Show the final runtime flow.

## 9. Dependency Graph

Show the final package dependency graph.

## 10. Tests

Report:

- previous count;
- new count;
- total;
- unit tests;
- integration tests;
- failures.

## 11. Validation

Report:

```text
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

plus circular dependency validation.

## 12. Dependencies

List every dependency added and whether it is:

- external;
- workspace-internal.

## 13. Scope Confirmation

Confirm that queues, retries, scheduling, analyzer, detectors, AI, API and dashboard remain unimplemented.

## 14. Remaining Concerns

Only report real concerns discovered from the implementation.

Do not invent architectural problems.

---

# Definition of Done

Step 5A is complete only if:

- a production database technology was already established OR the agent correctly stopped and requested the architectural decision;
- if established, a real adapter implements `ScanResultRepository`;
- schema/migrations exist where required;
- successful scans persist correctly;
- failed scans persist correctly;
- scan/snapshot relationship is preserved;
- persistence is appropriately atomic;
- database failures propagate as infrastructure failures;
- worker uses the production adapter;
- application does not import the production adapter;
- core remains infrastructure-free;
- in-memory adapter remains available;
- tests pass;
- build passes;
- typecheck passes;
- lint passes;
- circular dependency validation passes;
- no secrets are committed.

---

# Non-Negotiable Principle

Do not turn this step into a general database architecture project.

The required boundary is:

```text
@devlens/application
        │
        │ ScanResultRepository
        ▼
@devlens/database
        │
        ▼
production database
```

The application defines **what it needs**.

The database package defines **how it is persisted**.

The domain defines **what a Scan and SiteSnapshot mean**.

Keep these responsibilities separate.
