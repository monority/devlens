/**
 * Step 63 — Phase 3 attack: scoring path verification.
 *
 * Tests the ScoringDetector decorator (which wraps an inner detector,
 * applies ConfidenceScorer, and ranks output). Covers the specific
 * cases required by the Step 63 spec:
 *
 * - Case A: Same input twice → same scores
 * - Case B: Same evidence in different order → same scores
 * - Case C: Duplicate evidence → does not artificially inflate confidence
 * - Case D: Very large evidence set → remains bounded [0, 100]
 * - Case E: Invalid numeric values → never leak NaN/Infinity
 * - Case F: Equal confidence → deterministic ordering (tech.id ASC)
 */

import { describe, it, expect } from 'vitest';
import { ScoringDetector, ConfidenceScorer, DeduplicatingDetector } from './index.js';
import type { Detector } from './detector.js';
import type { Detection, Evidence, Technology, SiteSnapshot } from '@devlens/core';
import {
  createTechnologyId,
  createTechnologyCategory,
  createConfidence,
  createDetection,
  createUrl,
  createHostname,
  createTimestampFromString,
  createHttpStatus,
} from '@devlens/core';

// ─── Helpers ────────────────────────────────────────────────────────

function makeTechnology(id: string, name = id, category = 'framework'): Technology {
  return {
    id: createTechnologyId(id),
    name,
    category: createTechnologyCategory(category),
  };
}

function makeDetection(
  confidence: number,
  evidence: Evidence[],
  technology: Technology,
): Detection {
  return createDetection(technology, createConfidence(confidence), evidence);
}

function makeSnapshot(): SiteSnapshot {
  return {
    url: createUrl('https://example.com'),
    hostname: createHostname('example.com'),
    capturedAt: createTimestampFromString('2025-06-01T12:00:00.000Z'),
    http: {
      statusCode: createHttpStatus(200),
      headers: [],
      contentType: 'text/html',
      finalUrl: createUrl('https://example.com'),
    },
    html: {
      title: 'Example',
      description: null,
      metaTags: [],
      scripts: [],
      links: [],
    },
    resources: [],
  };
}

const snapshot = makeSnapshot();

function makeLinkEvidence(url: string): Evidence {
  return { type: 'link', url: createUrl(url) };
}
function makeMetaEvidence(name: string, content: string): Evidence {
  return { type: 'meta_tag', name, content };
}
function makeScriptUrlEvidence(url: string): Evidence {
  return { type: 'script_url', url: createUrl(url) };
}
function makeScriptContentEvidence(snippet: string): Evidence {
  return { type: 'script_content', snippet };
}
function makeHeaderEvidence(name: string, value: string): Evidence {
  return { type: 'http_header', name, value };
}
function makeResourceEvidence(url: string): Evidence {
  return { type: 'resource', url: createUrl(url) };
}
function makeHtmlEvidence(selector: string, snippet: string): Evidence {
  return { type: 'html', selector, snippet };
}
function makeJsGlobalEvidence(name: string): Evidence {
  return { type: 'javascript_global', globalName: name };
}

function makeMock(detections: Detection[]): Detector {
  return { detect: () => detections };
}

function makePipeline(detections: Detection[]): Detector {
  return new ScoringDetector(
    new DeduplicatingDetector(makeMock(detections)),
    new ConfidenceScorer(),
  );
}

// ─── Case A: Same input twice → same scores ─────────────────────────

describe('Step 63 Phase 3 — Case A: same input → same scores', () => {
  it('two consecutive calls produce identical results (JSON)', () => {
    const mock = makeMock([
      makeDetection(90, [makeLinkEvidence('https://a.com')], makeTechnology('alpha')),
      makeDetection(95, [makeLinkEvidence('https://b.com')], makeTechnology('beta')),
    ]);
    const detector = new ScoringDetector(mock, new ConfidenceScorer());

    const r1 = JSON.stringify(detector.detect(snapshot));
    const r2 = JSON.stringify(detector.detect(snapshot));

    expect(r1).toBe(r2);
  });

  it('three consecutive calls produce identical confidence values', () => {
    const mock = makeMock([
      makeDetection(
        85,
        [makeMetaEvidence('generator', 'Hugo'), makeLinkEvidence('https://a.com')],
        makeTechnology('hugo'),
      ),
    ]);
    const detector = new ScoringDetector(mock, new ConfidenceScorer());

    const scores = [
      detector.detect(snapshot)[0]!.confidence,
      detector.detect(snapshot)[0]!.confidence,
      detector.detect(snapshot)[0]!.confidence,
    ];

    expect(scores[0]).toBe(scores[1]);
    expect(scores[1]).toBe(scores[2]);
  });
});

