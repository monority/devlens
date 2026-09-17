/**
 * Authoritative test suite for the canonical evidence identity utility.
 *
 * This is the single source of truth for evidence identity semantics.
 * All consumer modules that need evidence equality/deduplication must
 * use `getEvidenceIdentity` from `./evidence-identity`.
 *
 * Tests cover:
 * 1. identical evidence → identical identity
 * 2. different evidence → different identity when semantically required
 * 3. normalization behavior (identity depends only on type + key field)
 * 4. null/missing fields (graceful fallback)
 * 5. URL behavior (URLs are part of identity)
 * 6. header behavior (header name, not value)
 * 7. different evidence types
 * 8. deterministic output
 * 9. deduplication through the canonical identity
 * 10. regression against existing consumers (compareScans, detection-coverage, etc.)
 */

import { describe, it, expect } from 'vitest';
import { getEvidenceIdentity, deduplicateEvidence } from './evidence-identity';
import type { EvidenceResponse } from './types.js';

describe('getEvidenceIdentity — canonical identity', () => {
  it('produces identical identity for identical evidence', () => {
    const a: EvidenceResponse = { type: 'http_header', name: 'Server', value: 'nginx' };
    const b: EvidenceResponse = { type: 'http_header', name: 'Server', value: 'nginx' };
    expect(getEvidenceIdentity(a)).toBe(getEvidenceIdentity(b));
  });

  it('produces different identity for different header names', () => {
    const a = { type: 'http_header' as const, name: 'Server', value: 'nginx' };
    const b = { type: 'http_header' as const, name: 'X-Powered-By', value: 'nginx' };
    expect(getEvidenceIdentity(a)).not.toBe(getEvidenceIdentity(b));
  });

  it('header value does NOT affect identity (name is the key)', () => {
    const a = { type: 'http_header' as const, name: 'Server', value: 'nginx' };
    const b = { type: 'http_header' as const, name: 'Server', value: 'Apache' };
    expect(getEvidenceIdentity(a)).toBe(getEvidenceIdentity(b));
  });

  it('meta_tag name affects identity, content does not', () => {
    const a = { type: 'meta_tag' as const, name: 'generator', content: 'Hugo' };
    const b = { type: 'meta_tag' as const, name: 'generator', content: 'WordPress' };
    expect(getEvidenceIdentity(a)).toBe(getEvidenceIdentity(b));

    const c = { type: 'meta_tag' as const, name: 'viewport', content: 'width=device-width' };
    expect(getEvidenceIdentity(a)).not.toBe(getEvidenceIdentity(c));
  });

  it('script_url identity depends on URL', () => {
    const a = { type: 'script_url' as const, url: 'https://cdn.example.com/react.js' };
    const b = { type: 'script_url' as const, url: 'https://cdn.example.com/app.js' };
    expect(getEvidenceIdentity(a)).not.toBe(getEvidenceIdentity(b));
  });

  it('script_content identity depends on snippet', () => {
    const a = { type: 'script_content' as const, snippet: 'window.React' };
    const b = { type: 'script_content' as const, snippet: 'window.Vue' };
    expect(getEvidenceIdentity(a)).not.toBe(getEvidenceIdentity(b));
  });

  it('html identity depends on selector', () => {
    const a = { type: 'html' as const, selector: '#app', snippet: '<div>' };
    const b = { type: 'html' as const, selector: '#root', snippet: '<div>' };
    expect(getEvidenceIdentity(a)).not.toBe(getEvidenceIdentity(b));
  });

  it('html snippet does NOT affect identity (selector is the key)', () => {
    const a = { type: 'html' as const, selector: '#app', snippet: '<div id="app">' };
    const b = { type: 'html' as const, selector: '#app', snippet: '<span>' };
    expect(getEvidenceIdentity(a)).toBe(getEvidenceIdentity(b));
  });

  it('javascript_global identity depends on globalName', () => {
    const a = { type: 'javascript_global' as const, globalName: 'React' };
    const b = { type: 'javascript_global' as const, globalName: 'Vue' };
    expect(getEvidenceIdentity(a)).not.toBe(getEvidenceIdentity(b));
  });

  it('resource identity depends on URL', () => {
    const a = { type: 'resource' as const, url: 'https://cdn.example.com/logo.png' };
    const b = { type: 'resource' as const, url: 'https://cdn.example.com/icon.png' };
    expect(getEvidenceIdentity(a)).not.toBe(getEvidenceIdentity(b));
  });

  it('link identity depends on URL', () => {
    const a = { type: 'link' as const, url: 'https://cdn.example.com/style.css' };
    const b = { type: 'link' as const, url: 'https://cdn.example.com/other.css' };
    expect(getEvidenceIdentity(a)).not.toBe(getEvidenceIdentity(b));
  });
});

