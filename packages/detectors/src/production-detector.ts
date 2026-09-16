/**
 * Production detector pipeline factory.
 *
 * Both `apps/web` (API route) and `apps/worker` (job runner) compose the
 * same three-layer decorator stack to produce the final `Detection[]`
 * from a `SiteSnapshot`:
 *
 * ```text
 * CompositeDetector([...])   — ordered sub-detectors, results concatenated
 *   → DeduplicatingDetector — one Detection per technology (highest confidence, evidence merged)
 *   → ScoringDetector       — final confidence via ConfidenceScorer, ranked output
 * ```
 *
 * This factory is the **single source of truth** for that wiring,
 * eliminating the risk of the two entry points silently diverging
 * (e.g. a detector added to one but not the other, or a different
 * scorer configuration).
 *
 * The factory lives in `@devlens/detectors` (not `@devlens/application`)
 * because it only assembles detector components — it contains no
 * application-layer orchestration logic.
 */

import type { Detector } from './detector.js';
import { HeaderDetector } from './header-detector.js';
import { MetaTagDetector } from './meta-tag-detector.js';
import { ScriptUrlDetector } from './script-url-detector.js';
import { ContentScriptDetector } from './content-script-detector.js';
import { ResourceDetector } from './resource-detector.js';
import { LinkDetector } from './link-detector.js';
import { CompositeDetector } from './composite-detector.js';
import { DeduplicatingDetector } from './deduplicating-detector.js';
import { ConfidenceScorer } from './detection-scorer.js';
import { ScoringDetector } from './scoring-detector.js';

/**
 * Constructs the canonical production detector pipeline.
 *
 * @returns A `Detector` that runs all six sub-detectors through
 *          ``CompositeDetector``, deduplicates by technology ID via
 *          ``DeduplicatingDetector``, and applies confidence scoring via
 *          ``ScoringDetector(ConfidenceScorer)``.
 */
export function createProductionDetector(): Detector {
  return new ScoringDetector(
    new DeduplicatingDetector(
      new CompositeDetector([
        new HeaderDetector(),
        new MetaTagDetector(),
        new ScriptUrlDetector(),
        new ContentScriptDetector(),
        new ResourceDetector(),
        new LinkDetector(),
      ]),
    ),
    new ConfidenceScorer(),
  );
}