// ─── Case B: Same evidence in different order → same scores ─────────

describe('Step 63 Phase 3 — Case B: evidence order independence', () => {
  it('same evidence set in different order → same scored confidence', () => {
    const tech = makeTechnology('test');

    const evidenceA: Evidence[] = [
      makeMetaEvidence('generator', 'Test'),
      makeLinkEvidence('https://cdn.test.com/app.js'),
      makeScriptUrlEvidence('https://cdn.test.com/bundle.js'),
    ];
    const evidenceB: Evidence[] = [
      makeScriptUrlEvidence('https://cdn.test.com/bundle.js'),
      makeLinkEvidence('https://cdn.test.com/app.js'),
      makeMetaEvidence('generator', 'Test'),
    ];

    const scoreA = new ConfidenceScorer().score(makeDetection(85, evidenceA, tech)).confidence;
    const scoreB = new ConfidenceScorer().score(makeDetection(85, evidenceB, tech)).confidence;

    // Both have 3 distinct source types → bonus = 10 → 95
    expect(scoreA).toBe(95);
    expect(scoreB).toBe(95);
    expect(scoreA).toBe(scoreB);
  });

  it('same evidence in different order → same final detection output (full pipeline)', () => {
    // Using the full pipeline (Dedup → Score) because DeduplicatingDetector
    // sorts evidence by getEvidenceKey, ensuring deterministic order.
    const tech = makeTechnology('test');

    const detA = makeDetection(
      90,
      [makeMetaEvidence('generator', 'Test'), makeLinkEvidence('https://a.com')],
      tech,
    );
    const detB = makeDetection(
      90,
      [makeLinkEvidence('https://a.com'), makeMetaEvidence('generator', 'Test')],
      tech,
    );

    const r1 = JSON.stringify(makePipeline([detA]).detect(snapshot));
    const r2 = JSON.stringify(makePipeline([detB]).detect(snapshot));

    expect(r1).toBe(r2);
  });
});

// ─── Case C: Duplicate evidence → no artificial inflation ───────────

describe('Step 63 Phase 3 — Case C: duplicate evidence does not inflate', () => {
  it('three link evidence with same URL → same score as one (same source type)', () => {
    const tech = makeTechnology('test');
    const url = 'https://cdn.example.com/app.css';

    const single = makeDetection(90, [makeLinkEvidence(url)], tech);
    const triple = makeDetection(
      90,
      [makeLinkEvidence(url), makeLinkEvidence(url), makeLinkEvidence(url)],
      tech,
    );

    // Single source → no bonus → 90
    // Triple (same type) → still 1 source → no bonus → 90
    expect(new ConfidenceScorer().score(single).confidence).toBe(90);
    expect(new ConfidenceScorer().score(triple).confidence).toBe(90);
  });

  it('duplicate evidence from DeduplicatingDetector does not inflate score', () => {
    const tech = makeTechnology('test');
    const detections = [
      makeDetection(90, [makeLinkEvidence('https://a.com/1')], tech),
      makeDetection(
        95,
        [
          makeLinkEvidence('https://a.com/1'), // exact duplicate — removed by dedup
          makeLinkEvidence('https://a.com/2'),
        ],
        tech,
      ),
    ];

    const pipeline = makePipeline(detections);
    const result = pipeline.detect(snapshot);

    expect(result).toHaveLength(1);
    // Deduplicated to 2 distinct links → 1 source type → no bonus
    expect(result[0]!.confidence).toBe(95);
    expect(result[0]!.evidence).toHaveLength(2);
  });

  it('duplicate evidence with same header name+value does not inflate', () => {
    const tech = makeTechnology('test');
    const detections = [
      makeDetection(90, [makeHeaderEvidence('Server', 'nginx')], tech),
      makeDetection(95, [makeHeaderEvidence('Server', 'nginx')], tech),
    ];

    const pipeline = makePipeline(detections);
    const result = pipeline.detect(snapshot);

    expect(result).toHaveLength(1);
    expect(result[0]!.evidence).toHaveLength(1);
    expect(result[0]!.confidence).toBe(95); // base from highest, no bonus
  });
});