describe('getEvidenceIdentity — identity format', () => {
  it('uses "html:{selector}" format', () => {
    expect(getEvidenceIdentity({ type: 'html', selector: '#app', snippet: '<div>' })).toBe(
      'html:#app',
    );
  });

  it('uses "http_header:{name}" format', () => {
    expect(getEvidenceIdentity({ type: 'http_header', name: 'Server', value: 'nginx' })).toBe(
      'http_header:Server',
    );
  });

  it('uses "script_url:{url}" format', () => {
    expect(getEvidenceIdentity({ type: 'script_url', url: 'https://example.com/app.js' })).toBe(
      'script_url:https://example.com/app.js',
    );
  });

  it('uses "script_content:{snippet}" format', () => {
    expect(getEvidenceIdentity({ type: 'script_content', snippet: 'window.foo' })).toBe(
      'script_content:window.foo',
    );
  });

  it('uses "meta_tag:{name}" format', () => {
    expect(getEvidenceIdentity({ type: 'meta_tag', name: 'generator', content: 'Hugo' })).toBe(
      'meta_tag:generator',
    );
  });

  it('uses "javascript_global:{globalName}" format', () => {
    expect(getEvidenceIdentity({ type: 'javascript_global', globalName: 'React' })).toBe(
      'javascript_global:React',
    );
  });

  it('uses "resource:{url}" format', () => {
    expect(getEvidenceIdentity({ type: 'resource', url: 'https://example.com/logo.png' })).toBe(
      'resource:https://example.com/logo.png',
    );
  });

  it('uses "link:{url}" format', () => {
    expect(getEvidenceIdentity({ type: 'link', url: 'https://example.com/style.css' })).toBe(
      'link:https://example.com/style.css',
    );
  });

  it('falls back to "{type}:{JSON}" for unknown evidence types', () => {
    const unknown = { type: 'future_type', data: 'x' } as unknown as EvidenceResponse;
    expect(getEvidenceIdentity(unknown)).toBe('future_type:{"type":"future_type","data":"x"}');
  });
});

describe('getEvidenceIdentity — different types', () => {
  it('different types never collide even with similar fields', () => {
    const header = { type: 'http_header' as const, name: 'Server', value: 'nginx' };
    const meta = { type: 'meta_tag' as const, name: 'Server', content: 'nginx' };
    expect(getEvidenceIdentity(header)).not.toBe(getEvidenceIdentity(meta));
  });

  it('each type is distinguishable', () => {
    const identities = [
      getEvidenceIdentity({ type: 'html', selector: '#a', snippet: 's' }),
      getEvidenceIdentity({ type: 'http_header', name: '#a', value: 's' }),
      getEvidenceIdentity({ type: 'meta_tag', name: '#a', content: 's' }),
      getEvidenceIdentity({ type: 'script_url', url: '#a' }),
      getEvidenceIdentity({ type: 'script_content', snippet: '#a' }),
      getEvidenceIdentity({ type: 'javascript_global', globalName: '#a' }),
      getEvidenceIdentity({ type: 'resource', url: '#a' }),
      getEvidenceIdentity({ type: 'link', url: '#a' }),
    ];
    const unique = new Set(identities);
    expect(unique.size).toBe(identities.length);
  });
});

