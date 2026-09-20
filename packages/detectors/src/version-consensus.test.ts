/**
 * Step 72 — Version consensus engine unit tests (§21 §22 §23).
 *
 * Covers:
 *   - the evidence-type → VersionSource modality mapping (§22);
 *   - `collectVersionObservations` provenance (one observation per versioned
 *     detection; unversioned detections yield nothing; §22 negatives);
 *   - `resolveVersionConsensus`: agree×2/×3, strong-single, single-conflict,
 *     none, determinism/order-independence (§10/§12/§13);
 *   - §23 integration shapes A/B/C/D.
 *
 * Extraction hardening (§7 invalid-regex, §8 normalization, §9 reserved
 * words) is pinned in `version.test.ts`.
 */

import { describe, it, expect } from 'vitest';
import type { Evidence, Technology, VersionObservation, VersionSource } from '@devlens/core';
import {
  createTechnologyId,
  createTechnologyCategory,
  createTechnologyVersion,
  createConfidence,
  createUrl,
  createDetection,
} from '@devlens/core';
import {
  resolveVersionConsensus,
  collectVersionObservations,
  evidenceTypeToVersionSource,
} from './version-consensus.js';

function makeTechnology(id = 'test', name = 'Test', category = 'framework'): Technology {
  return { id: createTechnologyId(id), name, category: createTechnologyCategory(category) };
}

/** Builds an `Evidence` item of the given type (covers all 9 discriminants). */
function ev(type: Evidence['type'], url = 'https://example.com/x'): Evidence {
  switch (type) {
    case 'http_header':
      return { type, name: 'X-Powered-By', value: 'asp.net' };
    case 'meta_tag':
      return { type, name: 'generator', content: 'TestCMS 1.0' };
    case 'script_url':
      return { type, url: createUrl(url) };
    case 'script_content':
      return { type, snippet: 'window.__APP__ = {};' };
    case 'resource':
      return { type, url: createUrl(url) };
    case 'resource_content':
      return {
        type,
        url: createUrl(url),
        resourceType: 'script',
        match: '@angular/core',
        snippet: '...',
      };
    case 'link':
      return { type, url: createUrl(url) };
    case 'html':
      return { type, selector: 'div', snippet: '<div>' };
    case 'javascript_global':
      return { type, globalName: '__NUXT__' };
  }
}

/** Builds a `VersionObservation` from a version string + its evidence. */
function obs(version: string, evidence: Evidence): VersionObservation {
  return {
    version: createTechnologyVersion(version),
    source: evidenceTypeToVersionSource(evidence),
    evidence,
  };
}

describe('evidenceTypeToVersionSource (§22 sources mapping)', () => {
  it('maps every evidence type to exactly one VersionSource modality', () => {
    expect(evidenceTypeToVersionSource(ev('http_header'))).toBe('header');
    expect(evidenceTypeToVersionSource(ev('meta_tag'))).toBe('meta');
    expect(evidenceTypeToVersionSource(ev('script_url'))).toBe('script_url');
    expect(evidenceTypeToVersionSource(ev('script_content'))).toBe('content');
    expect(evidenceTypeToVersionSource(ev('resource'))).toBe('resource_url');
    expect(evidenceTypeToVersionSource(ev('resource_content'))).toBe('resource_content');
    expect(evidenceTypeToVersionSource(ev('link'))).toBe('link');
    expect(evidenceTypeToVersionSource(ev('html'))).toBe('content');
    expect(evidenceTypeToVersionSource(ev('javascript_global'))).toBe('content');
  });

  it('is total — every Evidence discriminant is covered (no silent undefined)', () => {
    // Drives the same invariant through a full pass: the mapping must never
    // return a non-VersionSource value for any real evidence type.
    const types: Evidence['type'][] = [
      'http_header',
      'meta_tag',
      'script_url',
      'script_content',
      'resource',
      'resource_content',
      'link',
      'html',
      'javascript_global',
    ];
    const sources = types.map((t) => ev(t)).map(evidenceTypeToVersionSource);
    expect(sources.every((s): s is VersionSource => typeof s === 'string')).toBe(true);
  });
});

