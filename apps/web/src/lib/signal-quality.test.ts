/**
 * Unit tests for Step 76 signal-quality / corroboration (§5/§6/§7/§11).
 *
 * Pure-function tests (no React, HTTP, or DOM): they verify the corroboration
 * model computed from evidence, determinism, the §6 special cases and the
 * explainability integration point (§8/§9).
 */

import { describe, it, expect } from 'vitest';
import type { EvidenceResponse, DetectionResponse } from './types';
import { computeSignalQuality, signalQualityLabel, evidenceSourceFamily } from './signal-quality';
import { getDetectionExplainability } from './detection-explainability';

/* ── evidence builders, one per evidence type / source family ──────────── */
const H = (name: string, value: string): EvidenceResponse => ({
  type: 'http_header',
  name,
  value,
});
const M = (name: string, content: string): EvidenceResponse => ({
  type: 'meta_tag',
  name,
  content,
});
const S = (url: string): EvidenceResponse => ({ type: 'script_url', url });
const R = (url: string): EvidenceResponse => ({ type: 'resource', url });
const RC = (url: string, match: string): EvidenceResponse => ({
  type: 'resource_content',
  url,
  resourceType: 'script',
  match,
  snippet: 'context',
});
const L = (url: string): EvidenceResponse => ({ type: 'link', url });

/** A direct detection with the given evidence. */
const makeDirect = (
  evidence: EvidenceResponse[],
  overrides: Partial<DetectionResponse> = {},
): DetectionResponse => ({
  technology: { id: 'wordpress', name: 'WordPress', category: 'cms' },
  confidence: 100,
  evidence,
  ...overrides,
});

const NEXT_DERIVED: ReadonlyArray<{
  source: string;
  sourceName: string;
  type: 'implies';
}> = [{ source: 'nextjs', sourceName: 'Next.js', type: 'implies' }];

describe('evidenceSourceFamily (§3)', () => {
  it('maps every evidence type to its observable source family', () => {
    expect(evidenceSourceFamily('http_header')).toBe('header');
    expect(evidenceSourceFamily('meta_tag')).toBe('meta');
    expect(evidenceSourceFamily('script_url')).toBe('script_url');
    expect(evidenceSourceFamily('script_content')).toBe('content');
    expect(evidenceSourceFamily('html')).toBe('content');
    expect(evidenceSourceFamily('javascript_global')).toBe('content');
    expect(evidenceSourceFamily('resource')).toBe('resource_url');
    expect(evidenceSourceFamily('link')).toBe('link');
    expect(evidenceSourceFamily('resource_content')).toBe('resource_content');
  });

  it('collapses script_content/html/javascript_global onto a single content family (§3/§6.D)', () => {
    expect(evidenceSourceFamily('script_content') === evidenceSourceFamily('html')).toBe(true);
    expect(evidenceSourceFamily('html') === evidenceSourceFamily('javascript_global')).toBe(true);
  });
});

describe('computeSignalQuality — source counting (§5/§13)', () => {
  it('1 evidence / 1 source → single_signal', () => {
    const sq = computeSignalQuality([H('X-Powered-By', 'WP')]);
    expect(sq).toEqual({
      level: 'single_signal',
      evidenceCount: 1,
      sourceCount: 1,
      sources: ['header'],
      corroborated: false,
    });
  });

  it('3 evidences / 1 source (same family, distinct identities) → single_signal', () => {
    const sq = computeSignalQuality([
      H('X-Frame-Options', 'DENY'),
      H('X-Powered-By', 'WP'),
      H('Server', 'nginx'),
    ]);
    expect(sq.evidenceCount).toBe(3);
    expect(sq.sourceCount).toBe(1);
    expect(sq.sources).toEqual(['header']);
    expect(sq.level).toBe('single_signal');
    expect(sq.corroborated).toBe(false);
  });

  it('2 evidences / 2 sources → corroborated', () => {
    const sq = computeSignalQuality([H('X-Powered-By', 'WP'), M('generator', 'WP')]);
    expect(sq).toEqual({
      level: 'corroborated',
      evidenceCount: 2,
      sourceCount: 2,
      sources: ['header', 'meta'],
      corroborated: true,
    });
  });

  it('4 evidences / 3 sources → strong', () => {
    const sq = computeSignalQuality([
      H('X-Powered-By', 'WP'),
      H('Server', 'nginx'),
      M('generator', 'WP'),
      S('https://cdn.example.com/a.js'),
    ]);
    expect(sq.evidenceCount).toBe(4);
    expect(sq.sourceCount).toBe(3);
    expect(sq.sources).toEqual(['header', 'meta', 'script_url']);
    expect(sq.level).toBe('strong');
    expect(sq.corroborated).toBe(true);
  });
});

