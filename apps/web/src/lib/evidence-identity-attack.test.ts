/**
 * Step 63 — Phase 2 attack: evidence identity consistency.
 *
 * The detector layer (`getEvidenceKey`) produces canonical keys that
 * include ALL distinguishing fields for each evidence type. The web
 * layer (`getEvidenceIdentity`) is supposed to produce the SAME identity
 * for the same evidence. But there is a known divergence documented in
 * the Step 63 reconnaissance:
 *
 * - `getEvidenceKey` (detector):  `http_header|name|value`, `meta_tag|name|content`, `html|selector|snippet`
 * - `getEvidenceIdentity` (web):  `http_header:{name}|{value}`, `meta_tag:{name}|{content}`, `html:{selector}|{snippet}`
 *
 * The web layer previously omitted value/content/snippet from the identity
 * key and did not lowercase URL fields. This meant the web layer's
 * `deduplicateEvidence` could silently drop evidence items that the
 * detector layer intentionally kept distinct.
 *
 * FIXED (Step 63): `getEvidenceIdentity` now includes all distinguishing
 * fields and lowercases URLs, mirroring the canonical `getEvidenceKey`.
 * The "DROPS ... (DATA LOSS)" tests below assert the corrected behavior
 * (both distinct evidence items survive) and MUST pass.
 */

import { describe, it, expect } from 'vitest';
import { getEvidenceIdentity, deduplicateEvidence } from './evidence-identity.js';
import type { EvidenceResponse } from './types.js';

// ─── Helper builders ────────────────────────────────────────────────

function httpHeader(name: string, value: string): EvidenceResponse {
  return { type: 'http_header', name, value };
}

function metaTag(name: string, content: string): EvidenceResponse {
  return { type: 'meta_tag', name, content };
}

function htmlEvidence(selector: string, snippet: string): EvidenceResponse {
  return { type: 'html', selector, snippet };
}

// ─── Phase 2 Attack: Detector vs Web identity consistency ────────────

describe('Step 63 Phase 2 — evidence identity consistency', () => {
  describe('http_header: value is part of identity', () => {
    it('Server:nginx and Server:Apache have DIFFERENT identities (FIXED)', () => {
      const nginx = httpHeader('Server', 'nginx');
      const apache = httpHeader('Server', 'Apache');

      // The detector layer (getEvidenceKey) includes the value:
      //   'http_header|Server|nginx'  vs  'http_header|Server|Apache'
      // These are DIFFERENT — the detector layer keeps both.
      //
      // The web layer (getEvidenceIdentity) now matches:
      //   'http_header:Server|nginx'  !==  'http_header:Server|Apache'
      expect(getEvidenceIdentity(nginx)).not.toBe(getEvidenceIdentity(apache));
    });

    it('deduplicateEvidence keeps both Server:nginx and Server:Apache (NO DATA LOSS)', () => {
      const evidence: EvidenceResponse[] = [
        httpHeader('Server', 'nginx'),
        httpHeader('Server', 'Apache'),
      ];

      const result = deduplicateEvidence(evidence);

      // The detector layer keeps BOTH (different getEvidenceKey).
      // The web layer now agrees — both survive.
      expect(result).toHaveLength(2);
    });
  });

  describe('meta_tag: content is part of identity', () => {
    it('meta_tag:generator=WordPress and meta_tag:generator=Hugo have DIFFERENT identities (FIXED)', () => {
      const wordpress = metaTag('generator', 'WordPress 6.5');
      const hugo = metaTag('generator', 'Hugo 0.1');

      // The detector layer (getEvidenceKey) includes content:
      //   'meta_tag|generator|WordPress 6.5'  vs  'meta_tag|generator|Hugo 0.1'
      // The web layer now matches:
      //   'meta_tag:generator|WordPress 6.5'  !==  'meta_tag:generator|Hugo 0.1'
      expect(getEvidenceIdentity(wordpress)).not.toBe(getEvidenceIdentity(hugo));
    });

    it('deduplicateEvidence keeps both meta_tag values (NO DATA LOSS)', () => {
      const evidence: EvidenceResponse[] = [
        metaTag('generator', 'WordPress 6.5'),
        metaTag('generator', 'Hugo 0.1'),
      ];

      const result = deduplicateEvidence(evidence);

      // Correct behavior: result should have length 2.
      expect(result).toHaveLength(2);
    });
  });

  describe('html: snippet is part of identity', () => {
    it('html:#app with different snippets have DIFFERENT identities (FIXED)', () => {
      const a = htmlEvidence('#app', '<div class="foo">');
      const b = htmlEvidence('#app', '<span class="bar">');

      // The detector layer (getEvidenceKey) includes snippet:
      //   'html|#app|<div class="foo">'  vs  'html|#app|<span class="bar">'
      // The web layer now matches:
      //   'html:#app|<div class="foo">'  !==  'html:#app|<span class="bar">'
      expect(getEvidenceIdentity(a)).not.toBe(getEvidenceIdentity(b));
    });

    it('deduplicateEvidence keeps html evidence with different snippet (NO DATA LOSS)', () => {
      const evidence: EvidenceResponse[] = [
        htmlEvidence('#app', '<div class="foo">'),
        htmlEvidence('#app', '<span class="bar">'),
      ];

      const result = deduplicateEvidence(evidence);

      // Correct behavior: result should have length 2.
      expect(result).toHaveLength(2);
    });
  });
});

// ─── Phase 2 Attack: End-to-end pipeline data loss ──────────────────

describe('Step 63 Phase 2 — end-to-end evidence loss through pipeline', () => {
  it('DeduplicatingDetector keeps distinct Server headers, but getScanDetectionResults drops one', async () => {
    // This test constructs a realistic scenario: two sub-detectors detect
    // the same technology from different Server header values. The
    // DeduplicatingDetector correctly keeps both as distinct evidence
    // (different getEvidenceKey). But the web layer's
    // getScanDetectionResults calls deduplicateEvidence which uses the
    // weaker getEvidenceIdentity, silently dropping one.
    //
    // We test the full gap: detector layer identity vs web layer identity.

    // Simulate what DeduplicatingDetector produces: two evidence items
    // with the same header name but different values.
    // (The DeduplicatingDetector would keep both because getEvidenceKey
    // produces 'http_header|Server|nginx' and 'http_header|Server|Apache'.)
    const evidenceFromDetector: EvidenceResponse[] = [
      httpHeader('Server', 'nginx'),
      httpHeader('Server', 'Apache'),
    ];

    // The web layer's deduplicateEvidence would drop one.
    const afterWebDedup = deduplicateEvidence(evidenceFromDetector);

    // After the fix, both should survive.
    expect(afterWebDedup).toHaveLength(2);
    expect(afterWebDedup.map((e) => e.type)).toEqual(['http_header', 'http_header']);
  });
});
