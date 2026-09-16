DEVLENS — STEP 5C
POSTGRESQL RUNTIME VALIDATION & WORKER PERSISTENCE INTEGRATION

You are continuing the DevLens repository after the completion of Step 5B.

IMPORTANT:
Step 5B is already implemented.

Do NOT redesign the architecture.
Do NOT introduce new infrastructure.
Do NOT expand the product scope.

Your task is to validate the PostgreSQL persistence layer against a real PostgreSQL instance and verify that the worker persists ScanResult correctly at runtime.

==================================================

1. CURRENT STATE
   \==================================================

DevLens currently has:

- @devlens/core
- @devlens/application
- @devlens/crawler
- @devlens/database
- apps/worker

The persistence architecture is:

@devlens/application
defines ScanResultRepository
↑
@devlens/database
implements it
├── InMemoryScanResultRepository
└── PostgresScanResultRepository
↓
Drizzle
↓
PostgreSQL

The worker depends only on:

@devlens/database

The worker MUST NOT import:

- drizzle-orm
- postgres

@devlens/application MUST NOT import:

- @devlens/database
- drizzle-orm
- postgres

@devlens/core MUST remain free of runtime dependencies.

================================================== 2. STEP 5B IMPLEMENTATION
==================================================

Step 5B introduced:

packages/database/src/schema.ts
packages/database/src/client.ts
packages/database/src/postgres-repository.ts
packages/database/src/postgres-repository.test.ts
packages/database/drizzle.config.ts
packages/database/drizzle/0000_opposite_doctor_spectrum.sql
packages/database/drizzle/meta/_journal.json
packages/database/drizzle/meta/0000_snapshot.json

And modified:

packages/database/src/index.ts
packages/database/package.json
apps/worker/src/main.ts
docs/architecture/persistence.md
docs/architecture/overview.md
README.md
.env.example
.prettierignore

Production database:

PostgreSQL

Database access:

Drizzle ORM + postgres.js

Current static validation:

pnpm lint → PASS
pnpm typecheck → PASS
pnpm test → 122 passed, 7 skipped
pnpm build → PASS
madge --circular → PASS
core runtime dependencies → 0

The 7 PostgreSQL integration tests are currently skip-guarded because DATABASE_URL is unavailable.

================================================== 3. OBJECTIVE
==================================================

Step 5C has ONE primary objective:

PROVE THAT THE EXISTING POSTGRESQL PERSISTENCE IMPLEMENTATION WORKS AGAINST A REAL POSTGRESQL DATABASE.

This is a runtime validation step.

Do not use mocks to claim PostgreSQL validation.

Do not fake database results.

Do not weaken or remove the integration tests just to make them pass.

If PostgreSQL cannot be made available in the current environment, report the limitation honestly.

================================================== 4. DATABASE ENVIRONMENT
==================================================

First inspect the repository and current environment.

Determine whether PostgreSQL is already available locally.

Check for:

- existing PostgreSQL installation
- Docker
- Docker Compose
- existing database configuration
- DATABASE_URL
- existing development infrastructure
- existing scripts that could provide PostgreSQL

Prefer using an existing environment if available.

If Docker is available and there is no existing PostgreSQL instance, you MAY create a minimal temporary PostgreSQL development environment.

Do NOT introduce permanent infrastructure into the application architecture.

Do NOT add:

- Redis
- queues
- BullMQ
- Supabase
- Kubernetes
- cloud infrastructure
- authentication
- API
- dashboard
- monitoring infrastructure

If a temporary Docker PostgreSQL container is used, keep it strictly as a local validation mechanism.

================================================== 5. DATABASE_URL
==================================================

Use the repository's existing DATABASE_URL contract.

Do not invent a new configuration abstraction.

Do not hardcode credentials in source files.

Do not commit secrets.

If a local PostgreSQL instance is used, configure DATABASE_URL through the environment.

Verify that:

.env.example

documents the expected variable without containing credentials.

================================================== 6. MIGRATION
==================================================

Use the existing Drizzle migration.

Run the repository's existing migration command:

pnpm --filter @devlens/database db:migrate

Do not manually rewrite the migration unless a genuine migration defect is discovered.

Verify that the migration creates:

scans
snapshots

with the expected schema.

Expected scans columns:

- id
- url
- hostname
- status
- created_at
- started_at
- completed_at
- failed_at
- error_code
- error_message

Expected snapshots columns:

- scan_id
- url
- hostname
- captured_at
- http_status_code
- http_content_type
- http_final_url
- html_title
- html_description
- headers
- resources

Verify the foreign key:

snapshots.scan_id
→ scans.id
ON DELETE CASCADE

