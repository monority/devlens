# DevLens — Step 5B — PostgreSQL + Drizzle Persistence

## Context

Steps 1 → 4 are complete and validated.

Step 5A performed a repository-wide inspection and deliberately stopped because no production database technology had been formally established.

The repository currently contains:

- `@devlens/core`
- `@devlens/crawler`
- `@devlens/application`
- `@devlens/database`
- `apps/worker`

The persistence boundary is already defined:

```ts
interface ScanResultRepository {
  save(result: ScanResult): Promise<void>;
}
```

The current implementation is:

```text
InMemoryScanResultRepository
```

Step 5A identified PostgreSQL + Drizzle as the natural production direction because the existing architecture documentation already references PostgreSQL/Drizzle as the intended future data layer, while no production database implementation currently exists.

## Architectural Decision

For this step, explicitly establish:

> **PostgreSQL is the production database and Drizzle ORM is the database access layer.**

This decision is now intentional and should be reflected in the architecture documentation.

Use:

```text
PostgreSQL
    ↑
Drizzle
    ↑
@devlens/database
    ↑
ScanResultRepository
    ↑
@devlens/application
```

Do NOT introduce Supabase.

Do NOT introduce Prisma.

Do NOT introduce another ORM.

---

# Objective

Implement the first real PostgreSQL persistence adapter for DevLens.

The production adapter must implement the existing:

```text
ScanResultRepository
```

contract.

The result should be:

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
```

The domain and application semantics established in previous steps must remain unchanged.

---

# First: Inspect Existing Repository

Before coding:

Inspect:

```text
packages/core
packages/application
packages/database
apps/worker
docs/architecture
.env.example
package.json
pnpm-workspace.yaml
```

Confirm the actual current shapes of:

- `Scan`
- `ScanStatus`
- `ScanTarget`
- `SiteSnapshot`
- `Timestamp`
- `ScanResult`
- `ScanResultRepository`
- `InMemoryScanResultRepository`

Do not infer fields from previous reports.

Use the actual source code.

---

# Database Package Structure

Keep production persistence inside:

```text
packages/database
```

Use a clear structure.

A reasonable target is:

```text
packages/database/
├── src/
│   ├── index.ts
│   ├── repository.ts
│   ├── schema.ts
│   └── client.ts
└── ...
```

However, do not create files that are unnecessary.

The important separation is:

```text
schema.ts
    ↓
database schema definition

client.ts
    ↓
PostgreSQL / Drizzle connection

repository.ts
    ↓
ScanResultRepository implementation
```

Keep the implementation minimal.

---

# Dependencies

Add only the dependencies genuinely required for PostgreSQL + Drizzle.

Expected production dependencies are conceptually:

```text
drizzle-orm
postgres
```

Use the PostgreSQL driver that best fits the existing Node runtime and repository conventions.

Do not add:

- Prisma
- Supabase
- TypeORM
- Sequelize
- Knex
- Redis
- BullMQ

Add development tooling only if actually required for migrations.

Do not install multiple PostgreSQL drivers.

---

# Database Client

Create the minimal Drizzle/PostgreSQL client.

The client must obtain its connection information from environment configuration.

Use:

```text
DATABASE_URL
```

if compatible with the existing `.env.example`.

Do NOT hard-code credentials.

Do NOT commit secrets.

Do NOT add real credentials to:

```text
.env
.env.local
.env.example
```

`.env.example` may contain:

```text
DATABASE_URL=
```

with an explanatory comment if appropriate.

---

# Environment Validation

Do not create a large configuration framework.

The database client may fail clearly when:

```text
DATABASE_URL
```

is missing.

The error should make it obvious that the production database configuration is missing.

Do not silently fall back to an in-memory repository in production.

Do not mix production and test configuration.

---

# Schema Design

Design the minimal PostgreSQL schema required to persist the existing domain.

Inspect the actual domain types first.

At minimum, determine the persistence representation for:

## scans

The scan table must represent the current `Scan` model.

Likely concepts include:

```text
id
target
status
createdAt
startedAt
completedAt
failedAt
error
```

BUT:

**Do not assume these exact columns.**

Use the actual `Scan` and `ScanStatus` implementation.

Do not invent domain fields.

---

# Status Representation

Determine how the current domain represents:

```text
pending
running
completed
failed
```

Persist enough information to reconstruct the current state.

Prefer a normalized/simple relational representation.

Avoid storing the entire domain object as an opaque JSON blob unless the actual domain model makes relational persistence inappropriate.

Do not lose structured error information.

If the domain contains an error code and message, persist both separately.

---

# Target Representation

Inspect `ScanTarget`.

Determine whether the target is represented as:

```text
string
URL value object
other value object
```

Persist its meaningful value.

Do not leak database-specific types into core.

---

# Snapshot Schema

Inspect the exact `SiteSnapshot` type.

Create the minimal representation necessary to persist it.

A snapshot must be associated with its scan.

Because the current domain model intentionally does not give `SiteSnapshot` an independent domain identity, do not modify `SiteSnapshot` merely to satisfy the database.

The database may use:

```text
scan_id
```

as the snapshot's primary/foreign key if that matches the domain semantics.

Conceptually:

```text
scans
  1
  │
  │
  1
  ↓
