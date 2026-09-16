/**
 * @devlens/application — application layer for DevLens.
 *
 * Provides the orchestration logic that bridges the domain lifecycle
 * (`@devlens/core`) and the crawler (`@devlens/crawler`).
 *
 * Depends on `@devlens/core` and `@devlens/crawler` as runtime
 * dependencies.
 */

export { runScan } from './orchestrator.js';
export type { ScanResult } from './orchestrator.js';
export { persistResult } from './repository.js';
export type { ScanResultRepository } from './repository.js';
export { executeScan } from './execute-scan.js';
export { getScan, listScans } from './queries.js';
