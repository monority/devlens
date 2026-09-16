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

export { createProductionDetector } from './production-detector.js';
