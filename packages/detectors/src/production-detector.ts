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
import { ResourceContentDetector } from './resource-content-detector.js';
import { LinkDetector } from './link-detector.js';
import { CompositeDetector } from './composite-detector.js';
import { DeduplicatingDetector } from './deduplicating-detector.js';
import { ConfidenceScorer } from './detection-scorer.js';
import { ScoringDetector } from './scoring-detector.js';
import { RelationshipResolver } from './relationships.js';

/**
 * Constructs the canonical production detector pipeline.
 *
 * ```text
 * CompositeDetector([...])   — ordered sub-detectors, results concatenated
 *   → DeduplicatingDetector — one Detection per technology (highest confidence, evidence merged)
 *   → ScoringDetector       — final confidence via ConfidenceScorer, ranked output
 *   → RelationshipResolver  — Step 69: post-scoring `implies`/`requires`/`excludes` resolution
 * ```
 *
 * The {@link RelationshipResolver} is the **outermost** layer: it runs after
 * scoring (so it never alters a direct detection's confidence — Phase 11) and
 * appends relationship-derived detections or surfaces conflicts on direct
 * detections. It is the single place relationships are wired, so the `makeRealPipeline()`
 * helper in tests (which omits it) stays a pure three-layer stack for golden
 * assertions, while the production factory is the single source of truth for
 * web + worker.
 *
 * The seven sub-detectors inside `CompositeDetector` are the six Step-68
 * detectors plus Step-71's `ResourceContentDetector` (which inspects the
 * bodies of fetched resource bundles the same way `ResourceDetector` inspects
 * resource URLs).
 *
 * @returns A `Detector` that runs all seven sub-detectors through
 *          ``CompositeDetector``, deduplicates by technology ID via
 *          ``DeduplicatingDetector``, applies confidence scoring via
 *          ``ScoringDetector(ConfidenceScorer)``, and finally resolves
 *          catalog relationships via ``RelationshipResolver``.
 */
export function createProductionDetector(): Detector {
  return new RelationshipResolver(
    new ScoringDetector(
      new DeduplicatingDetector(
        new CompositeDetector([
          new HeaderDetector(),
          new MetaTagDetector(),
          new ScriptUrlDetector(),
          new ContentScriptDetector(),
          new ResourceDetector(),
          new ResourceContentDetector(),
          new LinkDetector(),
        ]),
      ),
      new ConfidenceScorer(),
    ),
  );
}