describe('computeSignalQuality — deduplication (§6.C)', () => {
  it('two evidences sharing a canonical identity count once', () => {
    const sq = computeSignalQuality([H('X-Powered-By', 'WP'), H('X-Powered-By', 'WP')]);
    expect(sq.evidenceCount).toBe(1);
    expect(sq.sourceCount).toBe(1);
    expect(sq.level).toBe('single_signal');
  });

  it('a duplicated source_url still yields a single source (§6.D example)', () => {
    // /jquery.js, /jquery.min.js, /jquery-3.7.1.js → 3 evidences, 1 source family.
    const sq = computeSignalQuality([S('/jquery.js'), S('/jquery.min.js'), S('/jquery-3.7.1.js')]);
    expect(sq.evidenceCount).toBe(3);
    expect(sq.sourceCount).toBe(1);
    expect(sq.sources).toEqual(['script_url']);
    expect(sq.level).toBe('single_signal');
  });
});

describe('computeSignalQuality — determinism (§7)', () => {
  const EVIDENCE: EvidenceResponse[] = [
    H('X-Powered-By', 'WP'),
    M('generator', 'WP'),
    S('https://cdn.example.com/a.js'),
    L('https://x.example.me/style.css'),
  ];

  it('evidence arrival order does not change the result', () => {
    const a = computeSignalQuality(EVIDENCE);
    const b = computeSignalQuality([...EVIDENCE].reverse());
    expect(b).toEqual(a);
  });

  it('sources are returned sorted, not in arrival order', () => {
    // Arrival: header, meta, script_url, link → sorted: header, link, meta, script_url.
    const sq = computeSignalQuality(EVIDENCE);
    expect(sq.sources).toEqual(['header', 'link', 'meta', 'script_url']);
  });

  it('deep-equal output across permutations (JSON-stable)', () => {
    const base = computeSignalQuality([H('a', '1'), M('b', '2'), S('u'), RC('r', 'm'), L('l')]);
    const permuted = computeSignalQuality([L('l'), RC('r', 'm'), S('u'), M('b', '2'), H('a', '1')]);
    expect(JSON.stringify(base)).toBe(JSON.stringify(permuted));
  });
});

describe('computeSignalQuality — resource_content is a distinct family (§6.E)', () => {
  it('resource_url + resource_content are two independent sources', () => {
    const sq = computeSignalQuality([
      R('https://cdn.example.com/a.js'),
      RC('https://cdn.example.com/b.js', 'ng.'),
    ]);
    expect(sq.sourceCount).toBe(2);
    expect(sq.sources).toEqual(['resource_content', 'resource_url']);
    expect(sq.level).toBe('corroborated');
    expect(sq.corroborated).toBe(true);
  });

  it('resource_content alone is a single source', () => {
    const sq = computeSignalQuality([RC('https://cdn.example.com/b.js', 'ng.')]);
    expect(sq.sourceCount).toBe(1);
    expect(sq.sources).toEqual(['resource_content']);
    expect(sq.level).toBe('single_signal');
  });
});

describe('computeSignalQuality — derived & empty evidence (§6.A/§11)', () => {
  it('no evidence → no_evidence, zero sources', () => {
    const sq = computeSignalQuality([]);
    expect(sq).toEqual({
      level: 'no_evidence',
      evidenceCount: 0,
      sourceCount: 0,
      sources: [],
      corroborated: false,
    });
  });

  it('ignores derivedFrom — quality is attached to the detection itself', () => {
    // A derived detection with no direct evidence must NOT borrow its source's
    // strength (§6.A: React derived from a strong Next.js is still no_evidence).
    expect(computeSignalQuality([])).toEqual(
      expect.objectContaining({ level: 'no_evidence', sourceCount: 0 }),
    );
  });
});

