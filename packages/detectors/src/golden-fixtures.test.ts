/**
 * Golden fixture regression test for the Step 13 detection suite.
 *
 * This test runs each fixture from `fixtures/detector-fixtures.ts` through
 * the **real detection pipeline** (`CompositeDetector → DeduplicatingDetector
 * → ScoringDetector`) and asserts golden expectations:
 *
 * - All `expected` technology IDs MUST appear in the result.
 * - All `forbidden` technology IDs MUST NOT appear in the result.
 * - The result MUST be deterministic (same fixture → same detections
 *   across 3 runs).
 *
 * This is a **regression protection** test: if a signature change, detector
 * refactoring, or pipeline reordering causes a fixture's expectations to
 * no longer hold, this test will fail — surfacing the regression immediately
 * even if individual unit tests still pass.
 */

import { describe, it, expect } from 'vitest';
import {
  CompositeDetector,
  HeaderDetector,
  MetaTagDetector,
  ScriptUrlDetector,
  ContentScriptDetector,
  ResourceDetector,
  LinkDetector,
  DeduplicatingDetector,
  ScoringDetector,
  ConfidenceScorer,
} from './index.js';
import type { Detector } from './detector.js';
import type { Detection } from '@devlens/core';
import { FIXTURES, ALL_TECH_IDS } from './fixtures/detector-fixtures.js';

// ─── Pipeline builder ──────────────────────────────────────────────────

/**
 * Builds the real production pipeline — identical to the one used in
 * `apps/worker/src/main.ts` and `apps/web/src/app/api/scans/handler.ts`.
 *
 * Using the real pipeline (not individual detectors) ensures the test
 * catches regressions in:
 * - detector composition
 * - deduplication semantics
 * - scoring / confidence computation
 * - ranking / ordering
 * - evidence handling
 */
function makeRealPipeline(): Detector {
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

// ─── Tests ──────────────────────────────────────────────────────────────

describe('golden-fixtures: real pipeline regression', () => {
  const pipeline = makeRealPipeline();

  // Dynamically generate one test per fixture so each is listed
  // individually in the output.
  for (const fixture of FIXTURES) {
    describe(`${fixture.category} > ${fixture.name}`, () => {
      it('detects all expected technologies', () => {
        const detections = pipeline.detect(fixture.snapshot);
        const detectedIds = new Set(detections.map((d) => String(d.technology.id)));

        for (const expectedId of fixture.expected) {
          expect(
            detectedIds,
            `Expected "${expectedId}" to be detected from fixture "${fixture.name}"`,
          ).toContain(expectedId);
        }
      });

      it('does NOT detect any forbidden technologies', () => {
        const detections = pipeline.detect(fixture.snapshot);
        const detectedIds = new Set(detections.map((d) => String(d.technology.id)));

        for (const forbiddenId of fixture.forbidden) {
          expect(
            detectedIds,
            `Forbidden technology "${forbiddenId}" was detected from fixture "${fixture.name}"`,
          ).not.toContain(forbiddenId);
        }
      });

      it('produces deterministic results across 3 runs', () => {
        const result1 = pipeline.detect(fixture.snapshot);
        const result2 = pipeline.detect(fixture.snapshot);
        const result3 = pipeline.detect(fixture.snapshot);

        const serialize = (detections: Detection[]): string =>
          JSON.stringify(
            detections.map((d) => ({
              id: d.technology.id,
              confidence: d.confidence,
              evidence: d.evidence.map((e) => e.type),
            })),
          );

        expect(serialize(result1)).toBe(serialize(result2));
        expect(serialize(result2)).toBe(serialize(result3));
      });
    });
  }

  // ─── Catalog coverage ───────────────────────────────────────────────────

  describe('catalog coverage', () => {
    it('every catalog technology (except infrastructure) has a positive fixture', () => {
      // Infrastructure technologies (servers, languages, some frameworks)
      // are covered by header-based fixtures.
      const fixtureNames = new Set(FIXTURES.map((f) => f.name));

      for (const techId of ALL_TECH_IDS) {
        // Negative fixtures and coexistence fixtures are not "positive" fixtures
        const isPositive = FIXTURES.some(
          (f) =>
            !['negative', 'coexistence', 'false-positive'].includes(f.category) &&
            f.expected.includes(techId),
        );

        if (!isPositive) {
          // Infrastructure technologies may be detected as a side-effect
          // of a coexistence fixture. Verify they appear in at least
          // one expected list.
          const covered = FIXTURES.some((f) => f.expected.includes(techId));
          expect(covered, `Technology "${techId}" has no fixture covering it`).toBe(true);
        } else {
          expect(fixtureNames.has(techId), `Positive fixture for "${techId}" not found`).toBe(true);
        }
      }
    });

    it('every catalog technology appears in the coverage report', () => {
      // This test exists to ensure the coverage matrix in the report
      // is complete — every technology ID must appear in at least one
      // fixture's expected or forbidden list.
      for (const techId of ALL_TECH_IDS) {
        const covered = FIXTURES.some(
          (f) => f.expected.includes(techId) || f.forbidden.includes(techId),
        );
        expect(covered, `Technology "${techId}" is missing from all fixtures`).toBe(true);
      }
    });
  });

  // ─── Precision / recall summary ────────────────────────────────────────

  describe('precision summary', () => {
    it('no negative fixture produces any detections', () => {
      const negativeFixtures = FIXTURES.filter((f) => f.category === 'negative');
      expect(negativeFixtures.length).toBeGreaterThanOrEqual(2);

      for (const fixture of negativeFixtures) {
        const detections = pipeline.detect(fixture.snapshot);
        expect(
          detections,
          `Negative fixture "${fixture.name}" produced unexpected detections`,
        ).toHaveLength(0);
      }
    });

    it('coexistence fixtures detect both technologies independently', () => {
      const coexistFixtures = FIXTURES.filter((f) => f.category === 'coexistence');
      expect(coexistFixtures.length).toBeGreaterThanOrEqual(2);

      for (const fixture of coexistFixtures) {
        const detections = pipeline.detect(fixture.snapshot);
        const detectedIds = new Set(detections.map((d) => String(d.technology.id)));
        for (const expectedId of fixture.expected) {
          expect(detectedIds).toContain(expectedId);
        }
      }
    });
  });
});
