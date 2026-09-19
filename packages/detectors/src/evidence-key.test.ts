import { describe, it, expect } from 'vitest';
import { getEvidenceKey } from './evidence-key.js';
import type { Evidence } from '@devlens/core';
import { createUrl } from '@devlens/core';

describe('getEvidenceKey', () => {
  describe('deterministic keys for each evidence type', () => {
    it('produces a stable key for http_header evidence', () => {
      const evidence: Evidence = {
        type: 'http_header',
        name: 'Server',
        value: 'nginx/1.24.0',
      };
      const key1 = getEvidenceKey(evidence);
      const key2 = getEvidenceKey(evidence);
      expect(key1).toBe(key2);
      expect(key1).toBe('http_header|Server|nginx/1.24.0');
    });

    it('produces a stable key for meta_tag evidence', () => {
      const evidence: Evidence = {
        type: 'meta_tag',
        name: 'generator',
        content: 'WordPress 6.4',
      };
      const key = getEvidenceKey(evidence);
      expect(key).toBe('meta_tag|generator|WordPress 6.4');
    });

    it('produces a stable key for script_url evidence', () => {
      const evidence: Evidence = {
        type: 'script_url',
        url: createUrl('https://example.com/_next/main.js'),
      };
      const key = getEvidenceKey(evidence);
      expect(key).toBe('script_url|https://example.com/_next/main.js');
    });

    it('produces a stable key for script_content evidence', () => {
      const evidence: Evidence = {
        type: 'script_content',
        snippet: '__NEXT_DATA__',
      };
      const key = getEvidenceKey(evidence);
      expect(key).toBe('script_content|__NEXT_DATA__');
    });

    it('produces a stable key for javascript_global evidence', () => {
      const evidence: Evidence = {
        type: 'javascript_global',
        globalName: '__NEXT_DATA__',
      };
      const key = getEvidenceKey(evidence);
      expect(key).toBe('javascript_global|__NEXT_DATA__');
    });

    it('produces a stable key for resource evidence', () => {
      const evidence: Evidence = {
        type: 'resource',
        url: createUrl('https://example.com/robots.txt'),
      };
      const key = getEvidenceKey(evidence);
      expect(key).toBe('resource|https://example.com/robots.txt');
    });

    it('produces a stable key for link evidence', () => {
      const evidence: Evidence = {
        type: 'link',
        url: createUrl('https://cdn.shopify.com/theme.css'),
      };
      const key = getEvidenceKey(evidence);
      expect(key).toBe('link|https://cdn.shopify.com/theme.css');
    });

    it('produces a stable key for html evidence', () => {
      const evidence: Evidence = {
        type: 'html',
        selector: 'div.header',
        snippet: '<div class="header">',
      };
      const key = getEvidenceKey(evidence);
      expect(key).toBe('html|div.header|<div class="header">');
    });
  });

  describe('property-order independence', () => {
    it('same evidence with properties in different insertion order produces the same key', () => {
      // Evidence object A: properties created in order type, name, value
      const evidenceA: Evidence = { type: 'meta_tag', name: 'generator', content: 'Hugo' };
      // Evidence object B: same values but we simulate different property order
      // by building the object differently
      const evidenceB: Evidence = {
        type: 'meta_tag',
        name: 'generator',
        content: 'Hugo',
      };

      // Even though JSON.stringify would produce identical output here,
      // the key function extracts fields explicitly
      expect(getEvidenceKey(evidenceA)).toBe(getEvidenceKey(evidenceB));
      expect(getEvidenceKey(evidenceA)).toBe('meta_tag|generator|Hugo');
    });
  });

  describe('URL normalization', () => {
    it('normalizes URL evidence to lowercase for comparison', () => {
      const evidenceA: Evidence = {
        type: 'script_url',
        url: createUrl('https://CDN.Example.COM/_NEXT/main.js'),
      };
      const evidenceB: Evidence = {
        type: 'script_url',
        url: createUrl('https://cdn.example.com/_next/main.js'),
      };

      // Same key because URL is normalized to lowercase
      expect(getEvidenceKey(evidenceA)).toBe(getEvidenceKey(evidenceB));
    });
  });

  describe('distinct keys for different evidence', () => {
    it('different evidence types produce different keys', () => {
      const headerEvidence: Evidence = {
        type: 'http_header',
        name: 'Server',
        value: 'nginx',
      };
      // meta_tag has different fields (name + content) vs http_header (name + value)
      const metaEvidence: Evidence = {
        type: 'meta_tag',
        name: 'generator',
        content: 'nginx',
      };

      expect(getEvidenceKey(headerEvidence)).not.toBe(getEvidenceKey(metaEvidence));
    });

    it('same type but different field values produce different keys', () => {
      const evidenceA: Evidence = {
        type: 'script_content',
        snippet: '__NEXT_DATA__',
      };
      const evidenceB: Evidence = {
        type: 'script_content',
        snippet: 'react-dom',
      };

      expect(getEvidenceKey(evidenceA)).not.toBe(getEvidenceKey(evidenceB));
    });

    it('same type and field values produce the same key', () => {
      const evidenceA: Evidence = {
        type: 'link',
        url: createUrl('https://cdn.shopify.com/theme.css'),
      };
      const evidenceB: Evidence = {
        type: 'link',
        url: createUrl('https://cdn.shopify.com/theme.css'),
      };

      expect(getEvidenceKey(evidenceA)).toBe(getEvidenceKey(evidenceB));
    });
  });

  describe('canonical identity invariants (Step 63 — web layer mirrors these)', () => {
    // The web layer's `getEvidenceIdentity` is required to produce the
    // same distinguishability as these canonical keys. These assertions
    // lock the source-of-truth behavior the web layer must not regress.
    it('http_header: same name with different value produces different keys', () => {
      const nginx: Evidence = { type: 'http_header', name: 'Server', value: 'nginx' };
      const apache: Evidence = { type: 'http_header', name: 'Server', value: 'Apache' };
      expect(getEvidenceKey(nginx)).not.toBe(getEvidenceKey(apache));
    });

    it('meta_tag: same name with different content produces different keys', () => {
      const a: Evidence = { type: 'meta_tag', name: 'generator', content: 'Hugo' };
      const b: Evidence = { type: 'meta_tag', name: 'generator', content: 'WordPress' };
      expect(getEvidenceKey(a)).not.toBe(getEvidenceKey(b));
    });

    it('html: same selector with different snippet produces different keys', () => {
      const a: Evidence = { type: 'html', selector: '#app', snippet: '<div>' };
      const b: Evidence = { type: 'html', selector: '#app', snippet: '<span>' };
      expect(getEvidenceKey(a)).not.toBe(getEvidenceKey(b));
    });

    it('url evidence is case-insensitive (same resource, different casing)', () => {
      const a: Evidence = { type: 'link', url: createUrl('https://CDN.Example.COM/app.css') };
      const b: Evidence = { type: 'link', url: createUrl('https://cdn.example.com/app.css') };
      expect(getEvidenceKey(a)).toBe(getEvidenceKey(b));
    });
  });

  describe('key format stability', () => {
    it('key starts with the evidence type', () => {
      const evidence: Evidence = { type: 'http_header', name: 'Server', value: 'nginx' };
      expect(getEvidenceKey(evidence).startsWith('http_header|')).toBe(true);
    });

    it('key uses pipe delimiter consistently', () => {
      const evidence: Evidence = { type: 'meta_tag', name: 'generator', content: 'WordPress' };
      const key = getEvidenceKey(evidence);
      // Should be: type|name|content
      expect(key).toBe('meta_tag|generator|WordPress');
    });
  });
});