describe('computeSignalQuality — version conflict is ignored (§6.F)', () => {
  it('presence quality is a pure function of evidence (no versionConflict param)', () => {
    const evidence = [H('X-Powered-By', 'WP'), M('generator', 'WP')];
    expect(computeSignalQuality(evidence).level).toBe('corroborated');
  });

  it('explainability keeps multi-source quality despite a version conflict', () => {
    // 2 direct evidences (header + meta) + an unrelated version conflict.
    const detection = makeDirect([H('X-Powered-By', 'WP'), M('generator', 'WordPress 6.0')], {
      version: null,
      versionConflict: true,
      versionEvidence: [H('X-Version', '6.0'), M('generator', '6.1')],
    });

    const explainability = getDetectionExplainability(detection);
    const sq = explainability.signalQuality;

    expect(sq).toBeDefined();
    expect(sq!.level).toBe('corroborated');
    expect(sq!.sourceCount).toBe(2);
    expect(sq!.sources).toEqual(['header', 'meta']);
    // §6.B: versionEvidence must NOT pollute presence evidence count.
    expect(sq!.evidenceCount).toBe(2);
    // Invariant: signal quality shares the same deduplicated evidence basis.
    expect(sq!.evidenceCount).toBe(explainability.evidenceCount);
  });
});

describe('getDetectionExplainability — signalQuality is attached (§8/§9)', () => {
  it('carries signalQuality for a single-source direct detection', () => {
    const ex = getDetectionExplainability(makeDirect([H('X-Powered-By', 'WP')]));
    expect(ex.signalQuality).toEqual(
      expect.objectContaining({
        level: 'single_signal',
        evidenceCount: 1,
        sourceCount: 1,
        sources: ['header'],
        corroborated: false,
      }),
    );
    expect(ex.signalQuality!.evidenceCount).toBe(ex.evidenceCount);
  });

  it('carries signalQuality for a multi-source direct detection', () => {
    const ex = getDetectionExplainability(
      makeDirect([H('X-Powered-By', 'WP'), M('generator', 'WP')]),
    );
    expect(ex.signalQuality).toEqual(
      expect.objectContaining({
        level: 'corroborated',
        evidenceCount: 2,
        sourceCount: 2,
        sources: ['header', 'meta'],
        corroborated: true,
      }),
    );
  });

  it('carries signalQuality for a derived detection with no direct evidence', () => {
    const ex = getDetectionExplainability(
      makeDirect([], { source: 'relationship', derivedFrom: NEXT_DERIVED }),
    );
    expect(ex.kind).toBe('derived');
    expect(ex.signalQuality).toEqual(
      expect.objectContaining({
        level: 'no_evidence',
        evidenceCount: 0,
        sourceCount: 0,
        sources: [],
        corroborated: false,
      }),
    );
  });

  it('counts direct evidence even on a derived detection (§12)', () => {
    const ex = getDetectionExplainability(
      makeDirect([H('X-Powered-By', 'WP'), M('generator', 'WP')], {
        source: 'relationship',
        derivedFrom: NEXT_DERIVED,
      }),
    );
    expect(ex.signalQuality!.level).toBe('corroborated');
    expect(ex.signalQuality!.evidenceCount).toBe(2);
    expect(ex.signalQuality).not.toEqual(expect.objectContaining({ level: 'no_evidence' }));
  });
});

describe('signalQualityLabel (§10/§11)', () => {
  const direct = makeDirect([H('a', '1')]);

  it('renders Single signal · 1 source', () => {
    const sq = computeSignalQuality([H('X-Powered-By', 'WP')]);
    expect(signalQualityLabel(direct, sq)).toBe('Single signal · 1 source');
  });

  it('renders Multi-source · 2 sources', () => {
    const sq = computeSignalQuality([H('X-Powered-By', 'WP'), M('generator', 'WP')]);
    expect(signalQualityLabel(direct, sq)).toBe('Multi-source · 2 sources');
  });

  it('renders Strong · 3 sources', () => {
    const sq = computeSignalQuality([
      H('X-Powered-By', 'WP'),
      M('generator', 'WP'),
      S('https://cdn.example.com/a.js'),
    ]);
    expect(signalQualityLabel(direct, sq)).toBe('Strong · 3 sources');
  });

  it('renders "Derived · no direct evidence" for a derived no-evidence detection (§11)', () => {
    const detection = makeDirect([], { source: 'relationship', derivedFrom: NEXT_DERIVED });
    const sq = computeSignalQuality(detection.evidence);
    expect(signalQualityLabel(detection, sq)).toBe('Derived · no direct evidence');
  });

  it('never emits a probability or percentage', () => {
    const sq = computeSignalQuality([
      H('X-Powered-By', 'WP'),
      M('generator', 'WP'),
      S('https://cdn.example.com/a.js'),
    ]);
    const label = signalQualityLabel(direct, sq);
    expect(label).not.toContain('%');
    expect(label).not.toContain('likely');
    expect(label).not.toContain('probability');
    expect(label).not.toContain('certain');
  });
});