================================================== 7. RUN THE EXISTING INTEGRATION TESTS
==================================================

Enable DATABASE_URL.

Run the existing integration tests.

Do NOT modify tests simply to make them execute.

The following 7 scenarios must execute against real PostgreSQL:

1. Completed scan with snapshot persistence
2. Failed scan without snapshot
3. Snapshot FK relationship
4. Idempotency
5. Snapshot deletion after completed → failed transition
6. JSONB preservation
7. Database/infrastructure error propagation

Expected behavior:

Completed scan:

scans row exists +
snapshots row exists

Failed scan:

scans row exists +
snapshots row does not exist

Idempotency:

saving the same ScanResult twice
must not create duplicate rows.

Transition:

completed
→
failed

must remove the snapshot.

JSONB:

headers and resources
must round-trip without corruption.

Infrastructure errors:

must propagate.

They must NOT become ScanError.

================================================== 8. TRANSACTION VALIDATION
==================================================

Do not merely test successful writes.

Inspect the repository implementation and determine whether transaction atomicity can be meaningfully validated.

The invariant is:

A ScanResult persistence operation is atomic.

For completed results:

scan write + snapshot write

must succeed or fail together.

For failed results:

scan write + snapshot deletion

must succeed or fail together.

If the current implementation does not expose a clean way to force a mid-transaction failure without modifying production code purely for testing, do NOT introduce artificial production hooks.

Instead:

- document that transaction usage is verified statically
- verify successful transaction behavior against PostgreSQL
- verify database errors propagate
- explain whether full rollback behavior was dynamically exercised

Do not claim rollback was runtime-tested if it was not.

================================================== 9. WORKER END-TO-END VALIDATION
==================================================

After repository-level integration tests pass, validate the actual worker path.

The worker should continue to follow:

createScan()
↓
runScan()
↓
HttpCrawler
↓
completeScan() / failScan()
↓
persistResult(result, repository)
↓
PostgresScanResultRepository.save()
↓
PostgreSQL

The worker must NOT perform SQL itself.

The worker must NOT import:

drizzle-orm
postgres

Verify this with source inspection.

If the worker has an existing executable/testable flow, run it using the existing project conventions.

Do not redesign the worker merely to make it easier to test.

================================================== 10. DATABASE CLEANUP
==================================================

Integration tests must not leave uncontrolled junk in the database.

Use one of the following approaches depending on the existing test architecture:

- deterministic test IDs + cleanup
- transaction rollback
- explicit cleanup
- isolated temporary database

Prefer the smallest approach consistent with the existing architecture.

Do NOT add a generic database testing framework.

Do NOT create a production abstraction solely for tests.

================================================== 11. ARCHITECTURAL CHECKS
==================================================

Re-run:

pnpm lint
pnpm typecheck
pnpm test
pnpm build

Also verify:

madge --circular

And verify dependency boundaries:

@devlens/core
→ zero runtime dependencies

@devlens/application
→ no database/infrastructure dependency

apps/worker
→ no direct drizzle-orm dependency
→ no direct postgres dependency

The worker may depend on:

@devlens/database

The database package may depend on:

@devlens/core
@devlens/application
drizzle-orm
postgres

================================================== 12. DO NOT CHANGE
==================================================

Unless a genuine defect blocks runtime validation, do NOT modify:

- ScanResultRepository contract
- Scan domain model
- ScanResult domain model
- crawler behavior
- application use cases
- core architecture
- dependency direction
- database schema
- worker architecture
- public APIs

Do NOT introduce:

- API
- HTTP server
- REST
- GraphQL
- authentication
- users
- dashboard
- Redis
- queues
- BullMQ
- retries
- scheduling
- rate limiting
- distributed workers
- concurrency control
- AI
- detectors
- analyzer
- multi-page crawling
- resource crawling
- browser rendering
- CQRS
- event sourcing
- event bus
- generic repository abstractions

Step 5C is validation, not feature expansion.

================================================== 13. IF A DEFECT IS FOUND
==================================================

If runtime validation reveals a genuine defect in the Step 5B implementation:

1. Identify the exact defect.
2. Explain why it violates the existing contract.
3. Make the smallest possible correction.
4. Do not redesign unrelated code.
5. Add or update a focused test if necessary.
6. Re-run all validation commands.

Do not hide defects by weakening assertions.

Do not convert integration tests back into skipped tests.

Do not replace PostgreSQL with mocks.

================================================== 14. SUCCESS CRITERIA
==================================================

Step 5C is successful only if:

[ ] A real PostgreSQL instance is available
[ ] DATABASE_URL is configured through the environment
[ ] Existing Drizzle migration applies successfully
[ ] scans table exists correctly
[ ] snapshots table exists correctly
[ ] FK relationship is verified
[ ] 7 PostgreSQL integration tests actually execute
[ ] Completed persistence passes
[ ] Failed persistence passes
[ ] Idempotency passes
[ ] Snapshot deletion passes
[ ] JSONB round-trip passes
[ ] Infrastructure error propagation passes
[ ] Worker persistence path is verified
[ ] Worker has no direct Drizzle/Postgres dependency
[ ] Application layer has no infrastructure dependency
[ ] Core still has zero runtime dependencies
[ ] pnpm lint passes
[ ] pnpm typecheck passes
[ ] pnpm test passes
[ ] pnpm build passes
[ ] madge --circular passes
[ ] No secrets are committed
[ ] No scope expansion occurred

================================================== 15. IMPORTANT HONESTY REQUIREMENT
==================================================

The final report MUST distinguish between:

STATICALLY VERIFIED

and

RUNTIME VERIFIED

For example:

STATIC:

- TypeScript compilation
- dependency boundaries
- migration generation
- transaction API usage

RUNTIME:

- PostgreSQL connection
- migration application
- inserts
- upserts
- JSONB round-trip
- FK behavior
- worker persistence

Never describe something as runtime-tested if it was only inferred from source code.

If PostgreSQL cannot be started in the environment, STOP the runtime validation at that point and report:

POSTGRESQL RUNTIME VALIDATION BLOCKED

Explain exactly why.

Do not fake a successful run.

================================================== 16. DOCUMENTATION
==================================================

If Step 5C succeeds, update documentation only where necessary to record the runtime validation.

Potentially update:

docs/architecture/persistence.md
README.md

Do not rewrite architecture documentation unnecessarily.

Document:

- PostgreSQL runtime validation
- migration execution
- integration test result
- worker persistence validation
- any remaining operational concern

If PostgreSQL remains unavailable, document the limitation rather than pretending the validation is complete.

================================================== 17. FINAL REPORT
==================================================

At the end, produce:

# DevLens — Step 5C Final Report

## 1. Objective

State exactly what Step 5C validated.

## 2. PostgreSQL Environment

Describe:

- PostgreSQL source
- DATABASE_URL configuration
- database version if available
- whether Docker was used

Do not expose credentials.

## 3. Migration Validation

Report:

- migration command
- result
- tables created
- FK verified

## 4. Integration Tests

Provide a table:

| Test                       | Result |
| -------------------------- | ------ |
| Completed scan persistence |        |
| Failed scan persistence    |        |
| FK relationship            |        |
| Idempotency                |        |
| Snapshot deletion          |        |
| JSONB preservation         |        |
| Error propagation          |        |

Explicitly state whether all 7 tests EXECUTED or were SKIPPED.

## 5. Worker Runtime Validation

Describe the actual worker path that was exercised.

Confirm whether persistence reached PostgreSQL.

## 6. Transaction Validation

Clearly distinguish:

- statically verified
- runtime verified

Do not overclaim rollback testing.

## 7. Architectural Verification

Confirm:

- core dependency boundary
- application dependency boundary
- worker dependency boundary
- database adapter boundary

## 8. Changes Made

List every created/modified/deleted file.

If no production source changes were required, say so explicitly.

## 9. Test Results

Report exact results for:

pnpm lint
pnpm typecheck
pnpm test
pnpm build
madge --circular

## 10. Runtime Evidence

Give concrete evidence that PostgreSQL was actually used.

Examples:

- migration succeeded
- rows inserted
- rows updated
- snapshot deleted
- JSONB retrieved correctly

Do not include secrets.

## 11. Remaining Concerns

Only list real remaining concerns.

Examples:

- connection pool tuning
- production PostgreSQL provisioning
- migration deployment strategy

Do not invent concerns.

## 12. Scope Confirmation

Explicitly confirm that Step 5C did NOT implement:

- API
- Redis
- queues
- authentication
- dashboard
- AI
- detectors
- analyzer
- multi-page crawling
- etc.

## 13. Final Status

Choose exactly one:

STEP 5C — COMPLETE

or

STEP 5C — BLOCKED

If blocked, explain the exact blocking condition.

==================================================
FINAL RULE
==================================================

This step exists to turn Step 5B from:

"production adapter compiles and is statically validated"

into:

"production adapter has been exercised against real PostgreSQL"

Do not expand the architecture.

Do not redesign.

Do not fake runtime validation.

Make the smallest changes necessary.

Then provide the complete Step 5C Final Report.