describe('collectVersionObservations (§22 provenance)', () => {
  const tech = makeTechnology();

  it('yields one observation per versioned detection; skips unversioned detections', () => {
    const versionedA = createDetection(
      tech,
      createConfidence(90),
      [ev('http_header')],
      createTechnologyVersion('1.2.3'),
    );
    const unversioned = createDetection(tech, createConfidence(80), [ev('resource')]);
    const versionedB = createDetection(
      tech,
      createConfidence(70),
      [ev('meta_tag')],
      createTechnologyVersion('1.2.3'),
    );

    const observations = collectVersionObservations([versionedA, unversioned, versionedB]);

    expect(observations).toHaveLength(2);
    expect(observations.map((o) => String(o.version))).toEqual(['1.2.3', '1.2.3']);
    expect(observations.map((o) => o.source)).toEqual(['header', 'meta']);
  });

  it('§22 negative — a resource matched but with no extracted version yields no observation', () => {
    // `/jquery-foo.js` matched as a resource fingerprint, but no version was
    // extracted (no version rule on the jQuery signature) → it must NOT
    // produce an observation, so the consensus layer never fabricates one.
    const jquery = createDetection(tech, createConfidence(80), [
      ev('resource', 'https://x/jquery-foo.js'),
    ]);
    expect(jquery.version).toBe(null);
    expect(collectVersionObservations([jquery])).toEqual([]);
  });

  it('§22 negative — /assets/v2/app.js carries a `v2` that is never treated as a version', () => {
    // The path segment `v2` is a cache-busting / folder naming convention,
    // not a version signal. With no version rule on the matching signature,
    // no observation is produced.
    const asset = createDetection(tech, createConfidence(70), [
      ev('resource', 'https://x/assets/v2/app.js'),
    ]);
    expect(asset.version).toBe(null);
    expect(collectVersionObservations([asset])).toEqual([]);
  });
});

describe('resolveVersionConsensus (§10 §12 §13 — deterministic consensus)', () => {
  it('×2 — two agreeing observations resolve to the version (single source)', () => {
    const headerA = ev('http_header');
    const headerB = ev('http_header', 'https://example.com/again');
    const result = resolveVersionConsensus([obs('6.4.2', headerA), obs('6.4.2', headerB)]);

    expect(result.version).toBe('6.4.2');
    expect(result.conflict).toBe(false);
    expect(result.source).toBe('header');
  });

  it('×3 — three agreeing observations resolve to the version', () => {
    const result = resolveVersionConsensus([
      obs('1.21.6', ev('http_header')),
      obs('1.21.6', ev('meta_tag')),
      obs('1.21.6', ev('script_url')),
    ]);
    expect(result.version).toBe('1.21.6');
    expect(result.conflict).toBe(false);
  });

  it('strong-single — a single observation resolves to its version (no conflict)', () => {
    const result = resolveVersionConsensus([obs('2.8.4', ev('http_header'))]);
    expect(result.version).toBe('2.8.4');
    expect(result.conflict).toBe(false);
    expect(result.source).toBe('header');
  });

  it('single-conflict — two disagreeing versions → version null, conflict true, both evidence retained', () => {
    const a = ev('http_header');
    const b = ev('meta_tag');
    const result = resolveVersionConsensus([obs('1.2.3', a), obs('2.0.0', b)]);

    expect(result.version).toBe(null);
    expect(result.conflict).toBe(true);
    // The disagreeing evidence must remain inspectable (§11), not be dropped.
    expect(result.evidence).toEqual(expect.arrayContaining([a, b]));
    expect(result.evidence).toHaveLength(2);
    // A conflict has no single authoritative source.
    expect(result.source).toBeUndefined();
  });

  it('none — zero observations → no version, no conflict', () => {
    const result = resolveVersionConsensus([]);
    expect(result.version).toBe(null);
    expect(result.conflict).toBe(false);
    expect(result.source).toBeUndefined();
    expect(result.evidence).toEqual([]);
  });

  it('mixed-source agreement — same version from two different sources → version kept, source undefined', () => {
    const result = resolveVersionConsensus([
      obs('3.1.0', ev('http_header')),
      obs('3.1.0', ev('meta_tag')),
    ]);
    expect(result.version).toBe('3.1.0');
    expect(result.conflict).toBe(false);
    // Ambiguous which source yielded the truth → source omitted (§4/§12).
    expect(result.source).toBeUndefined();
  });

  it('determinism — reversed input order yields an identical result', () => {
    const observations = [
      obs('1.2.3', ev('http_header')),
      obs('1.2.3', ev('meta_tag')),
      obs('1.2.3', ev('script_url')),
    ];
    const forward = resolveVersionConsensus(observations);
    const reversed = resolveVersionConsensus([...observations].reverse());
    expect(reversed).toEqual(forward);
  });

  it('conflict evidence is de-duplicated and sorted (order-independent)', () => {
    const a = ev('http_header');
    const b = ev('meta_tag');
    const first = resolveVersionConsensus([obs('1.0.0', a), obs('2.0.0', b)]);
    const second = resolveVersionConsensus([obs('2.0.0', b), obs('1.0.0', a)]);
    expect(second).toEqual(first);
    expect(first.evidence).toEqual(second.evidence);
  });
});