snapshots
```

Do not create a many-to-many relationship.

Do not invent snapshot IDs unless technically required by the chosen schema.

---

# Mapping

Keep database mapping inside:

```text
@devlens/database
```

The mapping must not appear in:

```text
@devlens/core
```

or:

```text
@devlens/application
```

The application should continue working with:

```text
Scan
SiteSnapshot
ScanResult
```

not:

```text
ScanRow
SnapshotRow
PgScan
DrizzleScan
```

---

# Repository Implementation

Implement:

```text
PostgresScanResultRepository
```

or an equivalent clearly named production adapter.

It must implement:

```ts
ScanResultRepository;
```

The exact name may follow repository conventions.

Its public API should remain minimal:

```ts
save(result: ScanResult): Promise<void>
```

Do not expose Drizzle from the repository.

Do not expose SQL queries to the application.

---

# Save Semantics

For:

```text
ScanResult {
  scan: completed,
  snapshot: SiteSnapshot
}
```

perform:

```text
upsert scan
+
upsert snapshot
```

For:

```text
ScanResult {
  scan: failed,
  snapshot: null
}
```

perform:

```text
upsert scan
+
ensure no stale snapshot remains
```

The exact SQL should follow the selected schema.

---

# Idempotency

The repository must behave sensibly when:

```text
save(result)
save(result)
```

is called twice for the same scan ID.

Prefer PostgreSQL upsert semantics:

```text
INSERT ... ON CONFLICT DO UPDATE
```

where appropriate.

Do not introduce an external idempotency service.

The domain's existing `ScanId` should remain the primary identity.

---

# Transactions

A completed scan may require:

```text
scan write
snapshot write
```

These writes must be consistent.

Use a Drizzle/PostgreSQL transaction for a completed result if required by the implementation.

Conceptually:

```text
BEGIN
  upsert scan
  upsert snapshot
COMMIT
```

For failed scans:

```text
BEGIN
  upsert scan
  remove stale snapshot if necessary
COMMIT
```

Do not create:

```text
TransactionManager
UnitOfWork
TransactionService
```

The transaction belongs inside the concrete PostgreSQL adapter.

---

# Persistence Errors

Database errors remain infrastructure errors.

Do NOT convert them to:

```text
ScanError
```

The semantics remain:

```text
Crawler failure
    ↓
ScanError
    ↓
failed Scan
```

versus:

```text
PostgreSQL failure
    ↓
repository.save() rejects
    ↓
worker/runtime failure
```

Do not silently swallow database errors.

---

# In-Memory Adapter

Keep:

```text
InMemoryScanResultRepository
```

It remains useful for:

- unit tests;
- deterministic tests;
- application tests;
- local lightweight scenarios.

Do not delete it.

The production worker should now use:

```text
PostgresScanResultRepository
```

rather than:

```text
InMemoryScanResultRepository
```

---

# Worker

Update the worker composition.

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
PostgresScanResultRepository
    ↓
log
```