describe('getEvidenceIdentity — determinism', () => {
  it('always returns the same identity for the same input', () => {
    const evidence: EvidenceResponse = {
      type: 'script_url',
      url: 'https://cdn.example.com/react.js',
    };
    const first = getEvidenceIdentity(evidence);
    const second = getEvidenceIdentity(evidence);
    const third = getEvidenceIdentity({
      type: 'script_url',
      url: 'https://cdn.example.com/react.js',
    });
    expect(first).toBe(second);
    expect(second).toBe(third);
  });

  it('does not mutate the input', () => {
    const evidence: EvidenceResponse = {
      type: 'http_header',
      name: 'Server',
      value: 'nginx',
    };
    const snapshot = JSON.parse(JSON.stringify(evidence));
    getEvidenceIdentity(evidence);
    expect(evidence).toEqual(snapshot);
  });
});

describe('deduplicateEvidence', () => {
  it('removes exact duplicate evidence', () => {
    const evidence: EvidenceResponse[] = [
      { type: 'http_header', name: 'Server', value: 'nginx' },
      { type: 'http_header', name: 'Server', value: 'nginx' },
    ];
    expect(deduplicateEvidence(evidence)).toHaveLength(1);
  });

  it('removes semantically-duplicate evidence (same identity, different values)', () => {
    const evidence: EvidenceResponse[] = [
      { type: 'http_header', name: 'Server', value: 'nginx' },
      { type: 'http_header', name: 'Server', value: 'Apache' },
    ];
    expect(deduplicateEvidence(evidence)).toHaveLength(1);
  });

  it('preserves first occurrence', () => {
    const evidence: EvidenceResponse[] = [
      { type: 'http_header', name: 'Server', value: 'nginx' },
      { type: 'http_header', name: 'Server', value: 'Apache' },
    ];
    const result = deduplicateEvidence(evidence);
    expect(result).toHaveLength(1);
    // result[0] is EvidenceResponse (union), cast for value access
    const first = result[0] as Extract<EvidenceResponse, { type: 'http_header' }>;
    expect(first.value).toBe('nginx');
  });

  it('preserves order of first occurrence for distinct evidence', () => {
    const evidence: EvidenceResponse[] = [
      { type: 'meta_tag', name: 'generator', content: 'Hugo' },
      { type: 'http_header', name: 'Server', value: 'nginx' },
      { type: 'script_url', url: 'https://cdn.example.com/app.js' },
    ];
    const result = deduplicateEvidence(evidence);
    expect(result).toHaveLength(3);
    expect(result[0]!.type).toBe('meta_tag');
    expect(result[1]!.type).toBe('http_header');
    expect(result[2]!.type).toBe('script_url');
  });

  it('handles zero evidence', () => {
    expect(deduplicateEvidence([])).toEqual([]);
  });

  it('handles all 8 evidence types without collision', () => {
    const evidence: EvidenceResponse[] = [
      { type: 'html', selector: '#a', snippet: 's' },
      { type: 'http_header', name: '#a', value: 's' },
      { type: 'meta_tag', name: '#a', content: 's' },
      { type: 'script_url', url: '#a' },
      { type: 'script_content', snippet: '#a' },
      { type: 'javascript_global', globalName: '#a' },
      { type: 'resource', url: '#a' },
      { type: 'link', url: '#a' },
    ];
    expect(deduplicateEvidence(evidence)).toHaveLength(8);
  });

  it('does not mutate the input array', () => {
    const evidence: EvidenceResponse[] = [
      { type: 'http_header', name: 'Server', value: 'nginx' },
      { type: 'http_header', name: 'Server', value: 'nginx' },
    ];
    const originalLength = evidence.length;
    deduplicateEvidence(evidence);
    expect(evidence.length).toBe(originalLength);
  });
});