// ─── Case D: Very large evidence set → bounded [0, 100] ──────────────

describe('Step 63 Phase 3 — Case D: large evidence set stays bounded', () => {
  it('all 8 evidence types → score caps at 100', () => {
    const tech = makeTechnology('test');
    const evidence: Evidence[] = [
      makeHeaderEvidence('Server', 'nginx'),
      makeMetaEvidence('generator', 'Test'),
      makeScriptUrlEvidence('https://cdn.test.com/a.js'),
      makeScriptContentEvidence('__TEST__'),
      makeJsGlobalEvidence('__TEST__'),
      makeResourceEvidence('https://cdn.test.com/r.css'),
      makeLinkEvidence('https://cdn.test.com/l.css'),
      makeHtmlEvidence('#app', '<div>'),
    ];
    const detection = makeDetection(85, evidence, tech);

    const scored = new ConfidenceScorer().score(detection);

    // 8 sources → bonus = min(10, 7*5) = 10 → 85+10 = 95
    expect(scored.confidence).toBe(95);
    expect(scored.confidence).toBeLessThanOrEqual(100);
  });

  it('base 100 with multiple sources → capped at 100 (not infinity)', () => {
    const tech = makeTechnology('test');
    const evidence: Evidence[] = [
      makeHeaderEvidence('Server', 'nginx'),
      makeMetaEvidence('generator', 'Test'),
      makeLinkEvidence('https://a.com/1'),
      makeLinkEvidence('https://a.com/2'),
      makeLinkEvidence('https://a.com/3'),
      makeScriptUrlEvidence('https://b.com/1'),
      makeScriptUrlEvidence('https://b.com/2'),
      makeResourceEvidence('https://c.com/1'),
      makeResourceEvidence('https://c.com/2'),
      makeResourceEvidence('https://c.com/3'),
    ];
    const detection = makeDetection(100, evidence, tech);

    const scored = new ConfidenceScorer().score(detection);
    expect(scored.confidence).toBe(100);
    expect(Number.isFinite(scored.confidence)).toBe(true);
  });

  it('base 0 with maximum bonus → stays in [0, 100]', () => {
    const tech = makeTechnology('test');
    const evidence: Evidence[] = [
      makeHeaderEvidence('X', 'y'),
      makeMetaEvidence('m', 'n'),
      makeLinkEvidence('https://a.com'),
      makeScriptUrlEvidence('https://b.com'),
      makeScriptContentEvidence('x'),
      makeResourceEvidence('https://c.com'),
      makeHtmlEvidence('div', 'd'),
      makeJsGlobalEvidence('g'),
    ];
    const detection = makeDetection(0, evidence, tech);

    const scored = new ConfidenceScorer().score(detection);
    expect(scored.confidence).toBeGreaterThanOrEqual(0);
    expect(scored.confidence).toBeLessThanOrEqual(100);
    expect(scored.confidence).toBe(10); // 0 + 10 bonus
  });

  it('1000 evidence items of same type → no overflow', () => {
    const tech = makeTechnology('test');
    const evidence: Evidence[] = [];
    for (let i = 0; i < 1000; i++) {
      evidence.push(makeLinkEvidence(`https://cdn.example.com/${i}.css`));
    }
    const detection = makeDetection(90, evidence, tech);

    const scored = new ConfidenceScorer().score(detection);
    expect(scored.confidence).toBe(90); // only 1 source type → no bonus
    expect(Number.isFinite(scored.confidence)).toBe(true);
  });
});

// ─── Case E: Invalid numeric values → never NaN/Infinity ─────────────