The worker should construct the production adapter.

It must NOT:

- execute SQL;
- import Drizzle directly;
- know table names;
- perform database mapping;
- manage transactions.

Those responsibilities belong entirely to `@devlens/database`.

---

# Application

Do not modify the application contract unnecessarily.

The application should continue to expose:

```text
ScanResultRepository
persistResult()
runScan()
```

The application must not import:

```text
drizzle-orm
postgres
@devlens/database
```

---

# Core

Do not modify `@devlens/core`.

The core must remain:

```text
zero runtime dependencies
```

and contain no:

```text
SQL
Drizzle
PostgreSQL
database schemas
ORM decorators
database IDs
```

---

# Migrations

Introduce the smallest migration system required by Drizzle.

Create only the schema required for:

```text
scans
snapshots
```

Follow Drizzle's current migration conventions.

Do not create unrelated tables.

Do not create:

- users;
- projects;
- organizations;
- billing;
- audit logs;
- API keys;
- sessions.

Those are future product concerns.

---

# Local Development

Determine whether the repository already has a local PostgreSQL strategy.

If none exists, do NOT automatically introduce Docker unless necessary.

The database implementation may be validated through:

- a developer-provided PostgreSQL instance;
- an existing local PostgreSQL setup;
- an explicitly documented external development database.

If local PostgreSQL infrastructure is needed but does not exist, document the requirement instead of expanding scope into DevOps.

---

# Testing

Maintain the existing deterministic unit suite.

## Unit tests

Keep:

```text
InMemoryScanResultRepository
```

for deterministic tests.

All existing tests must continue passing.

## Production adapter tests

Add integration tests for:

```text
PostgresScanResultRepository
```

only if a PostgreSQL test environment is available through existing repository conventions.

Test at minimum:

### 1. Completed scan

Persist:

```text
Scan
+
Snapshot
```

Verify both exist.

### 2. Failed scan

Persist:

```text
failed Scan
```

Verify:

```text
no snapshot
```

### 3. Relationship

Verify the snapshot belongs to the correct scan.

### 4. Idempotency

Save the same result twice.

Verify no duplicate scan/snapshot records are created.

### 5. Update

Persist a result for an existing scan ID and verify the new state replaces the old persisted state correctly.

### 6. Persistence failure

Verify database errors propagate.

Do not claim PostgreSQL integration tests passed if no PostgreSQL instance was actually used.

---

# Test Infrastructure

Do not introduce:

```text
Testcontainers
Docker Compose
local database orchestration
```

unless the repository already uses such infrastructure or it is genuinely necessary and explicitly justified.

Do not make:

```text
pnpm test
```

depend on a developer's personal PostgreSQL instance.

If integration tests require:

```text
DATABASE_URL
```

separate them appropriately from deterministic unit tests according to the existing test conventions.

---

# Worker Smoke Test

If a valid PostgreSQL `DATABASE_URL` is available:

Run the worker once.

Verify:

```text
worker
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

Then verify the resulting records exist in PostgreSQL.

If no database is available:

Do not fake the smoke test.

Report:

```text
Production database smoke test not executed:
DATABASE_URL unavailable.
```

---

# Documentation

Update:

```text
docs/architecture/overview.md
docs/architecture/persistence.md
```

The documentation must now state explicitly:

```text
Production database: PostgreSQL
Database access: Drizzle ORM
```

Document:

- why PostgreSQL was selected;
- why Drizzle was selected;
- schema;
- repository boundary;
- mapping;
- transaction semantics;
- error semantics;
- environment configuration;
- in-memory vs production adapter.

Remove or update any wording that still says:

```text
database decision pending
```

The architecture must no longer imply that PostgreSQL/Drizzle is merely aspirational.

---

# Security

Do not commit credentials.

Do not log:

```text
DATABASE_URL
password
connection string
credentials
```

Do not expose database credentials through worker logs.

Use parameterized Drizzle queries.

Do not construct SQL by string concatenation with user-controlled values.

---

# Scope Restrictions

Do NOT implement:

- Supabase;
- authentication;
- users;
- organizations;
- billing;
- Redis;
- BullMQ;
- queues;
- retries;
- scheduling;
- cron;
- distributed workers;
- concurrency control;
- rate limiting;
- API;
- dashboard;
- analyzer;
- detectors;
- AI;
- multi-page crawling;
- resource crawling;
- browser rendering;
- generic repositories;
- generic transaction abstractions;
- CQRS;
- event sourcing;
- event bus.

Only implement:

> PostgreSQL + Drizzle persistence for the existing `ScanResultRepository`.

---

# Validation

Run:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Also run the existing circular dependency check.

Verify:

- all existing tests pass;
- new tests pass;
- production adapter builds;
- worker builds;
- core remains dependency-free;
- no circular dependency exists;
- no secrets are committed;
- migrations are valid;
- in-memory adapter remains available;
- application has no database implementation dependency.

If PostgreSQL is unavailable, clearly distinguish:

```text
unit tests: passed
build: passed
typecheck: passed
lint: passed
PostgreSQL integration tests: not executed
```

Do not claim otherwise.

---

# Final Report

Return a forensic-style report.

## 1. Database Decision

Explicitly state:

```text
PostgreSQL
Drizzle ORM
```

and explain why this was chosen.

## 2. Architectural Decision

Explain:

- `ScanResultRepository`;
- production adapter;
- dependency inversion;
- separation between application and infrastructure.

## 3. Dependencies

List every dependency added.

Separate:

```text
runtime
development
workspace
```

dependencies.

## 4. Schema

Show the actual PostgreSQL tables and important constraints.

## 5. Mapping

Show the actual domain → database mapping.

## 6. Transactions

Explain exactly how completed and failed results are persisted atomically.

## 7. Idempotency

Explain the upsert behavior.

## 8. Error Semantics

Explain:

```text
CrawlError → ScanError
Database error → infrastructure failure
```

## 9. Worker Flow

Show:

```text
createScan
    ↓
runScan
    ↓
PostgresScanResultRepository
    ↓
PostgreSQL
```

## 10. Changes

List every created/modified file.

## 11. Tests

Report:

- previous test count;
- new test count;
- total;
- unit tests;
- integration tests;
- failures.

## 12. Validation

Report:

```text
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

plus circular dependency validation.

## 13. Database Smoke Test

State whether a real PostgreSQL connection was tested.

Do not claim success without actually connecting.

## 14. Scope Confirmation

Confirm that queues, Redis, retries, scheduling, API, dashboard, analyzer, detectors, AI and authentication remain unimplemented.

## 15. Remaining Concerns

Only report real issues discovered during implementation.

---

# Definition of Done

Step 5B is complete only if:

- PostgreSQL is explicitly established as the production database;
- Drizzle is explicitly established as the database access layer;
- a real PostgreSQL adapter implements `ScanResultRepository`;
- the schema exists;
- migrations exist where required;
- completed scans persist with snapshots;
- failed scans persist without snapshots;
- scan/snapshot relationship is preserved;
- writes are appropriately transactional;
- persistence is idempotent;
- database errors propagate correctly;
- worker uses the production adapter;
- application does not import database implementation;
- core remains infrastructure-free;
- in-memory adapter remains available;
- tests pass;
- build passes;
- typecheck passes;
- lint passes;
- circular dependency validation passes;
- no credentials are committed.

---

# Non-Negotiable Principle

This is a persistence implementation step, not a general infrastructure step.

The final boundary must remain:

```text
                 @devlens/application
                         │
                         │
              ScanResultRepository
                         │
                         ▲
                         │
                 @devlens/database
                         │
                         ▼
                      Drizzle
                         │
                         ▼
                    PostgreSQL
```

The application defines **what it needs**.

The database package defines **how it is persisted**.

The domain defines **what the data means**.

Do not allow PostgreSQL or Drizzle types to leak into `@devlens/application` or `@devlens/core`.
