/**
 * @devlens/detectors — technology detection boundary.
 *
 * This package defines the {@link Detector} interface — the contract
 * between the domain model and concrete technology-detection
 * implementations. The domain model (`@devlens/core`) defines what a
 * `Detection` is; this package defines how detectors are invoked.
 *
 * Concrete detectors (header-based, HTML-pattern-based, etc.) live in
 * this package or are injected as {@link Detector} implementations.
 * They depend on `@devlens/core` for domain types (`SiteSnapshot`,
 * `Detection`) and make no assumptions about HTTP, browsers, or any
 * specific runtime.
 */

export type { Detector } from './detector.js';
export { NullDetector } from './detector.js';
export { HeaderDetector } from './header-detector.js';
export { MetaTagDetector } from './meta-tag-detector.js';
export { ScriptUrlDetector } from './script-url-detector.js';
export { ContentScriptDetector } from './content-script-detector.js';
export { ResourceDetector } from './resource-detector.js';
export { LinkDetector } from './link-detector.js';
export { DeduplicatingDetector } from './deduplicating-detector.js';
export { CompositeDetector } from './composite-detector.js';
export type { DetectionScorer, EvidenceSource } from './detection-scorer.js';
export { ConfidenceScorer } from './detection-scorer.js';
export { ScoringDetector } from './scoring-detector.js';
export type { CatalogEntry } from './technology-catalog.js';
export {
  TECHNOLOGY_CATALOG,
  TECHNOLOGY_IDS,
  TECHNOLOGY_CATEGORIES,
  getTechnology,
} from './technology-catalog.js';

/**
 * Declarative technology catalog (Step 68). `TECHNOLOGY_DEFINITIONS` is the
 * single source of truth for every detected technology: its metadata *and*
 * all of its signatures across every observable source. `signaturesFor`
 * is what the six detectors use to source their signature tables.
 */
export {
  TECHNOLOGY_DEFINITIONS,
  findDefinition,
  relationshipsFor,
  signaturesFor,
  validateCatalog,
  validateDefinition,
  validateDefinitions,
} from './catalog/index.js';
export type {
  TechnologyDefinition,
  RelationshipType,
  RelationshipDef,
  HeaderSignature,
  MetaTagSignature,
  ScriptUrlSignature,
  ContentScriptSignature,
  ResourceSignature,
  LinkSignature,
  LinkMatchKind,
} from './catalog/types.js';

export { createProductionDetector } from './production-detector.js';

// ─── Step 69: Technology Relationship Semantics ──────────────────────
// The relationship-resolution layer is the outermost decorator in the
// production pipeline (after `ScoringDetector`). `resolveRelationships` is
// the pure, testable core; `RelationshipResolver` is the `Detector`
// decorator that wires it around the scoring layer. `TECHNOLOGY_DEFINITIONS`
// (above) is the default catalog the resolver reads relationships from.
export { resolveRelationships, RelationshipResolver } from './relationships.js';
export type { RelationshipResolutionOptions } from './relationships.js';
export {
  createDerivedDetection,
  createExcludesConflict,
  createRequiresConflict,
} from '@devlens/core';
export type { DetectionSource, RelationshipProvenance, RelationshipConflict } from '@devlens/core';

// Declarative version-extraction primitives (reusable across the
// signature tables of every detector). `version` extraction is optional
// and declared per-signature — there is no separate detection engine.
export { extractVersion } from './version.js';
export type { VersionRule, VersionExtraction } from './version.js';