describe('§23 integration cases (end-to-end consensus shapes)', () => {
  it('Case A — header + meta agree on 6.4.2 → version resolved, no conflict, no single source', () => {
    const result = resolveVersionConsensus([
      obs('6.4.2', ev('http_header', 'https://x/blog-post-1')),
      obs('6.4.2', ev('meta_tag')),
    ]);
    expect(result).toEqual({
      version: '6.4.2',
      conflict: false,
      evidence: expect.arrayContaining([
        expect.objectContaining({ type: 'http_header' }),
        expect.objectContaining({ type: 'meta_tag' }),
      ]),
    });
    // source is omitted on mixed-source agreement — assert explicitly (toEqual
    // with `undefined` keys is fragile, so check absence separately).
    expect(result.source).toBeUndefined();
  });

  it('Case B — header (6.4.2) vs resource (8.2) disagree → conflict', () => {
    const result = resolveVersionConsensus([
      obs('6.4.2', ev('http_header')),
      obs('8.2', ev('resource_content')),
    ]);
    expect(result.version).toBe(null);
    expect(result.conflict).toBe(true);
  });

  it('Case C — single source (script_url) → version + source', () => {
    const result = resolveVersionConsensus([obs('7', ev('script_url'))]);
    expect(result.version).toBe('7');
    expect(result.source).toBe('script_url');
  });

  it('Case D — no versioned observations → null, no conflict, no provenance', () => {
    const result = resolveVersionConsensus([]);
    expect(result.version).toBe(null);
    expect(result.conflict).toBe(false);
    expect(result.source).toBeUndefined();
    expect(result.evidence).toEqual([]);
  });
});

describe('DeduplicatingDetector → resolveVersionConsensus wiring (§4/§11 provenance)', () => {
  it('attaches versionConflict + versionSource + versionEvidence to the detection', () => {
    const tech = makeTechnology('wp', 'WordPress', 'cms');
    // Two disagreeing observations for the same technology → conflict.
    const conflicting = [
      createDetection(
        tech,
        createConfidence(90),
        [ev('http_header')],
        createTechnologyVersion('6.4.2'),
      ),
      createDetection(
        tech,
        createConfidence(80),
        [ev('meta_tag')],
        createTechnologyVersion('6.5.0'),
      ),
    ];

    const observations = collectVersionObservations(conflicting);
    const resolved = resolveVersionConsensus(observations);

    expect(resolved.conflict).toBe(true);
    expect(resolved.version).toBe(null);

    // The Detection built from this consensus carries the observable flag
    // (no fake version, no placeholder — §13).
    const fromConsensus = createDetection(
      tech,
      createConfidence(90),
      [ev('http_header'), ev('meta_tag')],
      resolved.version,
      {
        ...(resolved.conflict ? { versionConflict: resolved.conflict } : {}),
        ...(resolved.source ? { versionSource: resolved.source } : {}),
        ...(resolved.evidence.length > 0 ? { versionEvidence: [...resolved.evidence] } : {}),
      },
    );
    expect(fromConsensus.versionConflict).toBe(true);
    expect(fromConsensus.version).toBe(null);
    expect(fromConsensus.versionSource).toBeUndefined();
    expect(fromConsensus.versionEvidence).toHaveLength(2);
  });

  it('agreement carries versionSource + versionEvidence, omits versionConflict', () => {
    const tech = makeTechnology('angular', 'Angular', 'framework');
    const detection = createDetection(
      tech,
      createConfidence(95),
      [ev('resource_content', 'https://x/main.js')],
      createTechnologyVersion('16.2.0'),
    );
    const resolved = resolveVersionConsensus(collectVersionObservations([detection]));
    expect(resolved.version).toBe('16.2.0');
    expect(resolved.conflict).toBe(false);
    expect(resolved.source).toBe('resource_content');

    const built = createDetection(
      tech,
      createConfidence(95),
      [ev('resource_content', 'https://x/main.js')],
      resolved.version,
      {
        ...(resolved.conflict ? { versionConflict: resolved.conflict } : {}),
        ...(resolved.source ? { versionSource: resolved.source } : {}),
        ...(resolved.evidence.length > 0 ? { versionEvidence: [...resolved.evidence] } : {}),
      },
    );
    expect(built.version).toBe('16.2.0');
    expect(built.versionSource).toBe('resource_content');
    expect(built.versionConflict).toBeUndefined();
    expect(built.versionEvidence).toHaveLength(1);
  });
});
