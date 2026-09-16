/**
 * @devlens/database — persistence infrastructure for DevLens.
 *
 * Provides implementations of the `ScanResultRepository` contract
 * defined in `@devlens/application`:
 *
 * - `InMemoryScanResultRepository`  — deterministic, zero-dependency,
 *    used by unit tests and the default application orchestrator.
 * - `PostgresScanResultRepository`  — production PostgreSQL adapter
 *    backed by Drizzle ORM + postgres.js. Used by the worker runtime.
 *
 * The application layer depends on the `ScanResultRepository` interface
 * only — it never imports Drizzle, postgres, or this package directly.
 * Core depends on neither.
 *
 * This package must not become a dependency of `@devlens/core`.
 */

export { InMemoryScanResultRepository } from './repository.js';
export { PostgresScanResultRepository } from './postgres-repository.js';
export { createDatabaseClient } from './client.js';
export type { Database } from './client.js';
export { scans, snapshots } from './schema.js';
