/**
 * @devlens/core — pure domain layer.
 *
 * This package contains the vocabulary and invariants of a DevLens scan.
 * It must not depend on React, Next.js, Playwright, Drizzle, database
 * clients, or Node-specific infrastructure. It must not depend on Zod,
 * a crawler, or an analyzer.
 */

export const version = '0.1.0';

// Value objects
export * from './domain/value-objects.js';

// Scan aggregate
export * from './domain/scan.js';

// Technology
export * from './domain/technology.js';

// Detection
export * from './domain/detection.js';

// Evidence
export * from './domain/evidence.js';

// Site snapshot
export * from './domain/snapshot.js';

// Observation coverage (Step 78)
export * from './domain/observation-coverage.js';

// Scan result quality (Step 79)
export * from './domain/scan-result-quality.js';

// Detection provenance (Step 80) — deterministic, derived provenance per
// detection (evidence count, canonical evidence types, strongest type).
export * from './domain/detection-provenance.js';

// Detection result integrity (Step 81) — structural validator that ensures
// the finalized detection, its evidence, and its provenance remain internally
// consistent. Pure, deterministic, never mutates the detection.
export * from './domain/detection-integrity.js';