describe('Step 63 Phase 3 — Case E: no NaN/Infinity leakage', () => {
  it('scored confidence is always a finite number', () => {
    const tech = makeTechnology('test');

    // Confidence 0 with diverse evidence → bonus → finite
    const detection = makeDetection(
      0,
      [makeMetaEvidence('a', 'b'), makeLinkEvidence('https://x.com')],
      tech,
    );

    const scored = new ConfidenceScorer().score(detection);
    expect(Number.isFinite(Number(scored.confidence))).toBe(true);
  });

  it('createConfidence rejects NaN (defense at factory level)', () => {
    expect(() => createConfidence(NaN)).toThrow();
    expect(() => createConfidence(Infinity)).toThrow();
    expect(() => createConfidence(-Infinity)).toThrow();
  });

  it('ScoringDetector #rank handles all-finite confidences (deterministic)', () => {
    const techA = makeTechnology('alpha', 'Alpha');
    const techB = makeTechnology('beta', 'Beta');
    const techC = makeTechnology('gamma', 'Gamma');

    const mock = makeMock([
      makeDetection(90, [makeLinkEvidence('a')], techA),
      makeDetection(90, [makeLinkEvidence('b')], techB),
      makeDetection(90, [makeLinkEvidence('c')], techC),
    ]);
    const result = new ScoringDetector(mock, new ConfidenceScorer()).detect(snapshot);

    // All 90, no bonus (single source) → tie-break by id ASC
    expect(result.map((d) => d.technology.id)).toEqual(['alpha', 'beta', 'gamma']);
  });
});

// ─── Case F: Equal confidence → deterministic ordering ──────────────

describe('Step 63 Phase 3 — Case F: deterministic tie-breaking', () => {
  it('equal confidence → sorted by technology.id ASC', () => {
    const techs = [makeTechnology('zebra'), makeTechnology('apple'), makeTechnology('mango')];
    const mock = makeMock(
      techs.map((t, i) => makeDetection(90, [makeLinkEvidence(`https://${i}.com`)], t)),
    );
    const result = new ScoringDetector(mock, new ConfidenceScorer()).detect(snapshot);

    expect(result.map((d) => d.technology.id)).toEqual(['apple', 'mango', 'zebra']);
  });

  it('reversed input with equal confidence → same output', () => {
    const techs = [makeTechnology('zebra'), makeTechnology('mango'), makeTechnology('apple')];
    const mock = makeMock(
      techs.map((t, i) => makeDetection(90, [makeLinkEvidence(`https://${i}.com`)], t)),
    );
    const result = new ScoringDetector(mock, new ConfidenceScorer()).detect(snapshot);

    expect(result.map((d) => d.technology.id)).toEqual(['apple', 'mango', 'zebra']);
  });

  it('mixed confidence (with ties) → deterministic output', () => {
    const techs = [makeTechnology('b'), makeTechnology('a'), makeTechnology('c')];
    const mock = makeMock([
      makeDetection(80, [makeLinkEvidence('b')], techs[0]!),
      makeDetection(95, [makeLinkEvidence('a')], techs[1]!),
      makeDetection(80, [makeLinkEvidence('c')], techs[2]!),
    ]);
    const result = new ScoringDetector(mock, new ConfidenceScorer()).detect(snapshot);

    // 95 first, then 80s tie-broken by id ASC: 'b' < 'c'
    expect(result.map((d) => d.technology.id)).toEqual(['a', 'b', 'c']);
  });

  it('full pipeline (Dedup → Score → Rank) is deterministic across runs', () => {
    const tech = makeTechnology('nginx');
    const detections = [
      makeDetection(90, [makeHeaderEvidence('Server', 'nginx')], tech),
      makeDetection(95, [makeMetaEvidence('generator', 'nginx')], tech),
      makeDetection(85, [makeLinkEvidence('https://cdn.nginx.com/')], tech),
    ];

    const pipeline = makePipeline(detections);

    const r1 = JSON.stringify(pipeline.detect(snapshot));
    const r2 = JSON.stringify(pipeline.detect(snapshot));

    expect(r1).toBe(r2);
  });
});
